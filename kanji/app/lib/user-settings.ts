/**
 * user-settings.ts
 *
 * ユーザー設定を管理するユーティリティ。
 *
 * 設計方針:
 *   - 登録不要・匿名ファースト
 *   - 今は localStorage のみ。将来 Supabase 連携に差し替えられる構造
 *   - saveMode で現在の保存状態を表現
 *   - FavoriteStore / PastEventRecord の型だけ先に定義しておく（将来の実装に備える）
 */

const STORAGE_KEY = 'kanji_user_settings'

// ── 保存モード ─────────────────────────────────────────────────────────────────

/**
 * none      : まだ保存設定していない（デフォルト）
 * local     : この端末のみ保存（localStorage）
 * cloud     : アカウント連携済み（将来実装）
 */
export type SaveMode = 'none' | 'local' | 'cloud'

// ── お気に入り店（将来実装） ────────────────────────────────────────────────────

export type FavoriteStore = {
  id: string          // Hot Pepper ID など
  name: string
  area: string
  genre: string
  link: string
  savedAt: string     // ISO 8601
}

// ── 会の記録（将来実装） ────────────────────────────────────────────────────────

export type PastEventRecord = {
  id: string
  title: string         // 会の名前
  eventDate: string     // YYYY-MM-DD
  storeName: string
  memo: string
  hasPhoto: boolean
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

export function saveUserSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
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
