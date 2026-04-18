/**
 * analytics.ts
 *
 * 匿名ユーザーのアクション記録と簡易ダッシュボード集計。
 *
 * ── Supabase テーブル設計 ────────────────────────────────────────────────────
 *
 * CREATE TABLE analytics_events (
 *   id         bigserial PRIMARY KEY,
 *   user_id    text        NOT NULL,
 *   event_name text        NOT NULL,
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 * ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "anon open" ON analytics_events FOR ALL USING (true) WITH CHECK (true);
 * CREATE INDEX analytics_events_user_id_idx    ON analytics_events(user_id);
 * CREATE INDEX analytics_events_event_name_idx ON analytics_events(event_name);
 *
 * ── 設計方針 ─────────────────────────────────────────────────────────────────
 *
 *   trackEvent   : fire-and-forget（void で呼ぶ）。失敗してもアプリを止めない。
 *   loadDashboard: 設定画面の開発者向けダッシュボード用。自分の user_id を除外して集計。
 *                  クエリ 2 本（全期間 + 直近7日）を並列実行し JS 側で集計する。
 */

import { createClient } from '@supabase/supabase-js'
import { getAnonId } from './storage/anonymous-id'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── イベント名 ────────────────────────────────────────────────────────────────

export type AnalyticsEventName =
  | 'app_open'
  | 'start_from_dates'
  | 'start_from_store'
  | 'create_event'
  | 'view_store_suggestion'
  | 'confirm_store'
  | 'complete_settlement'

const TRACKED_EVENTS: AnalyticsEventName[] = [
  'app_open',
  'start_from_dates',
  'start_from_store',
  'create_event',
  'view_store_suggestion',
  'complete_settlement',
]

// ── 除外対象 user_id ──────────────────────────────────────────────────────────
// 運営の複数端末（PC / スマホ / 別ブラウザ）の anon_user_id をここに列挙する。
// loadDashboard に渡す myUserId（現在の端末）とまとめて除外される。
// 追加: localStorage の kanji_anon_id の値をここにコピーする。
export const EXCLUDED_USER_IDS: string[] = [
  // Android
  'cb11867f-c3a8-4b62-a810-a761a553c6a8', // Chrome
  '255d84c4-d6bf-459d-9d06-153d791391b7', // Chrome secret
  '0d803784-6b85-4303-a290-0381eb554af4', // Edge
  '2a6e09a4-6b31-4071-a837-c364b335475e', // LINE
  'e130402a-f4a1-4070-862c-e64ed20c284a', // Brave

  // PC
  '19de35cc-fcf3-476c-9cbf-5895a479754e', // Chrome
]

// ── 書き込み ──────────────────────────────────────────────────────────────────

/**
 * イベントを記録する。fire-and-forget（void で呼ぶ）。
 * getAnonId() が空の場合（SSR / プライベートブラウジング）は何もしない。
 */
export async function trackEvent(eventName: AnalyticsEventName): Promise<void> {
  if (typeof window === 'undefined') return
  const userId = getAnonId()
  if (!userId) return
  // エラーは無視（アナリティクスの失敗でアプリを止めない）
  await supabase.from('analytics_events').insert({ user_id: userId, event_name: eventName })
}

// ── 読み込み（ダッシュボード用） ───────────────────────────────────────────────

export type AnalyticsSlice = {
  /** ユニークユーザー数（自分除く） */
  totalUsers: number
  /** app_open したユニークユーザー数 */
  appOpenUsers: number
  /** start_from_dates + start_from_store のユニークユーザー数（重複除去） */
  startUsers: number
  /** start_from_dates のユニークユーザー数 */
  startDatesUsers: number
  /** start_from_store のユニークユーザー数 */
  startStoreUsers: number
  /** create_event のユニークユーザー数 */
  createEventUsers: number
  /** view_store_suggestion のユニークユーザー数 */
  storeViewUsers: number
  /** complete_settlement のユニークユーザー数 */
  completeUsers: number
}

export type AnalyticsDashboard = {
  /** 全期間 */
  all: AnalyticsSlice
  /** 直近7日 */
  week: AnalyticsSlice
}

type RawRow = { user_id: string; event_name: string }

/** rows を集計して AnalyticsSlice を返す */
function processRows(rows: RawRow[] | null): AnalyticsSlice {
  const all = rows ?? []
  const byEvent: Record<string, Set<string>> = {}
  const allUsers = new Set<string>()

  for (const row of all) {
    allUsers.add(row.user_id)
    if (!byEvent[row.event_name]) byEvent[row.event_name] = new Set()
    byEvent[row.event_name].add(row.user_id)
  }

  const count = (name: string) => byEvent[name]?.size ?? 0

  // start の union（日程 OR お店を押したユーザー）
  const datesSet = byEvent['start_from_dates'] ?? new Set<string>()
  const storeSet = byEvent['start_from_store'] ?? new Set<string>()
  const startUnion = new Set([...datesSet, ...storeSet])

  return {
    totalUsers: allUsers.size,
    appOpenUsers: count('app_open'),
    startUsers: startUnion.size,
    startDatesUsers: count('start_from_dates'),
    startStoreUsers: count('start_from_store'),
    createEventUsers: count('create_event'),
    storeViewUsers: count('view_store_suggestion'),
    completeUsers: count('complete_settlement'),
  }
}

/**
 * 自分（複数端末含む）を除いたユーザー数をダッシュボード用に集計して返す。
 * クエリ 2 本（全期間 + 直近7日）を並列実行し、JS 側で除外フィルターを適用する。
 * SSR では null を返す。
 *
 * 除外対象: EXCLUDED_USER_IDS（定数）＋ myUserId（現在の端末の anon_id）
 */
export async function loadDashboard(myUserId: string): Promise<AnalyticsDashboard | null> {
  if (typeof window === 'undefined') return null

  const excludedSet = new Set([...EXCLUDED_USER_IDS, myUserId].filter(Boolean))
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [allRes, weekRes] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('user_id, event_name')
      .in('event_name', TRACKED_EVENTS),
    supabase
      .from('analytics_events')
      .select('user_id, event_name')
      .in('event_name', TRACKED_EVENTS)
      .gt('created_at', sevenDaysAgo),
  ])

  const applyExclusion = (rows: RawRow[] | null): RawRow[] => {
    const raw = rows ?? []
    const filtered = raw.filter((r) => !excludedSet.has(r.user_id))
    console.log('[analytics] excluded ids:', excludedSet.size)
    console.log('[analytics] raw rows:', raw.length, '→ filtered:', filtered.length)
    return filtered
  }

  return {
    all: processRows(applyExclusion(allRes.data)),
    week: processRows(applyExclusion(weekRes.data)),
  }
}

// ── 表示ヘルパー ──────────────────────────────────────────────────────────────

/** n / d を 0–100 の整数パーセントで返す。d = 0 なら 0。 */
export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}
