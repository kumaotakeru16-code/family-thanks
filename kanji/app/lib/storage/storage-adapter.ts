/**
 * storage-adapter.ts
 *
 * 保存先に依存しない読み書きインターフェース。
 * user-settings / organizer-settings / event-store はすべてこの interface 経由で保存する。
 *
 * 現在の実装: local-storage-adapter.ts（localStorage）
 * 将来の実装: cloud-storage-adapter.ts（Supabase）
 *
 * CLOUD-MIGRATION:
 *   local-storage-adapter → cloud-storage-adapter への切り替えは
 *   storage/index.ts の export 1 行を変えるだけで完了する。
 *   各 util（user-settings.ts 等）は保存先を意識しない。
 */

// ── ストレージキー ─────────────────────────────────────────────────────────────
// すべての永続化キーをここに集約する。
// util ファイル内で文字列リテラルを直接書かず、必ずこの定数を参照する。
//
// CLOUD-MIGRATION:
//   キーはそのままテーブル名 / コレクション名のヒントとして使える:
//     kanji_user_settings      → Supabase: user_settings テーブル (user_id で 1 行)
//     kanji_organizer_settings → Supabase: organizer_settings テーブル (user_id で 1 行)
//     kanji_events             → Supabase: in_progress_events テーブル (user_id + event_id)

export const STORAGE_KEYS = {
  /** ユーザー設定（お気に入り店・完了済みの会・保存モード） */
  USER_SETTINGS: 'kanji_user_settings',
  /** 幹事設定（送金先・傾斜係数・幹事名） */
  ORGANIZER_SETTINGS: 'kanji_organizer_settings',
  /** 進行中の会一覧（清算完了時に削除） */
  EVENTS: 'kanji_events',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// ── アダプタインターフェース ──────────────────────────────────────────────────────

/**
 * 保存先に依存しない読み書きインターフェース。
 *
 * read / write / remove の 3 操作のみ。
 * JSON シリアライズ / デシリアライズは実装側の責務。
 */
export interface StorageAdapter {
  /**
   * キーに対応するデータを読み込む。
   * 存在しない・パースエラー・SSR 時はすべて null を返す。
   *
   * CLOUD-MIGRATION: localStorage.getItem → Supabase SELECT (eq user_id)
   */
  read<T>(key: StorageKey): T | null

  /**
   * データをキーに書き込む。
   * 成功すれば true、容量不足等で失敗すれば false を返す。
   * 戻り値を使うことで、呼び出し側がリトライ戦略を持てる（写真ストリップ等）。
   *
   * CLOUD-MIGRATION: localStorage.setItem → Supabase UPSERT (onConflict: user_id)
   */
  write<T>(key: StorageKey, value: T): boolean

  /**
   * キーを削除する。
   *
   * CLOUD-MIGRATION: localStorage.removeItem → Supabase DELETE (eq user_id)
   */
  remove(key: StorageKey): void
}
