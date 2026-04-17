/**
 * event-actions.ts
 *
 * 会の完了処理・完了済みレコード生成のロジックを集約する。
 *
 * 設計方針:
 *   - UI（page.tsx）側は buildPastEventRecord でレコードを組み立て、
 *     saveCompletionData で保存するだけの状態に寄せる
 *   - Supabase の知識はこのファイルに持ち込まない
 *     （クラウド操作は user-settings.ts → supabase-user-store.ts に委譲）
 *
 * 写真保存の二層構造（saveCompletionData 参照）:
 *   ローカル: localStorage に photoDataUrl（base64）を保存。容量超過時は自動除去。
 *   クラウド: Supabase Storage に PUT → path → past_events.photo_url に保存。
 *             アップロード失敗時も会の記録は保存される。
 *             詳細: supabase-user-store.ts の insertPastEventCloud 参照。
 */

import type { PastEventRecord, UserSettings, FavoriteStore } from './user-settings'
import {
  saveUserSettings,
  savePastEventCloud,
  saveFavoriteStoreCloud,
  removeFavoriteStoreCloud,
  type SaveResult,
} from './user-settings'

// ── 完了済みレコード生成 ─────────────────────────────────────────────────────

export type BuildPastEventRecordParams = {
  eventName: string
  eventDate: string
  storeName: string
  storeId?: string
  storeLink?: string
  storeArea?: string
  storeGenre?: string
  memo: string
  hasPhoto: boolean
  /**
   * base64 JPEG（compressImageToDataUrl で圧縮済み）。
   *
   * 役割:
   *   - UI プレビュー表示
   *   - localStorage フォールバック保存（photoDataUrl として記録に含める）
   *   - Supabase Storage アップロードの元データ（insertPastEventCloud が内部で使う）
   *
   * 長期保存前提にしない。クラウド側は Storage path（PastEventRecord.photoUrl）を使う。
   */
  photoDataUrl?: string
  participants: string[]
}

/**
 * 清算完了データから PastEventRecord を生成する。
 *
 * 生成されるレコードの photoDataUrl は「ローカル保存・プレビュー用」の一時データ。
 * クラウド保存時（insertPastEventCloud）は photoDataUrl を Storage に PUT し、
 * 取得した path を past_events.photo_url に書く（PastEventRecord.photoUrl は未設定のまま）。
 */
export function buildPastEventRecord(params: BuildPastEventRecordParams): PastEventRecord {
  return {
    id: crypto.randomUUID(),
    title: params.eventName || '名称未設定',
    eventDate: params.eventDate,
    storeName: params.storeName,
    storeId: params.storeId,
    storeLink: params.storeLink,
    storeArea: params.storeArea,
    storeGenre: params.storeGenre,
    memo: params.memo,
    hasPhoto: params.hasPhoto,
    photoDataUrl: params.photoDataUrl,
    participants: params.participants,
    createdAt: new Date().toISOString(),
  }
}

// ── 保存ヘルパー ─────────────────────────────────────────────────────────────

/**
 * 完了済みレコードを userSettings に追加して保存する。
 *
 * @returns SaveResult（page.tsx 側で CompleteResult に変換する）
 *
 * CLOUD-MIGRATION: localStorage.setItem → Supabase INSERT
 */
export function savePastEventRecord(
  current: UserSettings,
  record: PastEventRecord,
): { result: SaveResult; next: UserSettings } {
  const next: UserSettings = {
    ...current,
    pastEventRecords: [record, ...current.pastEventRecords],
  }
  const result = saveUserSettings(next)
  return { result, next }
}

/**
 * お気に入り店舗を userSettings に追加して保存する（重複は先頭に移動）。
 * localStorage 保存後、クラウドへも fire-and-forget で同期する。
 */
