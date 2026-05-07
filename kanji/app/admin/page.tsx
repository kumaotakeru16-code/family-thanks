'use client'

import { useEffect, useState } from 'react'
import { Activity, RefreshCw, TrendingUp, Zap } from 'lucide-react'
import {
  loadDashboard,
  loadStoreDashboard,
  loadRetentionDashboard,
  loadRevisitDashboard,
  loadTimeSeries,
  loadActivityFeed,
  loadSourceDashboard,
  pct,
  type AnalyticsDashboard,
  type AnalyticsSlice,
  type StoreDashboard,
  type StoreFunnelSlice,
  type RetentionDashboard,
  type RetentionSlice,
  type RevisitDashboard,
  type RevisitSlice,
  type DayPoint,
  type ActivityItem,
  type SourceDashboard,
  type SourceSlice,
  type TrafficSource,
} from '@/app/lib/analytics'
import { getAnonId } from '@/app/lib/storage/anonymous-id'

// ── Design tokens ─────────────────────────────────────────────────────────────
const G    = '#3CC55A'
const WARN = '#F59E0B'
const DANGER = '#EF4444'
const BLUE = '#60A5FA'

const EVENT_LABELS: Record<string, string> = {
  start_from_dates:          '日程から開始',
  start_from_store:          'お店から開始',
  create_event:              '会を作成',
  view_store_suggestion:     '店候補を表示',
  complete_settlement:       '清算完了',
  store_only_start:          '店探し開始',
  store_candidates_loaded:   '候補表示',
  hotpepper_link_click:      'HPリンクをタップ',
  favorite_store_click:      'お気に入り追加',
  store_only_to_event_create:'店探し → 会作成',
  resume_existing_event:     '進行中の会を再開',
  repeat_store_search:       '店を再検索',
  revisit_store_candidates:  '候補を再訪',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  return `${Math.floor(hrs / 24)}日前`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [dash, setDash] = useState<AnalyticsDashboard | null>(null)
  const [storeDash, setStoreDash] = useState<StoreDashboard | null>(null)
  const [retentionDash, setRetentionDash] = useState<RetentionDashboard | null>(null)
  const [revisitDash, setRevisitDash] = useState<RevisitDashboard | null>(null)
  const [timeSeries, setTimeSeries] = useState<DayPoint[]>([])
  const [feed, setFeed] = useState<ActivityItem[]>([])
  const [sourceDash, setSourceDash] = useState<SourceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekMode, setWeekMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [myId, setMyId] = useState('')
  const [copied, setCopied] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const id = getAnonId()
      const [d, s, r, rv, ts, f, src] = await Promise.all([
        loadDashboard(id),
        loadStoreDashboard(id),
        loadRetentionDashboard(id),
        loadRevisitDashboard(id),
        loadTimeSeries(id, 30),
        loadActivityFeed(id, 20),
        loadSourceDashboard(id),
      ])
      setDash(d)
      setStoreDash(s)
      setRetentionDash(r)
      setRevisitDash(rv)
      setTimeSeries(ts)
      setFeed(f)
      setSourceDash(src)
      setLastUpdated(new Date())
    } catch {
      setDash(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMyId(getAnonId())
    void refresh()
  }, [])

  const slice      = weekMode ? dash?.week      : dash?.all
  const storeSlice = weekMode ? storeDash?.week : storeDash?.all
  const retSlice   = weekMode ? retentionDash?.week : retentionDash?.all
  const revSlice    = weekMode ? revisitDash?.week   : revisitDash?.all
  const sourceSlices = weekMode ? sourceDash?.week   : sourceDash?.all
  const tsData      = weekMode ? timeSeries.slice(-7) : timeSeries

  return (
    <div style={{ minHeight: '100vh', background: '#0B0D0B' }} className="px-4 pb-20 pt-10">
      <div className="mx-auto max-w-md space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Activity size={12} strokeWidth={2.5} style={{ color: G }} />
              <span className="text-[9px] font-black uppercase tracking-[0.28em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                KANJI · Admin
              </span>
            </div>
            <h1 className="text-[22px] font-black tracking-tight text-white">利用状況</h1>
            {lastUpdated && (
              <p className="mt-0.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 更新
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} strokeWidth={2.5} />
            更新
          </button>
        </div>

        {/* Period Toggle */}
        <div className="flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {([['直近7日間', true], ['全期間', false]] as [string, boolean][]).map(([label, isWeek]) => {
            const active = weekMode === isWeek
            return (
              <button
                key={label}
                type="button"
                onClick={() => setWeekMode(isWeek)}
                className="flex-1 rounded-lg py-2 text-[12px] font-bold transition"
                style={active
                  ? { background: 'rgba(255,255,255,0.11)', color: '#fff' }
                  : { color: 'rgba(255,255,255,0.3)' }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: G }} />
          </div>
        ) : !slice ? (
          <GlassCard>
            <p className="py-10 text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>データを取得できませんでした</p>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            <InsightCard slice={slice} storeSlice={storeSlice ?? null} retSlice={retSlice ?? null} />
            <HeroSection slice={slice} />
            {tsData.some(d => d.users > 0) && <TimeSeriesSection data={tsData} />}
            {slice.startDatesUsers + slice.startStoreUsers > 0 && <StartMethodSection slice={slice} />}
            <MainFunnelSection slice={slice} />
            {storeSlice && <StoreFunnelSection slice={storeSlice} />}
            {storeSlice && (storeSlice.topAreas.length > 0 || storeSlice.topGenres.length > 0 || storeSlice.peopleCounts.length > 0) && (
              <ConditionsSection slice={storeSlice} />
            )}
            {retSlice && <RetentionSection slice={retSlice} />}
            {revSlice && <RevisitSection revisit={revSlice} />}
            {sourceSlices && sourceSlices.length > 0 && <SourceView slices={sourceSlices} small={slice.totalUsers < 10} />}
            {feed.length > 0 && <ActivityFeedSection feed={feed} />}
          </div>
        )}

        {/* Footer */}
        {myId && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="min-w-0 flex-1 break-all font-mono text-[9px] leading-5" style={{ color: 'rgba(255,255,255,0.18)' }}>
              <span className="mr-1.5 font-sans font-bold" style={{ color: 'rgba(255,255,255,0.25)' }}>my id:</span>
              {myId}
            </p>
            <button
              type="button"
              onClick={async () => { await navigator.clipboard.writeText(myId); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="shrink-0 rounded-lg px-2 py-1 text-[9px] font-bold transition"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
            >
              {copied ? '✓' : 'コピー'}
            </button>
          </div>
        )}
        <p className="pb-4 text-center text-[9px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
          自分の user_id は除外して集計しています
        </p>
      </div>
    </div>
  )
}

