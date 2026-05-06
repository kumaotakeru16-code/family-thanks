'use client'

/**
 * /admin — 運営向け利用状況ダッシュボード
 *
 * 一般ユーザーへの導線はなし。URL を直接入力した人だけアクセスできる。
 * 認証なし（anon_user_id による自分除外のみ）。
 */

import { useEffect, useState } from 'react'
import { BarChart2, RefreshCw } from 'lucide-react'
import {
  loadDashboard,
  loadStoreDashboard,
  loadRetentionDashboard,
  pct,
  type AnalyticsDashboard,
  type AnalyticsSlice,
  type StoreDashboard,
  type StoreFunnelSlice,
  type RetentionDashboard,
  type RetentionSlice,
} from '@/app/lib/analytics'
import { getAnonId } from '@/app/lib/storage/anonymous-id'

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null)
  const [storeDash, setStoreDash] = useState<StoreDashboard | null>(null)
  const [retentionDash, setRetentionDash] = useState<RetentionDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekMode, setWeekMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [myId, setMyId] = useState('')
  const [copied, setCopied] = useState(false)

  async function fetch() {
    setLoading(true)
    try {
      const id = getAnonId()
      const [data, storeData, retData] = await Promise.all([
        loadDashboard(id),
        loadStoreDashboard(id),
        loadRetentionDashboard(id),
      ])
      setDashboard(data)
      setStoreDash(storeData)
      setRetentionDash(retData)
      setLastUpdated(new Date())
    } catch {
      setDashboard(null)
      setStoreDash(null)
      setRetentionDash(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMyId(getAnonId())
    void fetch()
  }, [])

  return (
    <div className="min-h-screen bg-[#111111] px-4 pb-16 pt-10">
      <div className="mx-auto max-w-md space-y-6">

        {/* ヘッダー */}
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <BarChart2 size={16} className="text-stone-500" strokeWidth={2.5} />
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Admin</p>
            </div>
            <h1 className="text-[24px] font-black tracking-tight text-stone-900">利用状況</h1>
            {lastUpdated && (
              <p className="mt-0.5 text-[11px] text-stone-400">
                更新: {lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={fetch}
            disabled={loading}
            className="mt-1 flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-stone-600 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} strokeWidth={2.5} />
            更新
          </button>
        </div>

        {/* 期間トグル */}
        <div className="flex rounded-xl bg-stone-200/60 p-1">
          <button
            type="button"
            onClick={() => setWeekMode(true)}
            className={`flex-1 rounded-lg py-2 text-[12px] font-bold transition ${weekMode ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            直近7日間
          </button>
          <button
            type="button"
            onClick={() => setWeekMode(false)}
            className={`flex-1 rounded-lg py-2 text-[12px] font-bold transition ${!weekMode ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            全期間
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-600" />
          </div>
        ) : !dashboard ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-stone-100">
            <p className="text-sm font-bold text-stone-500">データを取得できませんでした</p>
          </div>
        ) : (
          <div className="space-y-4">
            <DashboardView slice={weekMode ? dashboard.week : dashboard.all} />
            {storeDash && (
              <StoreFunnelView slice={weekMode ? storeDash.week : storeDash.all} />
            )}
            {retentionDash && (
              <RetentionView slice={weekMode ? retentionDash.week : retentionDash.all} />
            )}
          </div>
        )}

        {/* この端末の anon_id */}
        {myId && (
          <div className="flex items-start gap-2 rounded-xl bg-stone-100/60 px-3 py-2.5">
            <p className="min-w-0 flex-1 break-all font-mono text-[10px] leading-5 text-stone-400">
              <span className="mr-1.5 font-sans font-bold text-stone-400">my id:</span>
              {myId}
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(myId)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-stone-500 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50"
            >
              {copied ? '✓' : 'コピー'}
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-stone-400">
          自分の user_id は除外して集計しています
        </p>
      </div>
    </div>
  )
}

// ── 既存ダッシュボード本体（変更なし） ────────────────────────────────────────

function DashboardView({ slice: s }: { slice: AnalyticsSlice }) {
  const startTotal = s.startDatesUsers + s.startStoreUsers
  const startArrival = pct(s.startUsers, s.appOpenUsers)
  const startToCreate = pct(s.createEventUsers, s.startUsers)
  const createToStore = pct(s.storeViewUsers, s.createEventUsers)
  const storeToComplete = pct(s.completeUsers, s.storeViewUsers)

  return (
    <>
      {/* ① メイン指標 */}
      <Card>
        <SectionLabel>メイン指標</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <MetricCell label="利用ユーザー" value={s.totalUsers} />
          <MetricCell label="会を作成" value={s.createEventUsers} rate={pct(s.createEventUsers, s.totalUsers)} />
          <MetricCell label="店提案到達" value={s.storeViewUsers} rate={pct(s.storeViewUsers, s.totalUsers)} />
          <MetricCell label="清算完了" value={s.completeUsers} rate={pct(s.completeUsers, s.totalUsers)} />
        </div>
      </Card>

      {/* ② 開始方法の内訳 */}
      <Card>
        <SectionLabel>開始方法の内訳</SectionLabel>
        {startTotal === 0 ? (
          <p className="py-2 text-center text-[11px] text-stone-300">まだデータがありません</p>
        ) : (
          <div className="space-y-3">
            <StartBar label="日程から" count={s.startDatesUsers} total={startTotal} color="bg-stone-800" />
            <StartBar label="お店から" count={s.startStoreUsers} total={startTotal} color="bg-stone-400" />
          </div>
        )}
      </Card>

      {/* ③ 到達率ファネル */}
      <Card>
        <SectionLabel>到達率ファネル</SectionLabel>
        <div className="space-y-2.5">
          <FunnelRow label="open → 開始" from={s.appOpenUsers} rate={startArrival} />
          <FunnelRow label="開始 → 会作成" from={s.startUsers} rate={startToCreate} />
          <FunnelRow label="会作成 → 店提案" from={s.createEventUsers} rate={createToStore} />
          <FunnelRow label="店提案 → 清算完了" from={s.storeViewUsers} rate={storeToComplete} />
        </div>
      </Card>
    </>
  )
}

// ── 店探しファネル ────────────────────────────────────────────────────────────

function StoreFunnelView({ slice: s }: { slice: StoreFunnelSlice }) {
  const hasData = s.storeOnlyStart > 0 || s.conditionsSubmit > 0

  return (
    <>
      {/* ④ 店探しファネル */}
      <Card>
        <SectionLabel>店探しファネル</SectionLabel>
        {!hasData ? (
          <p className="py-2 text-center text-[11px] text-stone-300">まだデータがありません</p>
        ) : (
          <div className="divide-y divide-stone-100">
            <FunnelStep label="お店から開始" count={s.storeOnlyStart} />
            <FunnelStep label="条件送信" count={s.conditionsSubmit} prev={s.storeOnlyStart} />
            <FunnelStep label="候補表示" count={s.candidatesLoaded} prev={s.conditionsSubmit} />
            <FunnelStep label="HPリンク" count={s.hotpepperClick} prev={s.candidatesLoaded} />
            <FunnelStep label="お気に入り" count={s.favoriteClick} prev={s.candidatesLoaded} />
            <FunnelStep label="会作成へ移行" count={s.toEventCreate} prev={s.storeOnlyStart} accent />
            <div className="flex items-center justify-between py-2.5">
              <p className="text-[11px] font-bold text-stone-400">候補切替（回）</p>
              <p className="text-[15px] font-black text-stone-600">{s.candidateSwitch.toLocaleString()}</p>
            </div>
          </div>
        )}
      </Card>

      {/* ⑤ mode 別比較 */}
      {(s.storeOnly.candidatesLoaded + s.eventFlow.candidatesLoaded) > 0 && (
        <Card>
          <SectionLabel>mode 別比較（イベント数）</SectionLabel>
          <div>
            <div className="mb-2 grid grid-cols-3 gap-1 text-[9px] font-black uppercase tracking-wider text-stone-400">
              <span />
              <span className="text-center">store_only</span>
              <span className="text-center">event_flow</span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: '候補表示', so: s.storeOnly.candidatesLoaded, ef: s.eventFlow.candidatesLoaded },
                { label: 'HPリンク', so: s.storeOnly.hotpepperClick,   ef: s.eventFlow.hotpepperClick },
                { label: 'お気に入り', so: s.storeOnly.favoriteClick,  ef: s.eventFlow.favoriteClick },
              ].map(({ label, so, ef }) => (
                <div key={label} className="grid grid-cols-3 items-center gap-1 rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-stone-100">
                  <p className="text-[11px] font-bold text-stone-600">{label}</p>
                  <p className="text-center text-[15px] font-black text-stone-800">{so}</p>
                  <p className="text-center text-[15px] font-black text-stone-800">{ef}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ⑥ よく使われる条件 */}
      {(s.topAreas.length > 0 || s.topGenres.length > 0 || s.peopleCounts.length > 0) && (
        <Card>
          <SectionLabel>よく使われる条件</SectionLabel>
          <div className="space-y-5">
            {s.topAreas.length > 0 && (
              <RankingList title="人気エリア" items={s.topAreas} />
            )}
            {s.topGenres.length > 0 && (
              <RankingList title="人気ジャンル" items={s.topGenres} />
            )}
            {s.peopleCounts.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold text-stone-500">人数帯</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.peopleCounts.map(({ count, freq }) => (
                    <span key={count} className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-700 ring-1 ring-stone-200">
                      {count}人 <span className="font-normal text-stone-400">×{freq}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  )
}

// ── リピーター指標 ────────────────────────────────────────────────────────────

function RetentionView({ slice: s }: { slice: RetentionSlice }) {
  const ra = s.returningActivity
  const activityItems: Array<{ label: string; count: number }> = [
    { label: '店探し開始', count: ra.storeOnlyStart },
    { label: '候補表示', count: ra.storeCandidatesLoaded },
    { label: 'HPリンク', count: ra.hotpepperClick },
    { label: 'お気に入り', count: ra.favoriteClick },
    { label: '会作成', count: ra.createEvent },
    { label: '清算完了', count: ra.completeSettlement },
  ]

  return (
    <>
      {/* ⑦ リピーター指標 */}
      <Card>
        <SectionLabel>リピーター指標</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <MetricCell label="全ユーザー" value={s.totalUsers} />
          <MetricCell label="再訪ユーザー" value={s.returningUsers} rate={s.returningRate} />
          <MetricCell label="店探しユーザー" value={s.storeStarters} />
          <MetricCell label="店探しリピーター" value={s.storeReturningUsers} rate={s.storeReturningRate} />
        </div>
      </Card>

      {/* ⑧ 再訪ユーザーの行動内訳 */}
      {s.returningUsers > 0 && (
        <Card>
          <SectionLabel>再訪ユーザーの行動内訳</SectionLabel>
          <p className="mb-3 text-[10px] text-stone-400">{s.returningUsers}人中</p>
          <div className="space-y-2.5">
            {activityItems.map(({ label, count }) => (
              <div key={label} className="flex items-center gap-3">
                <p className="w-24 shrink-0 text-[11px] font-bold text-stone-600">{label}</p>
                <div className="flex flex-1 items-center gap-2">
                  <div className="flex-1 overflow-hidden rounded-full bg-stone-100" style={{ height: 6 }}>
                    <div
                      className="h-full rounded-full bg-stone-600 transition-all duration-500"
                      style={{ width: `${s.returningUsers > 0 ? Math.round((count / s.returningUsers) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="w-9 text-right text-[13px] font-black text-stone-800">{count}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}

// ── 共通パーツ ────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">{children}</p>
  )
}

function MetricCell({ label, value, rate }: { label: string; value: number; rate?: number }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-3 ring-1 ring-stone-100">
      <p className="text-[10px] font-bold text-stone-400">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <p className="text-2xl font-black tracking-tight text-stone-900">{value.toLocaleString()}</p>
        {rate !== undefined && (
          <p className="text-[11px] font-bold text-stone-400">{rate}%</p>
        )}
      </div>
    </div>
  )
}

function StartBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const ratio = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[12px] font-bold text-stone-700">{label}</p>
        <p className="text-[11px] font-bold text-stone-500">{count.toLocaleString()}人 · {ratio}%</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${ratio}%` }} />
      </div>
    </div>
  )
}

function FunnelRow({ label, from, rate }: { label: string; from: number; rate: number }) {
  const color = rate >= 50 ? 'bg-emerald-500' : rate >= 25 ? 'bg-amber-400' : 'bg-stone-300'
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0">
        <p className="text-[11px] font-bold text-stone-600">{label}</p>
        <p className="text-[10px] text-stone-400">{from.toLocaleString()}人中</p>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <div className="flex-1 overflow-hidden rounded-full bg-stone-100" style={{ height: 7 }}>
          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${rate}%` }} />
        </div>
        <p className="w-9 text-right text-[13px] font-black text-stone-800">{rate}%</p>
      </div>
    </div>
  )
}

function FunnelStep({
  label, count, prev, accent,
}: {
  label: string
  count: number
  prev?: number
  accent?: boolean
}) {
  const rate = prev != null && prev > 0 ? pct(count, prev) : null
  const rateColor =
    rate == null ? '' : rate >= 50 ? 'text-emerald-600' : rate >= 25 ? 'text-amber-500' : 'text-stone-400'
  return (
    <div className="flex items-center justify-between py-2.5">
      <p className={`text-[12px] font-bold ${accent ? 'text-stone-900' : 'text-stone-600'}`}>{label}</p>
      <div className="flex items-center gap-2.5">
        {rate !== null && (
          <span className={`rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold ${rateColor}`}>
            前段比 {rate}%
          </span>
        )}
        <p className={`text-[16px] font-black tabular-nums ${accent ? 'text-stone-900' : 'text-stone-700'}`}>
          {count.toLocaleString()}
        </p>
      </div>
    </div>
  )
}

function RankingList({ title, items }: { title: string; items: Array<{ name: string; count: number }> }) {
  const max = items[0]?.count ?? 1
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold text-stone-500">{title}</p>
      <div className="space-y-2">
        {items.map(({ name, count }) => (
          <div key={name} className="flex items-center gap-2">
            <p className="w-20 shrink-0 truncate text-[11px] font-bold text-stone-700">{name}</p>
            <div className="flex-1 overflow-hidden rounded-full bg-stone-100" style={{ height: 5 }}>
              <div
                className="h-full rounded-full bg-stone-600 transition-all duration-500"
                style={{ width: `${Math.round((count / max) * 100)}%` }}
              />
            </div>
            <p className="w-5 text-right text-[11px] font-black text-stone-700">{count}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
