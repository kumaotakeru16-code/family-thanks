'use client'

import { useEffect, useMemo, useState } from 'react'
// 削除
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── 型 ────────────────────────────────────────────────────────────────────────

type EventDateRow = {
  id: string
  event_id: string
  label: string | null
  sort_order: number | null
}

type ResponseRow = {
  id: string
  participant_name: string | null
  /** { date1: 'yes'|'maybe'|'no', date2: ..., ... } で保存されている */
  date_answers: Record<string, string>
}

type DecisionRow = {
  selected_date_id: string | null
}

type AvailabilityValue = 'yes' | 'maybe' | 'no'
type ParticipantGenre = '和食' | '洋食' | '中華'


/** 日程別に集計した参加者名リスト */
type DateStats = {
  dateId: string
  label: string
  yes: string[]
  maybe: string[]
  no: string[]
}

type ParticipantMatrixRow = {
  participantName: string
  values: AvailabilityValue[]
}

const PARTICIPANT_GENRE_OPTIONS: ParticipantGenre[] = ['和食', '洋食', '中華']

// ── 回答保持（localStorage） ──────────────────────────────────────────────────
//
// 同じ端末・同じブラウザで同じイベント URL を開いたとき、前回の回答を復元する。
//
// 保存キー: kanji_participant_response_{eventId}
// デバッグ: ?debug_multi=1 付きで開いた場合は保存・復元を無効化する
//           → 同じ端末で複数参加者のテストが可能

type SavedResponse = {
  participantName: string
  answers: Record<string, AvailabilityValue>
  prefGenre: ParticipantGenre | null
  /** 初回送信で取得した DB 行の id。再送信時に UPDATE するために使う */
  responseId?: string
}

function responseStorageKey(eventId: string): string {
  return `kanji_participant_response_${eventId}`
}

function loadSavedResponse(eventId: string): SavedResponse | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(responseStorageKey(eventId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as Record<string, unknown>).participantName !== 'string'
    ) return null
    return parsed as SavedResponse
  } catch {
    return null
  }
}

