'use client'

/**
 * /admin — 運営向け利用状況ダッシュボード
 *
 * 一般ユーザーへの導線はなし。URL を直接入力した人だけアクセスできる。
 * 認証なし（anon_user_id による自分除外のみ）。
 */

import { useEffect, useState } from 'react'
import { BarChart2, RefreshCw } from 'lucide-react'
import { loadDashboard, pct, type AnalyticsDashboard, type AnalyticsSlice } from '@/app/lib/analytics'
import { getAnonId } from '@/app/lib/storage/anonymous-id'

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekMode, setWeekMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [myId, setMyId] = useState('')
  const [copied, setCopied] = useState(false)

  async function fetch() {
    setLoading(true)
    try {
      const id = getAnonId()
      const data = await loadDashboard(id)
      setDashboard(data)
      setLastUpdated(new Date())
    } catch {
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMyId(getAnonId())
    void fetch()
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F3EF] px-4 pb-16 pt-10">
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
          <DashboardView slice={weekMode ? dashboard.week : dashboard.all} />
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

// ── ダッシュボード本体 ─────────────────────────────────────────────────────────

function DashboardView({ slice: s }: { slice: AnalyticsSlice }) {
  const startTotal = s.startDatesUsers + s.startStoreUsers
  const startArrival = pct(s.startUsers, s.appOpenUsers)
  const startToCreate = pct(s.createEventUsers, s.startUsers)
  const createToStore = pct(s.storeViewUsers, s.createEventUsers)
  const storeToComplete = pct(s.completeUsers, s.storeViewUsers)

  return (
    <div className="space-y-4">

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

    </div>
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