export function saveFavoriteStore(
  current: UserSettings,
  store: FavoriteStore,
): { result: SaveResult; next: UserSettings } {
  const next: UserSettings = {
    ...current,
    favoriteStores: [
      store,
      ...current.favoriteStores.filter((s) => s.id !== store.id),
    ],
  }
  const result = saveUserSettings(next)
  void saveFavoriteStoreCloud(store)
  return { result, next }
}

/**
 * お気に入り店舗をトグルする（追加 or 削除）。
 *
 * 追加の場合は先頭に挿入し、同一 ID の重複エントリは除去する。
 * 削除の場合は一覧から除外する。
 * localStorage 保存後、クラウドへも fire-and-forget で同期する。
 */
export function toggleFavoriteStore(
  current: UserSettings,
  store: Pick<FavoriteStore, 'id' | 'name' | 'area' | 'genre' | 'link'> & Partial<Pick<FavoriteStore, 'imageUrl' | 'station' | 'priceRange' | 'subGenres'>>,
  isFavorite: boolean,
): { next: UserSettings } {
  const storeKey = store.id
  if (isFavorite) {
    const next: UserSettings = {
      ...current,
      favoriteStores: current.favoriteStores.filter((f) => f.id !== storeKey),
    }
    saveUserSettings(next)
    void removeFavoriteStoreCloud(storeKey)
    return { next }
  } else {
    const newEntry: FavoriteStore = { ...store, savedAt: new Date().toISOString() }
    const next: UserSettings = {
      ...current,
      favoriteStores: [
        newEntry,
        ...current.favoriteStores.filter((f) => f.id !== storeKey),
      ],
    }
    saveUserSettings(next)
    void saveFavoriteStoreCloud(newEntry)
    return { next }
  }
}

/**
 * 完了済みレコード追加 + お気に入り登録（任意）をまとめて保存する。
 *
 * 清算完了時の保存フロー:
 *   1. buildPastEventRecord でレコードを生成（event-actions.ts）
 *   2. saveCompletionData で保存（この関数）
 *   3. removeSavedEvent で進行中一覧から削除（event-store.ts）
 *   4. setUserSettings で React state を更新（page.tsx）
 *
 * ローカル保存（localStorage）:
 *   - 会名 / 日程 / 店舗 / 参加者 / メモ / 写真（base64 = photoDataUrl）
 *   - 容量超過時は photoDataUrl だけ除去して再保存（SaveResult.photoStripped = true）
 *   - 保存失敗時は SaveResult.ok = false
 *
 * クラウド保存（Supabase / fire-and-forget）:
 *   - 写真は DB に base64 を持たず、Storage に PUT して path を past_events.photo_url へ
 *   - Storage アップロード失敗時は photo_url = null で記録だけ保存
 *   - クラウド保存の成否はローカル保存の CompleteResult に影響しない
 *
 * @returns SaveResult（ローカル保存の結果）と更新後の UserSettings
 */
export function saveCompletionData(
  current: UserSettings,
  record: PastEventRecord,
  favoriteStore?: FavoriteStore,
): { result: SaveResult; next: UserSettings } {
  const withRecord: UserSettings = {
    ...current,
    pastEventRecords: [record, ...current.pastEventRecords],
    ...(favoriteStore
      ? {
          favoriteStores: [
            favoriteStore,
            ...current.favoriteStores.filter((s) => s.id !== favoriteStore.id),
          ],
        }
      : {}),
  }
  const result = saveUserSettings(withRecord)

  // 写真が除かれた場合は state にも反映できるよう stripped 版を返す
  const next: UserSettings = result.photoStripped
    ? {
        ...withRecord,
        pastEventRecords: withRecord.pastEventRecords.map((r) => ({
          ...r,
          photoDataUrl: undefined,
        })),
      }
    : withRecord

  // クラウド同期（fire-and-forget）
  void savePastEventCloud(record)
  if (favoriteStore) void saveFavoriteStoreCloud(favoriteStore)

  return { result, next }
}
