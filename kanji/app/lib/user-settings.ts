/**
 * user-settings.ts
 *
 * ユーザー設定（お気に入り店・完了済みの会）の型定義と永続化を一元管理する。
 *
 * 設計方針:
 *   - 登録不要・匿名ファースト
 *   - 現在は localStorage のみ。将来 Supabase 連携に差し替えられる構造
 *   - saveMode で現在の保存状態を表現
 *   - page.tsx / component からは直接 localStorage を触らず、
 *     このファイルの関数経由でのみアクセスする
 *
 * CLOUD-MIGRATION ガイド:
 *   localStorage.setItem  → Supabase: profiles / user_data テーブルへの INSERT/UPDATE
 *   localStorage.getItem  → Supabase: SELECT + React Query / SWR キャッシュ
 *   photoDataUrl (base64) → Supabase Storage に PUT して URL を保持する
 *   SaveMode 'cloud' が有効になったとき、loadUserSettings / saveUserSettings を
 *   Supabase クライアント呼び出しに差し替えるだけで移行できる構造を保つ。
 */

const STORAGE_KEY = 'kanji_user_settings'

// ── 保存モード ─────────────────────────────────────────────────────────────────

/**
 * none      : まだ保存設定していない（デフォルト）
 * local     : この端末のみ保存（localStorage）
 * cloud     : アカウント連携済み（将来実装）
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
}

// ── 完了済みの会の記録 ─────────────────────────────────────────────────────────
// 清算完了時に event-actions.ts の buildPastEventRecord で生成し、
// saveCompletionData で pastEventRecords の先頭に追加する。
//
// CLOUD-MIGRATION: Supabase past_events テーブルへ移行予定
//   photoDataUrl (base64) → Supabase Storage の URL に置き換える

export type PastEventRecord = {
  id: string
  title: string         // 会の名前
  eventDate: string     // YYYY-MM-DD
  storeName: string
  storeId?: string      // お気に入り登録に使う
  storeLink?: string
  storeArea?: string
  storeGenre?: string
  memo: string
  hasPhoto: boolean
  photoDataUrl?: string // base64 data URL（端末ローカル保存）
  participants?: string[] // 参加者名一覧
  createdAt: string
}

// ── 設定型 ────────────────────────────────────────────────────────────────────

export type UserSettings = {
  /** この端末の保存モード */
  saveMode: SaveMode
  /** 表示名（幹事名と共有 or 独立して使う想定） */
  displayName: string
  /** お気に入り店一覧（将来実装。今は常に []） */
  favoriteStores: FavoriteStore[]
  /** 会の記録一覧（将来実装。今は常に []） */
  pastEventRecords: PastEventRecord[]
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  saveMode: 'none',
  displayName: '',
  favoriteStores: [],
  pastEventRecords: [],
}

// ── 永続化 ────────────────────────────────────────────────────────────────────
// CLOUD-MIGRATION: loadUserSettings → Supabase SELECT（anonymous auth の UID でフェッチ）
// CLOUD-MIGRATION: saveUserSettings → Supabase UPDATE（onConflict: user_id）

export function loadUserSettings(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_USER_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
      favoriteStores: parsed.favoriteStores ?? [],
      pastEventRecords: parsed.pastEventRecords ?? [],
    }
  } catch {
    return { ...DEFAULT_USER_SETTINGS }
  }
}

export type SaveResult =
  | { ok: true; photoStripped: false }   // 完全成功
  | { ok: true; photoStripped: true }    // 写真だけ除いて保存成功
  | { ok: false; photoStripped: false }  // 保存失敗

/**
 * UserSettings を localStorage へ書き込む。
 * 戻り値で成否と写真ストリップの有無が分かる。
 *
 * ok: true, photoStripped: false → 完全成功
 * ok: true, photoStripped: true  → 容量超過のため写真なしで保存（詳細画面で「写真（データなし）」表示）
 * ok: false                      → 保存失敗（容量が深刻に不足）
 */
export function saveUserSettings(settings: UserSettings): SaveResult {
  if (typeof window === 'undefined') return { ok: false, photoStripped: false }

  const tryWrite = (data: UserSettings): boolean => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      return true
    } catch {
      return false
    }
  }

  // まず全データで保存を試みる
  if (tryWrite(settings)) return { ok: true, photoStripped: false }

  // QuotaExceededError の可能性 — photoDataUrl だけ除いて再試行
  // hasPhoto: true は残すので、詳細画面で「写真（データなし）」として表示される
  const stripped: UserSettings = {
    ...settings,
    pastEventRecords: settings.pastEventRecords.map(r => ({ ...r, photoDataUrl: undefined })),
  }
  if (tryWrite(stripped)) return { ok: true, photoStripped: true }

  return { ok: false, photoStripped: false }
}

export function clearUserSettings(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
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
