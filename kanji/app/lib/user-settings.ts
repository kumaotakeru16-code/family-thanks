/**
 * user-settings.ts
 *
 * ユーザー設定（お気に入り店・完了済みの会）の型定義と永続化を一元管理する。
 *
 * 設計方針:
 *   - 登録不要・匿名ファースト
 *   - 保存先は storage/index.ts の storageAdapter に委譲する
 *   - page.tsx / component からは直接 storageAdapter を触らず、
 *     このファイルの関数経由でのみアクセスする
 *
 * 保存責務:
 *   - saveMode      : 端末の保存モード（none / local / cloud）
 *   - displayName   : 表示名
 *   - favoriteStores: お気に入り店一覧
 *   - pastEventRecords: 完了済みの会の記録
 *     （buildPastEventRecord で生成 → saveCompletionData で先頭追加）
 *
 * CLOUD-MIGRATION ガイド:
 *   storage/index.ts で storageAdapter を cloudStorageAdapter に切り替えるだけで
 *   このファイルの読み書きが Supabase に移行する。
 *   以下の個別対応も必要:
 *     photoDataUrl (base64) → Supabase Storage に PUT して URL に置き換える
 *     pastEventRecords      → Supabase: past_events テーブル (user_id + event_id)
 *     favoriteStores        → Supabase: favorite_stores テーブル (user_id + store_id)
 */

import { storageAdapter, STORAGE_KEYS } from './storage'
import {
  loadFavoriteStoresCloud,
  loadPastEventsCloud,
  upsertFavoriteStoreCloud,
  deleteFavoriteStoreCloud,
  insertPastEventCloud,
  deletePastEventCloud,
  getPastEventPhotoSignedUrl,
} from './supabase-user-store'

// ── 保存モード ─────────────────────────────────────────────────────────────────

/**
 * none  : まだ保存設定していない（デフォルト）
 * local : この端末のみ保存（localStorage）
 * cloud : アカウント連携済み（将来実装）
 */
export type SaveMode = 'none' | 'local' | 'cloud'

// ── お気に入り店 ───────────────────────────────────────────────────────────────
// CLOUD-MIGRATION: Supabase favorite_stores テーブルへ移行予定

export type FavoriteStore = {
  id: string          // Hot Pepper ID など
  name: string
  area: string
  genre: string
  link: string
  savedAt: string     // ISO 8601
  // store_only / Phase2 ジャンル拡張で保存される追加情報（任意）
  imageUrl?: string    // Hot Pepper 店舗画像 URL
  station?: string     // 最寄り駅（access 文字列をそのまま）
  priceRange?: string  // 価格帯ラベル（例: "4,001〜5,000円"）
}

// ── 完了済みの会の記録 ─────────────────────────────────────────────────────────
// 清算完了時に event-actions.ts の buildPastEventRecord で生成し、
// saveCompletionData で pastEventRecords の先頭に追加する。
//
// 写真保存の二層構造:
//   photoDataUrl : base64（ローカル表示用・localStorage フォールバック）
//                  localStorage 容量超過時は saveUserSettings が自動除去する
//   photoUrl     : Supabase Storage path（長期保存用）
//                  クラウドからロードしたレコードはここに path が入る
//                  表示時は getPhotoSignedUrl(photoUrl) で signed URL を生成する
//
// 両フィールドの使い分け:
//   localStorage  → photoDataUrl を使って <img src> に直接渡せる
//   Supabase 側   → photoUrl (Storage path) から signed URL を生成して表示する
//   どちらもない   → hasPhoto: true でも写真は表示できない（容量超過 or 未同期）

export type PastEventRecord = {
  id: string
  title: string           // 会の名前
  eventDate: string       // YYYY-MM-DD
  storeName: string
  storeId?: string        // お気に入り登録に使う
  storeLink?: string
  storeArea?: string
  storeGenre?: string
  memo: string
  hasPhoto: boolean
  /** base64 JPEG（端末ローカル保存・一時的な表示用）。長期保存前提にしない。 */
  photoDataUrl?: string
  /** Supabase Storage の path（past-event-photos バケット内）。
   *  表示時は getPhotoSignedUrl() で signed URL に変換する。
   *  CLOUD-MIGRATION: Auth 導入後もパス規則以外は変わらない。 */
  photoUrl?: string
  participants?: string[] // 参加者名一覧
  settlementResults?: { name: string; total: number }[] // 清算結果（名前・支払額）
  /** 送金先情報（参加者ページで表示するために保存） */
  paymentInfo?: {
    paypayId?: string
    bankName?: string
    branchName?: string
    accountType?: string
    accountNumber?: string
    accountName?: string
  }
  createdAt: string
}

// ── 設定型 ────────────────────────────────────────────────────────────────────

export type UserSettings = {
  /** この端末の保存モード */
  saveMode: SaveMode
  /** 表示名（幹事名と共有 or 独立して使う想定） */
  displayName: string
  /** お気に入り店一覧 */
  favoriteStores: FavoriteStore[]
  /** 完了済みの会の記録一覧 */
  pastEventRecords: PastEventRecord[]
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  saveMode: 'none',
  displayName: '',
  favoriteStores: [],
  pastEventRecords: [],
}

// ── 永続化 ────────────────────────────────────────────────────────────────────
// 保存先の実装詳細は storageAdapter に閉じ込める。
// CLOUD-MIGRATION: storage/index.ts で storageAdapter を差し替えるだけで移行可能。