// ── Insight Card ──────────────────────────────────────────────────────────────

function InsightCard({
  slice: s, storeSlice: ss, retSlice: rs,
}: {
  slice: AnalyticsSlice
  storeSlice: StoreFunnelSlice | null
  retSlice: RetentionSlice | null
}) {
  const insights: Array<{ text: string; type: 'good' | 'warn' | 'info' }> = []
  const small = s.totalUsers < 10

  const startTotal = s.startDatesUsers + s.startStoreUsers
  if (startTotal > 0) {
    const storePct = pct(s.startStoreUsers, startTotal)
    if (storePct >= 50) {
      insights.push({
        text: `${small ? 'まだ母数は少ないですが、' : ''}「お店から開始」が ${storePct}% と日程を上回っています`,
        type: 'good',
      })
    } else if (startTotal >= 3) {
      insights.push({
        text: `日程から開始が ${100 - storePct}% と主流。店探し入口の伸びに注目`,
        type: 'info',
      })
    }
  }

  if (ss && ss.candidatesLoaded > 0 && ss.hotpepperClick === 0) {
    insights.push({
      text: '候補表示後の HP リンクがまだ 0 件 — 候補の訴求力を確認してください',
      type: 'warn',
    })
  }

  if (rs && rs.returningUsers > 0) {
    insights.push({
      text: `${small ? 'まだ母数は少ないですが、' : ''}再訪ユーザーが ${rs.returningUsers} 人 (${rs.returningRate}%) 出ています`,
      type: 'good',
    })
  }

  if (ss && ss.storeOnlyStart > 0) {
    const convPct = pct(ss.toEventCreate, ss.storeOnlyStart)
    if (convPct >= 20) {
      insights.push({ text: `店探し → 会作成の転換率が ${convPct}% と好調です`, type: 'good' })
    } else if (convPct === 0 && ss.candidatesLoaded > 0) {
      insights.push({ text: '候補表示後に会作成へ進んだユーザーがまだいません', type: 'warn' })
    }
  }

  if (insights.length === 0) {
    insights.push({ text: 'データが蓄積されると、ここに自動で傾向が表示されます', type: 'info' })
  }

  const typeColor = { good: G, warn: WARN, info: 'rgba(255,255,255,0.35)' }

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <Zap size={11} strokeWidth={2.5} style={{ color: G }} />
        <Lbl>今日の気づき</Lbl>
      </div>
      <div className="space-y-2.5">
        {insights.slice(0, 3).map((ins, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: typeColor[ins.type] }} />
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{ins.text}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

// ── Hero Metrics ──────────────────────────────────────────────────────────────

function HeroSection({ slice: s }: { slice: AnalyticsSlice }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {[
        { label: '利用ユーザー', value: s.totalUsers, rate: undefined },
        { label: '会を作成', value: s.createEventUsers, rate: pct(s.createEventUsers, s.totalUsers) },
        { label: '店候補表示', value: s.storeViewUsers, rate: pct(s.storeViewUsers, s.totalUsers) },
        { label: '清算完了', value: s.completeUsers, rate: pct(s.completeUsers, s.totalUsers) },
      ].map(({ label, value, rate }) => (
        <div key={label} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <p className="text-[32px] font-black leading-none tracking-tight text-white">{value.toLocaleString()}</p>
            {rate !== undefined && (
              <p className="text-[11px] font-bold" style={{ color: rate >= 20 ? G : rate >= 5 ? WARN : 'rgba(255,255,255,0.25)' }}>{rate}%</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Time Series ───────────────────────────────────────────────────────────────

function TimeSeriesSection({ data }: { data: DayPoint[] }) {
  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={11} strokeWidth={2.5} style={{ color: G }} />
          <Lbl>日別推移</Lbl>
        </div>
        <div className="flex items-center gap-3">
          {[
            { label: 'ユーザー', color: 'rgba(255,255,255,0.45)' },
            { label: '会作成', color: G },
            { label: '店候補', color: BLUE },
            { label: '清算', color: WARN },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="h-[3px] w-3 rounded-full" style={{ background: color }} />
              <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <MiniLineChart data={data} />
    </GlassCard>
  )
}

function MiniLineChart({ data }: { data: DayPoint[] }) {
  const W = 320, H = 110
  const PL = 26, PR = 8, PT = 8, PB = 28
  const iW = W - PL - PR
  const iH = H - PT - PB

  const maxVal = Math.max(
    1,
    ...data.map(d => Math.max(d.users, d.creates, d.storeViews, d.completes))
  )

  const sx = (i: number) =>
    data.length <= 1 ? PL + iW / 2 : PL + (i / (data.length - 1)) * iW
  const sy = (v: number) => PT + (1 - v / maxVal) * iH

  const linePath = (key: keyof Omit<DayPoint, 'date'>) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d[key]).toFixed(1)}`).join(' ')

  const ticks = [0, Math.round(maxVal / 2), maxVal].filter((v, i, a) => a.indexOf(v) === i)

  const midIdx = Math.floor(data.length / 2)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {ticks.map(t => (
        <g key={t}>
          <line x1={PL} y1={sy(t)} x2={W - PR} y2={sy(t)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={PL - 4} y={sy(t) + 3} textAnchor="end" fontSize="7" fill="rgba(255,255,255,0.22)">{t}</text>
        </g>
      ))}

      {[
        { key: 'users'      as const, color: 'rgba(255,255,255,0.45)' },
        { key: 'creates'    as const, color: G },
        { key: 'storeViews' as const, color: BLUE },
        { key: 'completes'  as const, color: WARN },
      ].map(({ key, color }) => (
        <path key={key} d={linePath(key)} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {data.length > 0 && (
        <>
          <text x={PL} y={H - 8} fontSize="8" fill="rgba(255,255,255,0.22)">{data[0].date.slice(5)}</text>
          {data.length > 2 && (
            <text x={sx(midIdx)} y={H - 8} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.22)">
              {data[midIdx]?.date.slice(5)}
            </text>
          )}
          <text x={W - PR} y={H - 8} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.22)">
            {data[data.length - 1]?.date.slice(5)}
          </text>
        </>
      )}
    </svg>
  )
}

// ── Start Method ──────────────────────────────────────────────────────────────

function StartMethodSection({ slice: s }: { slice: AnalyticsSlice }) {
  const total = s.startDatesUsers + s.startStoreUsers
  const datePct = pct(s.startDatesUsers, total)
  const storePct = 100 - datePct

  return (
    <GlassCard>
      <Lbl className="mb-3">開始方法の比率</Lbl>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>日程</span>
        <div className="flex flex-1 overflow-hidden rounded-full" style={{ height: 10, background: 'rgba(255,255,255,0.07)' }}>
          <div style={{ width: `${datePct}%`, background: 'rgba(255,255,255,0.28)', borderRadius: '99px 0 0 99px', transition: 'width 0.6s ease' }} />
          <div style={{ width: `${storePct}%`, background: G, borderRadius: storePct === 100 ? 99 : '0 99px 99px 0', transition: 'width 0.6s ease' }} />
        </div>
        <span className="text-[10px] font-bold" style={{ color: G }}>お店</span>
      </div>
      <div className="mt-2.5 flex justify-between">
        <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>日程 {s.startDatesUsers}人 · {datePct}%</span>
        <span className="text-[11px] font-bold" style={{ color: G }}>お店 {s.startStoreUsers}人 · {storePct}%</span>
      </div>
    </GlassCard>
  )
}

// ── Main Funnel ───────────────────────────────────────────────────────────────

function MainFunnelSection({ slice: s }: { slice: AnalyticsSlice }) {
  const steps = [
    { label: 'アプリを開いた', value: s.appOpenUsers },
    { label: '開始した',       value: s.startUsers },
    { label: '会を作成',       value: s.createEventUsers },
    { label: '店候補を表示',   value: s.storeViewUsers },
    { label: '清算完了',       value: s.completeUsers },
  ]

  return (
    <GlassCard>
      <Lbl className="mb-3">到達ファネル</Lbl>
      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1].value : null
          const convFromPrev = prev != null && prev > 0 ? pct(step.value, prev) : null
          const barW = s.appOpenUsers > 0 ? Math.max(step.value > 0 ? 3 : 0, pct(step.value, s.appOpenUsers)) : (step.value > 0 ? 100 : 0)
          const isWarn = convFromPrev != null && convFromPrev < 30 && step.value > 0
          const barColor = i === 0 ? 'rgba(255,255,255,0.3)' : isWarn ? DANGER : convFromPrev != null && convFromPrev >= 50 ? G : WARN

          return (
            <div key={step.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.65)' }}>{step.label}</span>
                <div className="flex items-center gap-2">
                  {convFromPrev !== null && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{
                      background: isWarn ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                      color: isWarn ? DANGER : convFromPrev >= 50 ? G : WARN,
                    }}>
                      {convFromPrev}%
                    </span>
                  )}
                  <span className="w-6 text-right text-[14px] font-black" style={{ color: 'rgba(255,255,255,0.85)' }}>{step.value}</span>
                </div>
              </div>
              <div className="overflow-hidden rounded-full" style={{ height: 5, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ width: `${barW}%`, background: barColor, height: '100%', borderRadius: 99, transition: 'width 0.7s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

// ── Store Funnel ──────────────────────────────────────────────────────────────

function StoreFunnelSection({ slice: s }: { slice: StoreFunnelSlice }) {
  const hasData = s.storeOnlyStart > 0

  const steps: Array<{ label: string; value: number; prev?: number; accent?: boolean }> = [
    { label: 'お店から開始',   value: s.storeOnlyStart },
    { label: '条件送信',       value: s.conditionsSubmit,  prev: s.storeOnlyStart },
    { label: '候補表示',       value: s.candidatesLoaded,  prev: s.conditionsSubmit },
    { label: 'HPリンク',       value: s.hotpepperClick,    prev: s.candidatesLoaded },
    { label: 'お気に入り',     value: s.favoriteClick,     prev: s.candidatesLoaded },
    { label: '会作成へ移行',   value: s.toEventCreate,     prev: s.storeOnlyStart, accent: true },
  ]

  const modeRows = [
    { label: '候補表示', so: s.storeOnly.candidatesLoaded, ef: s.eventFlow.candidatesLoaded },
    { label: 'HPリンク', so: s.storeOnly.hotpepperClick,   ef: s.eventFlow.hotpepperClick },
    { label: 'お気に入り', so: s.storeOnly.favoriteClick,  ef: s.eventFlow.favoriteClick },
  ]
  const hasModeData = s.storeOnly.candidatesLoaded + s.eventFlow.candidatesLoaded > 0

  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <Lbl>店探しファネル</Lbl>
        {s.candidateSwitch > 0 && (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>候補切替 {s.candidateSwitch}回</span>
        )}
      </div>

      {!hasData ? (
        <p className="py-4 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>まだデータがありません</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {steps.map(step => {
              const conv = step.prev !== undefined && step.prev > 0 ? pct(step.value, step.prev) : null
              const barW = Math.max(step.value > 0 ? 3 : 0, pct(step.value, s.storeOnlyStart))
              const isZeroAfterLoad = step.value === 0 && s.candidatesLoaded > 0 && step.label !== 'お店から開始'
              const barColor = step.accent ? G : isZeroAfterLoad ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.22)'

              return (
                <div key={step.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold" style={{ color: step.accent ? G : 'rgba(255,255,255,0.65)' }}>{step.label}</span>
                    <div className="flex items-center gap-2">
                      {conv !== null && (
                        <span className="text-[9px] font-bold" style={{ color: conv === 0 ? DANGER : conv >= 50 ? G : WARN }}>
                          {conv}%
                        </span>
                      )}
                      <span className="w-5 text-right text-[14px] font-black" style={{ color: isZeroAfterLoad ? DANGER : 'rgba(255,255,255,0.8)' }}>
                        {step.value}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ width: `${barW}%`, background: barColor, height: '100%', borderRadius: 99, transition: 'width 0.7s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {hasModeData && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.22)' }}>mode 別（イベント数）</p>
              <div className="mb-1.5 grid grid-cols-3 text-center">
                <div />
                <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.22)' }}>store_only</p>
                <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.22)' }}>event_flow</p>
              </div>
              {modeRows.map(({ label, so, ef }) => (
                <div key={label} className="grid grid-cols-3 items-center py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</p>
                  <p className="text-center text-[14px] font-black" style={{ color: 'rgba(255,255,255,0.75)' }}>{so}</p>
                  <p className="text-center text-[14px] font-black" style={{ color: 'rgba(255,255,255,0.75)' }}>{ef}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}

// ── Conditions ────────────────────────────────────────────────────────────────

function ConditionsSection({ slice: s }: { slice: StoreFunnelSlice }) {
  return (
    <GlassCard>
      <Lbl className="mb-4">よく使われる条件</Lbl>
      <div className="space-y-5">
        {s.topAreas.length > 0 && <DarkRankingList title="人気エリア"   items={s.topAreas}  color={G} />}
        {s.topGenres.length > 0 && <DarkRankingList title="人気ジャンル" items={s.topGenres} color={BLUE} />}
        {s.peopleCounts.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.28)' }}>人数帯</p>
            <div className="flex flex-wrap gap-1.5">
              {s.peopleCounts.map(({ count, freq }) => (
                <span key={count} className="rounded-lg px-2.5 py-1 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
                  {count}人 <span style={{ color: 'rgba(255,255,255,0.28)' }}>×{freq}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function DarkRankingList({ title, items, color }: { title: string; items: Array<{ name: string; count: number }>; color: string }) {
  const max = Math.max(1, items[0]?.count ?? 1)
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.28)' }}>{title}</p>
      <div className="space-y-1.5">
        {items.map(({ name, count }) => (
          <div key={name} className="flex items-center gap-2">
            <p className="w-20 shrink-0 truncate text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>{name}</p>
            <div className="flex-1 overflow-hidden rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ width: `${Math.round((count / max) * 100)}%`, background: color, height: '100%', borderRadius: 99, transition: 'width 0.6s ease' }} />
            </div>
            <p className="w-4 text-right text-[11px] font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>{count}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Retention ─────────────────────────────────────────────────────────────────

function RetentionSection({ slice: s }: { slice: RetentionSlice }) {
  const ra = s.returningActivity
  const actItems = [
    { label: '店探し開始', count: ra.storeOnlyStart },
    { label: '候補表示',   count: ra.storeCandidatesLoaded },
    { label: 'HPリンク',   count: ra.hotpepperClick },
    { label: 'お気に入り', count: ra.favoriteClick },
    { label: '会作成',     count: ra.createEvent },
    { label: '清算完了',   count: ra.completeSettlement },
    { label: '会再開',     count: ra.resumeExistingEvent },
    { label: '再検索',     count: ra.repeatStoreSearch },
    { label: '候補再訪',   count: ra.revisitStoreCandidates },
  ]

  return (
    <GlassCard>
      <Lbl className="mb-3">リピーター</Lbl>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          { label: '全ユーザー',     val: s.totalUsers,          rate: undefined },
          { label: '再訪',           val: s.returningUsers,      rate: s.returningRate },
          { label: '店探しユーザー', val: s.storeStarters,       rate: undefined },
          { label: '店探しリピーター', val: s.storeReturningUsers, rate: s.storeReturningRate },
        ].map(({ label, val, rate }) => (
          <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.28)' }}>{label}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="text-[20px] font-black text-white">{val}</p>
              {rate !== undefined && (
                <p className="text-[10px] font-bold" style={{ color: rate > 0 ? G : 'rgba(255,255,255,0.2)' }}>{rate}%</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {s.totalUsers > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
            <span>新規 {s.totalUsers - s.returningUsers}人</span>
            <span>再訪 {s.returningUsers}人</span>
          </div>
          <div className="flex overflow-hidden rounded-full" style={{ height: 7, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ width: `${pct(s.totalUsers - s.returningUsers, s.totalUsers)}%`, background: 'rgba(255,255,255,0.18)', transition: 'width 0.6s ease' }} />
            <div style={{ width: `${pct(s.returningUsers, s.totalUsers)}%`, background: G, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

      {s.returningUsers > 0 && (
        <div>
          <p className="mb-2 text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.28)' }}>再訪 {s.returningUsers}人の行動内訳</p>
          <div className="space-y-1.5">
            {actItems.map(({ label, count }) => (
              <div key={label} className="flex items-center gap-2">
                <p className="w-20 shrink-0 text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
                <div className="flex-1 overflow-hidden rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{
                    width: `${s.returningUsers > 0 ? Math.max(count > 0 ? 3 : 0, Math.round((count / s.returningUsers) * 100)) : 0}%`,
                    background: count > 0 ? G : 'transparent',
                    height: '100%', borderRadius: 99, transition: 'width 0.6s ease',
                  }} />
                </div>
                <p className="w-5 text-right text-[11px] font-black" style={{ color: count > 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.18)' }}>{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  )
}

// ── Revisit ───────────────────────────────────────────────────────────────────

function RevisitSection({ revisit: r }: { revisit: RevisitSlice }) {
  const hasData = r.resumeCount + r.repeatSearchUserCount + r.revisitCandidatesCount > 0
  const statusTotal = r.statusBreakdown.date + r.statusBreakdown.store + r.statusBreakdown.settlement

  return (
    <GlassCard>
      <Lbl className="mb-3">再訪行動</Lbl>
      {!hasData ? (
        <p className="py-4 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>まだデータがありません</p>
      ) : (
        <>
          <div className="mb-4 space-y-2">
            {[
              { label: '進行中の会を再開', count: r.resumeCount,            sub: null },
              { label: '店を再検索',       count: r.repeatSearchUserCount,  sub: `延べ ${r.repeatSearchTotal}回` },
              { label: '候補を再訪',       count: r.revisitCandidatesCount, sub: null },
            ].map(({ label, count, sub }) => (
              <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div>
                  <p className="text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</p>
                  {sub && <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{sub}</p>}
                </div>
                <p className="text-[20px] font-black" style={{ color: count > 0 ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.2)' }}>{count}</p>
              </div>
            ))}
          </div>

          {r.resumeCount > 0 && statusTotal > 0 && (
            <div>
              <p className="mb-2 text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.28)' }}>会再開のフェーズ内訳</p>
              <div className="space-y-1.5">
                {[
                  { label: '日程調整中', count: r.statusBreakdown.date },
                  { label: '店決め中',   count: r.statusBreakdown.store },
                  { label: '清算中',     count: r.statusBreakdown.settlement },
                ].map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-2">
                    <p className="w-20 shrink-0 text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
                    <div className="flex-1 overflow-hidden rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        width: `${statusTotal > 0 ? Math.max(count > 0 ? 3 : 0, Math.round((count / statusTotal) * 100)) : 0}%`,
                        background: G, height: '100%', borderRadius: 99, transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <p className="w-5 text-right text-[11px] font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>{count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}

// ── Source Analysis ───────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<TrafficSource, string> = {
  x: 'X',
  note: 'note',
  tsukutta: 'tsukutta',
  direct: 'Direct',
  other: 'Other',
}

function SourceView({ slices, small }: { slices: SourceSlice[]; small: boolean }) {
  // 濃さ洞察: 会作成率・店探し率が高いソース（母数 3 以上）
  const qualified = slices.filter(s => s.users >= 3)
  const topByCreate = [...qualified].sort((a, b) => pct(b.createEvents, b.users) - pct(a.createEvents, a.users))[0]
  const topByStore  = [...qualified].sort((a, b) => pct(b.storeOnlyStarts, b.users) - pct(a.storeOnlyStarts, a.users))[0]
  const topByVolume = slices[0]

  const insights: Array<{ label: string; value: string; type: 'good' | 'info' }> = []
  if (topByVolume) {
    insights.push({ label: '最も流入が多い', value: `${SOURCE_LABEL[topByVolume.source]} (${topByVolume.users}人)`, type: 'info' })
  }
  if (topByCreate && pct(topByCreate.createEvents, topByCreate.users) > 0) {
    insights.push({ label: '会作成率が高い', value: `${SOURCE_LABEL[topByCreate.source]} (${pct(topByCreate.createEvents, topByCreate.users)}%)`, type: 'good' })
  }
  if (topByStore && pct(topByStore.storeOnlyStarts, topByStore.users) > 0) {
    insights.push({ label: '店探し率が高い', value: `${SOURCE_LABEL[topByStore.source]} (${pct(topByStore.storeOnlyStarts, topByStore.users)}%)`, type: 'good' })
  }

  return (
    <>
      {/* 流入元の濃さ */}
      <GlassCard>
        <Lbl className="mb-3">流入元の濃さ</Lbl>
        {insights.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>まだ母数が少ないです</p>
        ) : (
          <div className="space-y-2">
            {small && (
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>まだ母数は少ないですが、傾向として：</p>
            )}
            {insights.map(({ label, value, type }) => (
              <div key={label} className="flex items-start gap-2.5">
                <div className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: type === 'good' ? G : 'rgba(255,255,255,0.3)' }} />
                <div className="flex flex-1 items-baseline justify-between gap-2">
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</p>
                  <p className="text-[12px] font-black" style={{ color: type === 'good' ? G : 'rgba(255,255,255,0.7)' }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 流入元別ファネル */}
      <GlassCard>
        <Lbl className="mb-3">流入元別</Lbl>
        <div className="space-y-0">
          {slices.map((s, i) => {
            const createRate = pct(s.createEvents, s.users)
            const storeRate  = pct(s.storeOnlyStarts, s.users)
            const rows = [
              { label: 'start',  val: s.starts,               rate: pct(s.starts, s.users) },
              { label: 'store',  val: s.storeOnlyStarts,      rate: storeRate },
              { label: 'create', val: s.createEvents,          rate: createRate },
              { label: '候補',   val: s.storeCandidatesLoaded, rate: pct(s.storeCandidatesLoaded, s.users) },
              { label: '完了',   val: s.completeSettlements,   rate: pct(s.completeSettlements, s.users) },
            ].filter(r => r.val > 0)

            return (
              <div key={s.source}>
                {i > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />}
                <div className="flex items-start gap-3">
                  {/* Source label + user count */}
                  <div className="w-16 shrink-0">
                    <p className="text-[12px] font-black" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {SOURCE_LABEL[s.source]}
                    </p>
                    <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {s.users}人
                    </p>
                  </div>

                  {/* Mini funnel bars */}
                  <div className="flex-1 space-y-1.5">
                    {rows.length === 0 ? (
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>アクティビティなし</p>
                    ) : (
                      rows.map(({ label, val, rate }) => {
                        const isGood = rate >= 30
                        return (
                          <div key={label} className="flex items-center gap-2">
                            <span className="w-8 shrink-0 text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                              {label}
                            </span>
                            <div className="flex-1 overflow-hidden rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{
                                width: `${Math.max(rate > 0 ? 4 : 0, rate)}%`,
                                background: isGood ? G : 'rgba(255,255,255,0.25)',
                                height: '100%', borderRadius: 99, transition: 'width 0.6s ease',
                              }} />
                            </div>
                            <span className="w-4 text-right text-[10px] font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>{val}</span>
                            <span className="w-6 text-right text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{rate}%</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeedSection({ feed }: { feed: ActivityItem[] }) {
  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: G }} />
        <Lbl>直近のアクティビティ</Lbl>
      </div>
      <div className="space-y-0">
        {feed.map((item, i) => {
          const label = EVENT_LABELS[item.eventName] ?? item.eventName
          const m = item.metadata ?? {}
          const detail = [
            typeof m.area === 'string' && m.area,
            typeof m.genre === 'string' && m.genre,
            typeof m.mode === 'string' && (m.mode === 'store_only' ? '店探しmode' : '会作成mode'),
            typeof m.status === 'string' && { date: '日程調整中', store: '店決め中', settlement: '清算中' }[m.status as string],
          ].filter(Boolean).join(' · ')

          return (
            <div key={item.id}>
              {i > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />}
              <div className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</p>
                  {detail && <p className="mt-0.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{detail}</p>}
                </div>
                <p className="shrink-0 text-[10px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
                  {relativeTime(item.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl px-4 py-4 ${className ?? ''}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {children}
    </div>
  )
}

function Lbl({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[9px] font-black uppercase tracking-[0.22em] ${className ?? ''}`} style={{ color: 'rgba(255,255,255,0.3)' }}>
      {children}
    </p>
  )
}
