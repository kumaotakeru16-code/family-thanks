/**
 * anonymous-id.ts
 *
 * Supabase 認証なしで「この端末のユーザー」を識別するための匿名 UUID を管理する。
 *
 * 設計方針:
 *   - localStorage に保存。なければ crypto.randomUUID() で生成して保存する。
 *   - 正規の Supabase Auth 導入後は、ここを auth.uid() に差し替えるだけでよい。
 *   - past_events / favorite_stores テーブルの anon_user_id カラムに使用する。
 *
 * CLOUD-MIGRATION:
 *   Supabase Auth 導入時は getAnonId() を auth.getUser().id に置き換える。
 *   その際、既存レコードの anon_user_id を実 user_id に UPDATE するマイグレーションが必要。
 */

const ANON_ID_KEY = 'kanji_anon_id'

/**
 * 匿名ユーザー ID を取得する（なければ生成して保存する）。
 * SSR 環境（window なし）では空文字を返す。
 */
export function getAnonId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const existing = localStorage.getItem(ANON_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(ANON_ID_KEY, id)
    return id
  } catch {
    // localStorage アクセス拒否（プライベートブラウジング等）
    return ''
  }
}