export function loadUserSettings(): UserSettings {
  const data = storageAdapter.read<Partial<UserSettings>>(STORAGE_KEYS.USER_SETTINGS)
  if (!data) return { ...DEFAULT_USER_SETTINGS }
  return {
    ...DEFAULT_USER_SETTINGS,
    ...data,
    favoriteStores: data.favoriteStores ?? [],
    pastEventRecords: data.pastEventRecords ?? [],
  }
}

export type SaveResult =
  | { ok: true; photoStripped: false }   // 完全成功
  | { ok: true; photoStripped: true }    // 写真だけ除いて保存成功
  | { ok: false; photoStripped: false }  // 保存失敗

/**
 * UserSettings を保存する。
 * 戻り値で成否と写真ストリップの有無が分かる。
 *
 * ok: true, photoStripped: false → 完全成功
 * ok: true, photoStripped: true  → 容量超過のため写真なしで保存
 *                                   （詳細画面で「写真（データなし）」表示）
 * ok: false                      → 保存失敗（容量が深刻に不足）
 *
 * 写真ストリップのリトライ戦略はここに集約する。
 * storageAdapter.write は容量超過を false で返すだけで、リトライの知識を持たない。
 */
export function saveUserSettings(settings: UserSettings): SaveResult {
  // まず全データで保存を試みる
  if (storageAdapter.write(STORAGE_KEYS.USER_SETTINGS, settings)) {
    return { ok: true, photoStripped: false }
  }

  // QuotaExceededError の可能性 — photoDataUrl だけ除いて再試行
  // hasPhoto: true は残すので、詳細画面で「写真（データなし）」として表示される
  const stripped: UserSettings = {
    ...settings,
    pastEventRecords: settings.pastEventRecords.map(r => ({ ...r, photoDataUrl: undefined })),
  }
  if (storageAdapter.write(STORAGE_KEYS.USER_SETTINGS, stripped)) {
    return { ok: true, photoStripped: true }
  }

  return { ok: false, photoStripped: false }
}

export function clearUserSettings(): void {
  storageAdapter.remove(STORAGE_KEYS.USER_SETTINGS)
}

// ── クラウド同期 ──────────────────────────────────────────────────────────────
// 保存先は supabase-user-store.ts に閉じ込める。
// page.tsx は直接 supabase-user-store.ts を import しない。
//
// 同期戦略:
//   書き込み: saveUserSettings（localStorage）が成功した後に fire-and-forget で呼ぶ
//             → event-actions.ts が saveXxxCloud() を void で呼ぶ
//   読み込み: page.tsx の mount useEffect で loadUserSettingsCloud() を呼び、
//             クラウドにデータがあれば React state にマージする

/**
 * クラウドから favoriteStores / pastEventRecords をロードして返す。
 * SSR ではクライアントが存在しないため null を返す。
 *
 * page.tsx の mount useEffect から 1 度だけ呼び、
 * 戻り値を setUserSettings でマージする。
 */
export async function loadUserSettingsCloud(): Promise<Pick<UserSettings, 'favoriteStores' | 'pastEventRecords'> | null> {
  if (typeof window === 'undefined') return null
  const [favoriteStores, pastEventRecords] = await Promise.all([
    loadFavoriteStoresCloud(),
    loadPastEventsCloud(),
  ])
  return { favoriteStores, pastEventRecords }
}

/**
 * お気に入り店舗をクラウドに upsert する。
 * fire-and-forget で呼ぶ（void）。
 */
export async function saveFavoriteStoreCloud(store: FavoriteStore): Promise<void> {
  await upsertFavoriteStoreCloud(store)
}

/**
 * お気に入り店舗をクラウドから削除する。
 * fire-and-forget で呼ぶ（void）。
 */
export async function removeFavoriteStoreCloud(storeId: string): Promise<void> {
  await deleteFavoriteStoreCloud(storeId)
}

/**
 * 完了済みの会の記録をクラウドに保存する。
 * fire-and-forget で呼ぶ（void）。
 *
 * 写真がある場合（record.photoDataUrl）は Storage にアップロードし、
 * past_events.photo_url に Storage path を保存する。
 * アップロード失敗時は photo_url = null で記録だけ保存する。
 * base64（photoDataUrl）は DB に保存しない。
 */
export async function savePastEventCloud(record: PastEventRecord): Promise<void> {
  await insertPastEventCloud(record)
}

/**
 * 完了済みの会の記録をクラウドから削除する。
 * fire-and-forget で呼ぶ（void）。
 */
export async function removePastEventCloud(eventId: string): Promise<void> {
  await deletePastEventCloud(eventId)
}

/**
 * Supabase Storage path から期限付き signed URL を生成する。
 *
 * 用途: 完了済み会の詳細・一覧画面で写真を表示するときに呼ぶ。
 *   - private bucket のため photo_url (path) をそのまま <img src> に使えない
 *   - page.tsx / components は Storage を直接触らず、この関数経由で使う
 *
 * @param storagePath PastEventRecord.photoUrl（Storage path）
 * @returns signed URL（失敗時は null）
 */
export async function getPhotoSignedUrl(storagePath: string): Promise<string | null> {
  return getPastEventPhotoSignedUrl(storagePath)
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

export function saveModeLabel(mode: SaveMode): string {
  if (mode === 'cloud') return 'アカウント連携済み'
  if (mode === 'local') return 'この端末に保存中'
  return '未設定'
}

export function saveModeDescription(mode: SaveMode): string {
  if (mode === 'cloud') return 'お気に入りや会の記録をどの端末でも見られます'
  if (mode === 'local') return 'この端末だけに保存されています'
  return 'データはこの端末にのみ保存されています'
}
