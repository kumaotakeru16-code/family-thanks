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
 *   metadata   jsonb,
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 * -- migration (既存テーブルへの追加):
 * -- ALTER TABLE analytics_events ADD COLUMN metadata jsonb;
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
  // store funnel
  | 'store_only_start'
  | 'store_conditions_submit'
  | 'store_candidates_loaded'
  | 'store_candidate_switch'
  | 'store_reason_view'
  | 'hotpepper_link_click'
  | 'favorite_store_click'
  | 'store_only_to_event_create'
  | 'share_store_info'
  // revisit / retention
  | 'resume_existing_event'
  | 'repeat_store_search'
  | 'revisit_store_candidates'

const TRACKED_EVENTS: AnalyticsEventName[] = [
  'app_open',
  'start_from_dates',
  'start_from_store',
  'create_event',
  'view_store_suggestion',
  'complete_settlement',
  // store funnel
  'store_only_start',
  'store_candidates_loaded',
  'hotpepper_link_click',
  'favorite_store_click',
  'store_only_to_event_create',
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
export async function trackEvent(
  eventName: AnalyticsEventName,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === 'undefined') return
  const userId = getAnonId()
  if (!userId) return
  // エラーは無視（アナリティクスの失敗でアプリを止めない）
  const row: Record<string, unknown> = { user_id: userId, event_name: eventName }
  if (metadata !== undefined) row.metadata = metadata
  await supabase.from('analytics_events').insert(row)
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

// ── Retention 集計 ────────────────────────────────────────────────────────────

const RETENTION_EVENTS: AnalyticsEventName[] = [
  'app_open',
  'store_only_start',
  'store_candidates_loaded',
  'hotpepper_link_click',
  'favorite_store_click',
  'create_event',
  'complete_settlement',
  'resume_existing_event',
  'repeat_store_search',
  'revisit_store_candidates',
]

export type RetentionSlice = {
  /** 分析対象の全ユーザー数（除外済み） */
  totalUsers: number
  /** 2日以上 app_open したユーザー数 */
  returningUsers: number
  /** 再訪率（%） */
  returningRate: number
  /** store_only_start を1回以上したユーザー数 */
  storeStarters: number
  /** 2日以上 store_only_start したユーザー数 */
  storeReturningUsers: number
  /** 店探し再訪率（%） */
  storeReturningRate: number
  /** 再訪ユーザー（app_open 2日以上）の中での各イベント到達者数 */
  returningActivity: {
    storeOnlyStart: number
    storeCandidatesLoaded: number
    hotpepperClick: number
    favoriteClick: number
    createEvent: number
    completeSettlement: number
    resumeExistingEvent: number
    repeatStoreSearch: number
    revisitStoreCandidates: number
  }
}

export type RetentionDashboard = {
  all: RetentionSlice
  week: RetentionSlice
}

type RawRetentionRow = { user_id: string; event_name: string; created_at: string }

function processRetentionRows(rows: RawRetentionRow[]): RetentionSlice {
  const toDay = (iso: string) => iso.slice(0, 10) // 'YYYY-MM-DD'

  // user_id ごとにイベントをグループ化
  const byUser: Record<string, RawRetentionRow[]> = {}
  for (const r of rows) {
    if (!byUser[r.user_id]) byUser[r.user_id] = []
    byUser[r.user_id].push(r)
  }

  let returningUsers = 0
  let storeReturningUsers = 0
  const storeStartersSet = new Set<string>()
  const returningUserSet = new Set<string>()

  for (const [userId, events] of Object.entries(byUser)) {
    // app_open の日付ユニーク数
    const appOpenDays = new Set(
      events.filter(e => e.event_name === 'app_open').map(e => toDay(e.created_at))
    )
    if (appOpenDays.size >= 2) {
      returningUsers++
      returningUserSet.add(userId)
    }

    // store_only_start の日付ユニーク数
    const storeStartDays = new Set(
      events.filter(e => e.event_name === 'store_only_start').map(e => toDay(e.created_at))
    )
    if (storeStartDays.size >= 1) storeStartersSet.add(userId)
    if (storeStartDays.size >= 2) storeReturningUsers++
  }

  const totalUsers = Object.keys(byUser).length
  const storeStarters = storeStartersSet.size

  // 再訪ユーザーの行動内訳
  const ra = {
    storeOnlyStart: 0, storeCandidatesLoaded: 0,
    hotpepperClick: 0, favoriteClick: 0,
    createEvent: 0, completeSettlement: 0,
    resumeExistingEvent: 0, repeatStoreSearch: 0, revisitStoreCandidates: 0,
  }
  for (const userId of returningUserSet) {
    const names = new Set((byUser[userId] ?? []).map(e => e.event_name))
    if (names.has('store_only_start'))         ra.storeOnlyStart++
    if (names.has('store_candidates_loaded'))   ra.storeCandidatesLoaded++
    if (names.has('hotpepper_link_click'))      ra.hotpepperClick++
    if (names.has('favorite_store_click'))      ra.favoriteClick++
    if (names.has('create_event'))              ra.createEvent++
    if (names.has('complete_settlement'))       ra.completeSettlement++
    if (names.has('resume_existing_event'))     ra.resumeExistingEvent++
    if (names.has('repeat_store_search'))       ra.repeatStoreSearch++
    if (names.has('revisit_store_candidates'))  ra.revisitStoreCandidates++
  }

  return {
    totalUsers,
    returningUsers,
    returningRate: pct(returningUsers, totalUsers),
    storeStarters,
    storeReturningUsers,
    storeReturningRate: pct(storeReturningUsers, storeStarters),
    returningActivity: ra,
  }
}

/**
 * リピーター指標を集計する。created_at を日付単位に丸めて判定。
 * 同日に複数アクセスしても 1 日扱い。user_id が空のレコードは除外。
 */
export async function loadRetentionDashboard(myUserId: string): Promise<RetentionDashboard | null> {
  if (typeof window === 'undefined') return null

  const excludedSet = new Set([...EXCLUDED_USER_IDS, myUserId].filter(Boolean))
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [allRes, weekRes] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('user_id, event_name, created_at')
      .in('event_name', RETENTION_EVENTS),
    supabase
      .from('analytics_events')
      .select('user_id, event_name, created_at')
      .in('event_name', RETENTION_EVENTS)
      .gt('created_at', sevenDaysAgo),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter = (rows: any[] | null): RawRetentionRow[] =>
    (rows ?? []).filter((r: RawRetentionRow) => r.user_id && !excludedSet.has(r.user_id))

  return {
    all: processRetentionRows(filter(allRes.data)),
    week: processRetentionRows(filter(weekRes.data)),
  }
}

// ── Revisit 分析 ──────────────────────────────────────────────────────────────

const REVISIT_EVENTS: AnalyticsEventName[] = [
  'resume_existing_event',
  'repeat_store_search',
  'revisit_store_candidates',
]

export type RevisitSlice = {
  /** 進行中の会を開いたユニークユーザー数 */
  resumeCount: number
  /** repeat_store_search したユニークユーザー数 */
  repeatSearchUserCount: number
  /** repeat_store_search の総発火回数 */
  repeatSearchTotal: number
  /** revisit_store_candidates したユニークユーザー数 */
  revisitCandidatesCount: number
  /** resume_existing_event の status 内訳（イベント発火回数） */
  statusBreakdown: { date: number; store: number; settlement: number }
}

export type RevisitDashboard = { all: RevisitSlice; week: RevisitSlice }

type RawRevisitRow = {
  user_id: string
  event_name: string
  metadata: Record<string, unknown> | null
}

function processRevisitRows(rows: RawRevisitRow[]): RevisitSlice {
  const resumeUsers = new Set<string>()
  const repeatUsers = new Set<string>()
  const revisitUsers = new Set<string>()
  let repeatSearchTotal = 0
  const statusBreakdown = { date: 0, store: 0, settlement: 0 }

  for (const r of rows) {
    const m = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
    if (r.event_name === 'resume_existing_event') {
      resumeUsers.add(r.user_id)
      const s = m.status as string | undefined
      if (s === 'date') statusBreakdown.date++
      else if (s === 'store') statusBreakdown.store++
      else if (s === 'settlement') statusBreakdown.settlement++
    } else if (r.event_name === 'repeat_store_search') {
      repeatUsers.add(r.user_id)
      repeatSearchTotal++
    } else if (r.event_name === 'revisit_store_candidates') {
      revisitUsers.add(r.user_id)
    }
  }

  return {
    resumeCount: resumeUsers.size,
    repeatSearchUserCount: repeatUsers.size,
    repeatSearchTotal,
    revisitCandidatesCount: revisitUsers.size,
    statusBreakdown,
  }
}

export async function loadRevisitDashboard(myUserId: string): Promise<RevisitDashboard | null> {
  if (typeof window === 'undefined') return null

  const excludedSet = new Set([...EXCLUDED_USER_IDS, myUserId].filter(Boolean))
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [allRes, weekRes] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('user_id, event_name, metadata')
      .in('event_name', REVISIT_EVENTS),
    supabase
      .from('analytics_events')
      .select('user_id, event_name, metadata')
      .in('event_name', REVISIT_EVENTS)
      .gt('created_at', sevenDaysAgo),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter = (rows: any[] | null): RawRevisitRow[] =>
    (rows ?? []).filter((r: RawRevisitRow) => r.user_id && !excludedSet.has(r.user_id))

  return {
    all: processRevisitRows(filter(allRes.data)),
    week: processRevisitRows(filter(weekRes.data)),
  }
}

// ── Store Funnel 集計 ─────────────────────────────────────────────────────────

const STORE_EVENTS: AnalyticsEventName[] = [
  'store_only_start',
  'store_conditions_submit',
  'store_candidates_loaded',
  'store_candidate_switch',
  'hotpepper_link_click',
  'favorite_store_click',
  'store_only_to_event_create',
]

export type StoreModeBreakdown = {
  candidatesLoaded: number
  hotpepperClick: number
  favoriteClick: number
}

export type StoreFunnelSlice = {
  /** ユニークユーザー数（ファネル各ステップ） */
  storeOnlyStart: number
  conditionsSubmit: number
  candidatesLoaded: number
  hotpepperClick: number
  favoriteClick: number
  toEventCreate: number
  /** 候補切替イベントの総数 */
  candidateSwitch: number
  /** mode='store_only' のイベント総数 */
  storeOnly: StoreModeBreakdown
  /** mode='event_flow' のイベント総数 */
  eventFlow: StoreModeBreakdown
  /** 人気エリア上位5 */
  topAreas: Array<{ name: string; count: number }>
  /** 人気ジャンル上位5 */
  topGenres: Array<{ name: string; count: number }>
  /** 人数帯ごとの送信数 */
  peopleCounts: Array<{ count: number; freq: number }>
}

export type StoreDashboard = {
  all: StoreFunnelSlice
  week: StoreFunnelSlice
}

type RawStoreRow = {
  user_id: string
  event_name: string
  metadata: Record<string, unknown> | null
}

function meta(r: RawStoreRow): Record<string, unknown> {
  return r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
}

function processStoreRows(rows: RawStoreRow[]): StoreFunnelSlice {
  const byEvent: Record<string, RawStoreRow[]> = {}
  for (const r of rows) {
    if (!byEvent[r.event_name]) byEvent[r.event_name] = []
    byEvent[r.event_name].push(r)
  }

  const unique = (name: string) =>
    new Set((byEvent[name] ?? []).map(r => r.user_id)).size
  const total = (name: string) => (byEvent[name] ?? []).length
  const modeTotal = (name: string, mode: string) =>
    (byEvent[name] ?? []).filter(r => meta(r).mode === mode).length

  // エリア集計
  const areaCounts: Record<string, number> = {}
  for (const r of byEvent['store_conditions_submit'] ?? []) {
    const areas = meta(r).areas
    if (Array.isArray(areas)) {
      for (const a of areas) {
        if (typeof a === 'string' && a) areaCounts[a] = (areaCounts[a] ?? 0) + 1
      }
    }
  }
  const topAreas = Object.entries(areaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // ジャンル集計
  const genreCounts: Record<string, number> = {}
  for (const r of byEvent['store_conditions_submit'] ?? []) {
    const g = meta(r).genre
    if (typeof g === 'string' && g) genreCounts[g] = (genreCounts[g] ?? 0) + 1
  }
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // 人数帯集計
  const pcMap: Record<number, number> = {}
  for (const r of byEvent['store_conditions_submit'] ?? []) {
    const n = meta(r).peopleCount
    if (typeof n === 'number') pcMap[n] = (pcMap[n] ?? 0) + 1
  }
  const peopleCounts = Object.entries(pcMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([c, f]) => ({ count: Number(c), freq: f }))

  return {
    storeOnlyStart: unique('store_only_start'),
    conditionsSubmit: unique('store_conditions_submit'),
    candidatesLoaded: unique('store_candidates_loaded'),
    hotpepperClick: unique('hotpepper_link_click'),
    favoriteClick: unique('favorite_store_click'),
    toEventCreate: unique('store_only_to_event_create'),
    candidateSwitch: total('store_candidate_switch'),
    storeOnly: {
      candidatesLoaded: modeTotal('store_candidates_loaded', 'store_only'),
      hotpepperClick: modeTotal('hotpepper_link_click', 'store_only'),
      favoriteClick: modeTotal('favorite_store_click', 'store_only'),
    },
    eventFlow: {
      candidatesLoaded: modeTotal('store_candidates_loaded', 'event_flow'),
      hotpepperClick: modeTotal('hotpepper_link_click', 'event_flow'),
      favoriteClick: modeTotal('favorite_store_click', 'event_flow'),
    },
    topAreas,
    topGenres,
    peopleCounts,
  }
}

/**
 * 店探しファネル用集計。metadata を含むクエリを別途発行する。
 * 既存 loadDashboard とは独立して呼ぶ（parallel fetch）。
 */
export async function loadStoreDashboard(myUserId: string): Promise<StoreDashboard | null> {
  if (typeof window === 'undefined') return null

  const excludedSet = new Set([...EXCLUDED_USER_IDS, myUserId].filter(Boolean))
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [allRes, weekRes] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('user_id, event_name, metadata')
      .in('event_name', STORE_EVENTS),
    supabase
      .from('analytics_events')
      .select('user_id, event_name, metadata')
      .in('event_name', STORE_EVENTS)
      .gt('created_at', sevenDaysAgo),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter = (rows: any[] | null): RawStoreRow[] =>
    (rows ?? []).filter((r: RawStoreRow) => !excludedSet.has(r.user_id))

  return {
    all: processStoreRows(filter(allRes.data)),
    week: processStoreRows(filter(weekRes.data)),
  }
}

// ── 表示ヘルパー ──────────────────────────────────────────────────────────────

/** n / d を 0–100 の整数パーセントで返す。d = 0 なら 0。 */
export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}
