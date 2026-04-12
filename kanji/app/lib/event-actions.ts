/**
 * event-actions.ts
 *
 * 会の完了処理・完了済みレコード生成のロジックを集約する。
 *
 * 設計方針:
 *   - UI（page.tsx）側は buildPastEventRecord でレコードを組み立て、
 *     saveUserSettings で保存するだけの状態に寄せる
 *   - 将来クラウド保存へ移行するときは、saveUserSettings の実装を
 *     Supabase INSERT に差し替えるだけで完了できる構造を保つ
 *
 * CLOUD-MIGRATION:
 *   - photoDataUrl（base64） → Supabase Storage にアップロードして URL で持つ
 *   - buildPastEventRecord の戻り値に photoUrl フィールドを追加し
 *     photoDataUrl と置き換える想定
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
  /** base64 JPEG（圧縮済み）。将来は Storage URL に置き換え予定 */
  photoDataUrl?: string
  participants: string[]
}

/**
 * 清算完了データから PastEventRecord を生成する。
 *
 * 何が保存されるか:
 *   - 会名・日程・店舗情報（名前/ID/リンク/エリア/ジャンル）
 *   - 参加者名一覧
 *   - メモ
 *   - 写真（base64、容量超過時は SettlementSummaryTable 側で除去済み）
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
  store: Pick<FavoriteStore, 'id' | 'name' | 'area' | 'genre' | 'link'>,
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
 * 保存される情報:
 *   - 会名 / 日程 / 店舗（名前・ID・リンク・エリア・ジャンル）
 *   - 参加者名一覧 / メモ / 写真（base64、容量超過時は除去）
 *   - お気に入り登録（favoriteStore が渡された場合）
 *
 * localStorage 保存後、クラウドへも fire-and-forget で同期する。
 * @returns SaveResult と更新後の UserSettings
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