function saveResponseLocally(eventId: string, data: SavedResponse): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(responseStorageKey(eventId), JSON.stringify(data))
  } catch {
    // QuotaExceeded など — 無視（保存できなくても送信は成功している）
  }
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export default function EventParticipantPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const eventId = params?.eventId as string
  const isDebugMulti = searchParams?.get('debug_multi') === '1'

  // ── UI 状態 ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('answer')
  const [showResponseTable, setShowResponseTable] = useState(false)



  // ── イベントデータ ────────────────────────────────────────────────────────
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('')
  const [dates, setDates] = useState<EventDateRow[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [decision, setDecision] = useState<DecisionRow | null>(null)

  // ── フォーム入力 ──────────────────────────────────────────────────────────
  const [participantName, setParticipantName] = useState('')
  const [answers, setAnswers] = useState<Record<string, AvailabilityValue | undefined>>({})
  const [prefGenre, setPrefGenre] = useState<ParticipantGenre | null>(null)

  // ── 回答保持 ──────────────────────────────────────────────────────────────
  const [hasSavedResponse, setHasSavedResponse] = useState(false)
  const [savedResponseId, setSavedResponseId] = useState<string | undefined>(undefined)

  // ── データ取得 ────────────────────────────────────────────────────────────
  // events / event_dates / responses / decisions を並列取得する
  useEffect(() => {
    if (!eventId) return

    const fetchPageData = async () => {
      setLoading(true)
      setErrorMessage('')

      const [
        { data: eventData, error: eventError },
        { data: dateData, error: dateError },
        { data: responseData },
        { data: decisionData },
      ] = await Promise.all([
        supabase.from('events').select('id, name, event_type').eq('id', eventId),
        supabase
          .from('event_dates')
          .select('id, event_id, label, sort_order')
          .eq('event_id', eventId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('responses')
          .select('id, participant_name, date_answers')
          .eq('event_id', eventId),
        supabase
          .from('decisions')
          .select('selected_date_id')
          .eq('event_id', eventId)
          .maybeSingle(),
      ])

      if (eventError) {
        setErrorMessage(`イベント取得エラー: ${eventError.message}`)
        setLoading(false)
        return
      }
      if (!eventData || eventData.length === 0) {
        setErrorMessage('イベントが見つかりませんでした')
        setLoading(false)
        return
      }
      if (dateError) {
        setErrorMessage(`候補日取得エラー: ${dateError.message}`)
        setLoading(false)
        return
      }

      const event = eventData[0] as { name: string | null; event_type: string | null }
      setEventName(event.name ?? '')
      setEventType(event.event_type ?? '')
      setDates((dateData ?? []) as EventDateRow[])
      setResponses((responseData ?? []) as ResponseRow[])
      setDecision(decisionData as DecisionRow | null)
      setLoading(false)
    }

    fetchPageData()
  }, [eventId])

  // ── 保存済み回答の復元 ────────────────────────────────────────────────────
  // loading: false になってから（dates 確定後に）復元する
  useEffect(() => {
    if (loading) return
    if (!eventId) return
    if (isDebugMulti) return

    const saved = loadSavedResponse(eventId)
    if (!saved) return

    setParticipantName(saved.participantName)
    setAnswers(saved.answers as Record<string, AvailabilityValue | undefined>)
    if (saved.prefGenre) setPrefGenre(saved.prefGenre)
    if (saved.responseId) setSavedResponseId(saved.responseId)
    setHasSavedResponse(true)
  }, [loading, eventId, isDebugMulti])

  // ── 計算 ──────────────────────────────────────────────────────────────────

  const allAnswered = useMemo(() => {
    if (dates.length === 0) return false
    return dates.every((d) => !!answers[d.id])
  }, [dates, answers])

  /**
   * 日程別に ○/△/× の参加者名を集計する。
   *
   * date_answers は { date1: 'yes', date2: 'no', ... } 形式で保存されており、
   * 'date{index+1}' が dates[index] に対応する（sort_order で並んだ順）。
   */
  const dateStats = useMemo((): DateStats[] => {
    if (dates.length === 0) return []
    return dates.map((date, index) => {
      const key = `date${index + 1}`
      const yes: string[] = []
      const maybe: string[] = []
      const no: string[] = []
      for (const r of responses) {
        const answer = r.date_answers?.[key]
        const name = r.participant_name?.trim() || '（名前なし）'
        if (answer === 'yes') yes.push(name)
        else if (answer === 'maybe') maybe.push(name)
        else if (answer === 'no') no.push(name)
      }
      return { dateId: date.id, label: date.label ?? '日付未設定', yes, maybe, no }
    })
  }, [dates, responses])

  const participantMatrix = useMemo((): ParticipantMatrixRow[] => {
  if (dates.length === 0 || responses.length === 0) return []

  return responses.map((r) => {
    const participantName = r.participant_name?.trim() || '（名前なし）'
    const values = dates.map((_, index) => {
      const key = `date${index + 1}`
      const raw = r.date_answers?.[key]
      return raw === 'yes' || raw === 'maybe' || raw === 'no' ? raw : 'no'
    })

    return { participantName, values }
  })
}, [dates, responses])

function formatDateLabelShort(label: string | null): string {
  if (!label) return '日付未設定'

  // "4/15（水）18:00" → "4/15（水）"
  const match = label.match(/^(.+?\）)/)
  if (match) return match[1]

  // fallback: スペース区切りで時間削除
  return label.split(' ')[0]
}

function isTopColumn(label: string, topDateLabels: string[]): boolean {
  return topDateLabels.includes(label)
}

  /**
   * "今のところ一番集まりそうな日程" を計算する。
   *
   * 表示条件: 回答者数 3 人以上のみ（少ないと誘導に見える）。
   * 判定基準: ○多い順 → △多い順でソート。同率なら複数ラベルを返す。
   * 非表示条件: 全日程で ○△ がゼロ（全員 × のみ）。
   */
  const { topDateLabels, showSummary } = useMemo(() => {
    if (responses.length < 3 || dateStats.length === 0) {
      return { topDateLabels: [] as string[], showSummary: false }
    }
    const sorted = [...dateStats].sort((a, b) => {
      if (b.yes.length !== a.yes.length) return b.yes.length - a.yes.length
      return b.maybe.length - a.maybe.length
    })
    const best = sorted[0]
    if (best.yes.length === 0 && best.maybe.length === 0) {
      return { topDateLabels: [] as string[], showSummary: false }
    }
    const tops = sorted.filter(
      (d) => d.yes.length === best.yes.length && d.maybe.length === best.maybe.length,
    )
    return { topDateLabels: tops.map((d) => d.label), showSummary: true }
  }, [dateStats, responses])

  /** 会の情報タブ用: 決定済み日程のラベル */
  const confirmedDateLabel = useMemo(() => {
    if (!decision?.selected_date_id) return null
    return dates.find((d) => d.id === decision.selected_date_id)?.label ?? null
  }, [decision, dates])

  

  const isDateConfirmed = useMemo(() => {
  return !!decision?.selected_date_id
}, [decision])

  // ── ハンドラー ────────────────────────────────────────────────────────────

  const setAnswer = (eventDateId: string, value: AvailabilityValue) => {
    setAnswers((prev) => ({ ...prev, [eventDateId]: value }))
  }

  const submitResponse = async () => {
    if (!participantName.trim()) {
      setErrorMessage('名前を入力してください')
      return
    }
    if (!allAnswered) {
      setErrorMessage('すべての候補日に回答してください')
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const dateAnswers: Record<string, string> = {}
    dates.forEach((d, index) => {
      dateAnswers[`date${index + 1}`] = answers[d.id] || 'maybe'
    })
    const genres = prefGenre ? [prefGenre] : []

    // 再送信（savedResponseId あり）は UPDATE、初回は INSERT
    if (savedResponseId) {
      const { error, count } = await supabase
        .from('responses')
        .update({ participant_name: participantName.trim(), date_answers: dateAnswers, genres })
        .eq('id', savedResponseId)

      // UPDATE 成功（対象行が存在した）
      if (!error && count !== 0) {
        if (!isDebugMulti) {
          saveResponseLocally(eventId, {
            participantName: participantName.trim(),
            answers: answers as Record<string, AvailabilityValue>,
            prefGenre,
            responseId: savedResponseId,
          })
        }
        setSubmitting(false)
        setSubmitted(true)
        return
      }

      // UPDATE 失敗 or 対象行なし（responseId が無効・削除済み）
      // → ローカルの古い responseId を破棄して INSERT にフォールバック
      setSavedResponseId(undefined)
      setHasSavedResponse(false)
      if (!isDebugMulti) {
        try { localStorage.removeItem(responseStorageKey(eventId)) } catch { /* ignore */ }
      }
      if (error) {
        console.warn('[kanji] response UPDATE 失敗。INSERT にフォールバックします:', error.message)
      }
    }

    // INSERT（初回 or UPDATE フォールバック）
    {
      const { data, error } = await supabase
        .from('responses')
        .insert({
          event_id: eventId,
          participant_name: participantName.trim(),
          date_answers: dateAnswers,
          genres,
          areas: [],
        })
        .select('id')
        .single()

      if (error) {
        setErrorMessage(`回答送信エラー: ${error.message}`)
        setSubmitting(false)
        return
      }

      if (!isDebugMulti && data?.id) {
        const responseId = data.id as string
        setSavedResponseId(responseId)
        saveResponseLocally(eventId, {
          participantName: participantName.trim(),
          answers: answers as Record<string, AvailabilityValue>,
          prefGenre,
          responseId,
        })
      }
    }

    setSubmitting(false)
    setSubmitted(true)
  }

  // ── レンダリング ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
        読み込み中...
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-12 sm:px-6">
        <div className="space-y-4">
          <div className="rounded-3xl bg-white px-6 py-8 shadow-sm ring-1 ring-black/5">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">Thanks</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-stone-900">
              回答ありがとうございました
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              幹事がみんなの回答を見て、日程を調整します。
            </p>
            <p className="mt-3 text-xs leading-5 text-stone-400">
              予定が変わっても大丈夫です。同じ端末・同じブラウザでこのページを開けば、回答をあとから修正できます。
            </p>
          </div>

          <div className="rounded-2xl border border-stone-100 bg-stone-50 px-5 py-5">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">
              この会の幹事が使っているアプリ
            </p>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-800">
                <div className="flex flex-col items-center gap-0">
                  <CalendarDays size={13} className="text-white/80" strokeWidth={1.8} />
                  <span className="text-[7px] font-black leading-none tracking-tight text-white">幹事</span>
                </div>
              </div>
              <span className="text-sm font-black tracking-wide text-stone-800">KANJI</span>
            </div>
            <p className="mt-2.5 text-xs leading-5 text-stone-400">
              幹事のやることを、まとめて進められます
            </p>
            <a
              href="/"
              className="mt-3.5 inline-block text-xs font-bold text-stone-600 underline underline-offset-2 transition hover:text-stone-800"
            >
              このアプリで会を作る →
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-32 pt-8 sm:px-6">
      {/* ── イベントヘッダー ─────────────────────────────────────────────── */}
      <div className="mb-5 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">Event</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-stone-900">{eventName}</h1>
        <p className="mt-1 text-sm text-stone-400">{eventType}</p>
      </div>

 

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 回答タブ                                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
{!isDateConfirmed && (
        <div className="space-y-5">

          {/* 日程サマリー（3人以上回答時のみ表示） */}
          {showSummary && (
            <div className="rounded-2xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100">
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-stone-400">
                現時点の状況
              </p>
              <p className="text-sm leading-6 text-stone-700">
              {topDateLabels.length === 1
  ? `現時点では「${topDateLabels[0]}」に回答が集まっています`
  : topDateLabels.length === 2
  ? `現時点では「${topDateLabels[0]}」と「${topDateLabels[1]}」に同程度で回答が集まっています`
  : '現時点では複数の日程に同程度で回答が集まっています'}
              </p>
            </div>
          )}

 {/* みんなの回答（アコーディオン） */}
<div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
  <button
    type="button"
    onClick={() => setShowResponseTable((v) => !v)}
    className="flex w-full items-center justify-between px-4 py-3.5"
  >
    <span className="text-sm font-bold text-stone-700">
      みんなの回答を見る
      <span className="ml-2 font-normal text-stone-400">
        {responses.length}人
      </span>
    </span>
    {showResponseTable
      ? <ChevronUp size={16} className="shrink-0 text-stone-400" />
      : <ChevronDown size={16} className="shrink-0 text-stone-400" />
    }
  </button>

  {showResponseTable && (
    <div className="border-t border-stone-100 px-4 pb-4 pt-3">
      {responses.length === 0 ? (
        <p className="text-sm leading-6 text-stone-400">
          まだ回答はありません。
        </p>
      ) : (
        <div className="space-y-3">
          {responses.length <= 2 && (
            <p className="text-xs leading-5 text-stone-400">
              まだ回答は集まり始めたばかりです。
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 rounded-l-xl bg-stone-50 px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider text-stone-400">
                    名前
                  </th>

                  {dates.map((d) => {
                    const isTop = showSummary && isTopColumn(d.label ?? '日付未設定', topDateLabels)

                    return (
                      <th
                        key={d.id}
                        className={`min-w-[72px] px-2 py-3 text-center text-[10px] font-black tracking-wider ${
                          isTop
                            ? 'rounded-t-xl bg-stone-800 text-white'
                            : 'text-stone-400'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{formatDateLabelShort(d.label)}</span>
                          {isTop && (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                              現在最多
                            </span>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {participantMatrix.map((row) => (
                  <tr key={row.participantName}>
                    <td className="sticky left-0 z-10 rounded-l-xl bg-white px-3 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-100">
                      {row.participantName}
                    </td>

                    {row.values.map((value, index) => {
                      const colLabel = dates[index]?.label ?? '日付未設定'
                      const isTop = showSummary && isTopColumn(colLabel, topDateLabels)

                      return (
                        <td
                          key={`${row.participantName}-${dates[index]?.id ?? index}`}
                          className={`px-2 py-3 text-center text-base font-black ring-1 ${
                            isTop
                              ? 'bg-stone-800 text-white ring-stone-800'
                              : 'bg-white text-stone-700 ring-stone-100'
                          }`}
                        >
                          <span
                            className={
                              value === 'yes'
                                ? isTop ? 'text-emerald-300' : 'text-emerald-500'
                                : value === 'maybe'
                                ? isTop ? 'text-amber-300' : 'text-amber-500'
                                : isTop ? 'text-white/30' : 'text-stone-300'
                            }
                          >
                            {value === 'yes' ? '○' : value === 'maybe' ? '△' : '×'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )}
</div>

          {/* 前回回答復元バナー */}
          {hasSavedResponse && (
            <div className="rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
              <p className="text-xs leading-5 text-stone-500">
                前回の回答を読み込みました。内容を変更して再送信できます。
              </p>
            </div>
          )}

          {/* お名前 */}
          <div className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-bold text-stone-900">お名前</p>
            <input
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="例：田中"
              className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none placeholder:text-stone-400"
            />
          </div>

          {/* 候補日 */}
          <div className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-bold text-stone-900">候補日</p>
            {dates.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">候補日はまだありません</p>
            ) : (
              <div className="mt-3 space-y-4">
                {dates.map((d) => {
                  const selected = answers[d.id]
                  return (
                    <div key={d.id} className="rounded-2xl bg-stone-50 px-4 py-4">
                      <p className="text-sm font-medium text-stone-800">
                        {d.label ?? '日付未設定'}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setAnswer(d.id, 'yes')}
                          className={`flex items-center justify-center rounded-xl px-3 py-3 ring-1 transition active:scale-95 ${
                            selected === 'yes'
                              ? 'bg-emerald-500 ring-emerald-500'
                              : 'bg-white ring-stone-200 hover:ring-emerald-300'
                          }`}
                        >
                          <span className={`text-[18px] font-black leading-none tracking-tight ${selected === 'yes' ? 'text-white' : 'text-emerald-400'}`}>○</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswer(d.id, 'maybe')}
                          className={`flex items-center justify-center rounded-xl px-3 py-3 ring-1 transition active:scale-95 ${
                            selected === 'maybe'
                              ? 'bg-amber-400 ring-amber-400'
                              : 'bg-white ring-stone-200 hover:ring-amber-300'
                          }`}
                        >
                          <span className={`text-[18px] font-black leading-none tracking-tight ${selected === 'maybe' ? 'text-white' : 'text-amber-400'}`}>△</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswer(d.id, 'no')}
                          className={`flex items-center justify-center rounded-xl px-3 py-3 ring-1 transition active:scale-95 ${
                            selected === 'no'
                              ? 'bg-stone-500 ring-stone-500'
                              : 'bg-white ring-stone-200 hover:ring-stone-300'
                          }`}
                        >
                          <span className={`text-[18px] font-black leading-none tracking-tight ${selected === 'no' ? 'text-white' : 'text-stone-300'}`}>×</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ジャンル */}
          <div className="rounded-3xl bg-white px-4 py-5 shadow-sm ring-1 ring-stone-100">
            <p className="text-sm font-bold text-stone-900">何系のお店がいい？（任意）</p>
            <p className="mt-1 text-xs leading-5 text-stone-400">幹事が候補を選ぶときの参考にします</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PARTICIPANT_GENRE_OPTIONS.map((option) => {
                const isSelected = prefGenre === option
                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => setPrefGenre(isSelected ? null : option)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
                      isSelected
                        ? 'bg-stone-800 text-white ring-stone-800'
                        : 'bg-stone-50 text-stone-500 ring-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          {/* エラー */}
          {errorMessage && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {errorMessage}
            </div>
          )}
        </div>
      )}
{/* ══════════════════════════════════════════════════════════════════ */}
{/* 日程確定後ビュー                                                     */}
{/* ══════════════════════════════════════════════════════════════════ */}
{isDateConfirmed && (
  <div className="space-y-4 pb-4">
    <div className="rounded-3xl bg-white px-6 py-8 shadow-sm ring-1 ring-black/5">
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
        Confirmed
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-stone-900">
        日程が確定しました
      </h2>

      {confirmedDateLabel ? (
        <div className="mt-5 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
            確定日程
          </p>
          <p className="mt-1 text-base font-bold text-stone-900">
            {confirmedDateLabel}
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
          <p className="text-sm text-stone-500">
            日程が確定しています。
          </p>
        </div>
      )}

      <p className="mt-4 text-sm leading-6 text-stone-600">
        回答受付は終了しました。詳細は幹事からの案内をお待ちください。
      </p>
    </div>
  </div>
)}
      {/* ── Sticky CTA（回答タブのみ） ───────────────────────────────────── */}
    {!isDateConfirmed && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-6 pt-4">
          <div className="mx-auto max-w-2xl space-y-2">
            <p className="text-center text-[11px] leading-5 text-stone-400">
              あとで予定が変わっても大丈夫です。同じ端末・同じブラウザで開けば修正できます。
            </p>
            <button
              type="button"
              onClick={submitResponse}
              disabled={submitting}
              className="w-full rounded-2xl bg-stone-900 px-4 py-4 text-base font-black text-white shadow-lg transition hover:bg-stone-800 active:scale-[0.98] disabled:opacity-40"
            >
              {submitting ? '送信中…' : hasSavedResponse ? '回答を更新' : '回答を送信'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── サブコンポーネント ─────────────────────────────────────────────────────────



/**
 * 回答テーブル用: ○/△/× と参加者名を1行で表示する
 *
 * isTop = true のとき（暗背景カード内）は文字色を白ベースにする
 */
