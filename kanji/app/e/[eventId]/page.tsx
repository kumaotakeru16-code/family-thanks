'use client'

import { useEffect, useMemo, useState } from 'react'
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
  date_answers: Record<string, string>
}

type DecisionRow = {
  selected_date_id: string | null
}

type AvailabilityValue = 'yes' | 'maybe' | 'no'
type ParticipantGenre = '和食' | '洋食' | '中華'

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

type SavedResponse = {
  participantName: string
  answers: Record<string, AvailabilityValue>
  prefGenre: ParticipantGenre | null
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
  } catch { /* QuotaExceeded など — 無視 */ }
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export default function EventParticipantPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const eventId = params?.eventId as string
  const isDebugMulti = searchParams?.get('debug_multi') === '1'

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showResponseTable, setShowResponseTable] = useState(false)

  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('')
  const [dates, setDates] = useState<EventDateRow[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [decision, setDecision] = useState<DecisionRow | null>(null)

  const [participantName, setParticipantName] = useState('')
  const [answers, setAnswers] = useState<Record<string, AvailabilityValue | undefined>>({})
  const [prefGenre, setPrefGenre] = useState<ParticipantGenre | null>(null)

  const [hasSavedResponse, setHasSavedResponse] = useState(false)
  const [savedResponseId, setSavedResponseId] = useState<string | undefined>(undefined)

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
        supabase.from('event_dates').select('id, event_id, label, sort_order').eq('event_id', eventId).order('sort_order', { ascending: true }),
        supabase.from('responses').select('id, participant_name, date_answers').eq('event_id', eventId),
        supabase.from('decisions').select('selected_date_id').eq('event_id', eventId).maybeSingle(),
      ])
      if (eventError) { setErrorMessage(`イベント取得エラー: ${eventError.message}`); setLoading(false); return }
      if (!eventData || eventData.length === 0) { setErrorMessage('イベントが見つかりませんでした'); setLoading(false); return }
      if (dateError) { setErrorMessage(`候補日取得エラー: ${dateError.message}`); setLoading(false); return }
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

  useEffect(() => {
    if (loading || !eventId || isDebugMulti) return
    const saved = loadSavedResponse(eventId)
    if (!saved) return
    setParticipantName(saved.participantName)
    setAnswers(saved.answers as Record<string, AvailabilityValue | undefined>)
    if (saved.prefGenre) setPrefGenre(saved.prefGenre)
    if (saved.responseId) setSavedResponseId(saved.responseId)
    setHasSavedResponse(true)
  }, [loading, eventId, isDebugMulti])

  const allAnswered = useMemo(() => {
    if (dates.length === 0) return false
    return dates.every((d) => !!answers[d.id])
  }, [dates, answers])

  const dateStats = useMemo((): DateStats[] => {
    if (dates.length === 0) return []
    return dates.map((date, index) => {
      const key = `date${index + 1}`
      const yes: string[] = [], maybe: string[] = [], no: string[] = []
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
      const name = r.participant_name?.trim() || '（名前なし）'
      const values = dates.map((_, index) => {
        const key = `date${index + 1}`
        const raw = r.date_answers?.[key]
        return raw === 'yes' || raw === 'maybe' || raw === 'no' ? raw : 'no'
      })
      return { participantName: name, values }
    })
  }, [dates, responses])

  function formatDateLabelShort(label: string | null): string {
    if (!label) return '—'
    const match = label.match(/^(.+?\）)/)
    if (match) return match[1]
    return label.split(' ')[0]
  }

  const { topDateLabels, showSummary } = useMemo(() => {
    if (responses.length < 3 || dateStats.length === 0) return { topDateLabels: [] as string[], showSummary: false }
    const sorted = [...dateStats].sort((a, b) => {
      if (b.yes.length !== a.yes.length) return b.yes.length - a.yes.length
      return b.maybe.length - a.maybe.length
    })
    const best = sorted[0]
    if (best.yes.length === 0 && best.maybe.length === 0) return { topDateLabels: [] as string[], showSummary: false }
    const tops = sorted.filter((d) => d.yes.length === best.yes.length && d.maybe.length === best.maybe.length)
    return { topDateLabels: tops.map((d) => d.label), showSummary: true }
  }, [dateStats, responses])

  const confirmedDateLabel = useMemo(() => {
    if (!decision?.selected_date_id) return null
    return dates.find((d) => d.id === decision.selected_date_id)?.label ?? null
  }, [decision, dates])

  const isDateConfirmed = useMemo(() => !!decision?.selected_date_id, [decision])

  const setAnswer = (eventDateId: string, value: AvailabilityValue) => {
    setAnswers((prev) => ({ ...prev, [eventDateId]: value }))
  }

  const submitResponse = async () => {
    if (!participantName.trim()) { setErrorMessage('名前を入力してください'); return }
    if (!allAnswered) { setErrorMessage('すべての候補日に回答してください'); return }
    setSubmitting(true)
    setErrorMessage('')

    const dateAnswers: Record<string, string> = {}
    dates.forEach((d, index) => { dateAnswers[`date${index + 1}`] = answers[d.id] || 'maybe' })
    const genres = prefGenre ? [prefGenre] : []

    if (savedResponseId) {
      const { error, count } = await supabase
        .from('responses')
        .update({ participant_name: participantName.trim(), date_answers: dateAnswers, genres })
        .eq('id', savedResponseId)
      if (!error && count !== 0) {
        if (!isDebugMulti) saveResponseLocally(eventId, { participantName: participantName.trim(), answers: answers as Record<string, AvailabilityValue>, prefGenre, responseId: savedResponseId })
        setSubmitting(false); setSubmitted(true); return
      }
      setSavedResponseId(undefined); setHasSavedResponse(false)
      if (!isDebugMulti) { try { localStorage.removeItem(responseStorageKey(eventId)) } catch { /* ignore */ } }
    }

    const { data, error } = await supabase
      .from('responses')
      .insert({ event_id: eventId, participant_name: participantName.trim(), date_answers: dateAnswers, genres, areas: [] })
      .select('id').single()
    if (error) { setErrorMessage(`回答送信エラー: ${error.message}`); setSubmitting(false); return }
    if (!isDebugMulti && data?.id) {
      const responseId = data.id as string
      setSavedResponseId(responseId)
      saveResponseLocally(eventId, { participantName: participantName.trim(), answers: answers as Record<string, AvailabilityValue>, prefGenre, responseId })
    }
    setSubmitting(false); setSubmitted(true)
  }

  // ── レンダリング ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-12 sm:px-6">
        <div className="space-y-4">
          {/* 完了カード */}
          <div
            className="overflow-hidden rounded-3xl ring-1 ring-white/10"
            style={{ background: 'linear-gradient(160deg, #1e3a22 0%, #0e1c10 100%)' }}
          >
            <div className="h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="px-6 py-8">
              <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: 'rgba(214,175,60,0.65)' }}>Thanks</p>
              <h1 className="mt-2 text-[26px] font-black tracking-tight text-white">
                回答ありがとうございます
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/55">
                幹事がみんなの回答を見て、日程を調整します。
              </p>
              <p className="mt-3 text-xs leading-5 text-white/35">
                予定が変わっても大丈夫です。同じ端末・同じブラウザでこのページを開けば、回答をあとから修正できます。
              </p>
            </div>
          </div>

          {/* アプリ紹介 */}
          <div className="rounded-2xl bg-white/5 px-5 py-5 ring-1 ring-white/8">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
              この会の幹事が使っているアプリ
            </p>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900">
                <div className="flex flex-col items-center gap-0">
                  <CalendarDays size={13} className="text-white/80" strokeWidth={1.8} />
                  <span className="text-[7px] font-black leading-none tracking-tight text-white">幹事</span>
                </div>
              </div>
              <span className="text-sm font-black tracking-wide text-white">KANJI</span>
            </div>
            <p className="mt-2.5 text-xs leading-5 text-white/40">
              幹事のやることを、まとめて進められます
            </p>
            <a
              href="/"
              className="mt-3.5 inline-block text-xs font-bold text-emerald-400/80 underline underline-offset-2 transition hover:text-emerald-400"
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
      <div className="mb-6 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Event</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">{eventName}</h1>
        {eventType && <p className="mt-1 text-sm text-white/40">{eventType}</p>}
      </div>

      {/* ── 日程確定後ビュー ──────────────────────────────────────────────── */}
      {isDateConfirmed && (
        <div className="space-y-4 pb-4">
          <div
            className="overflow-hidden rounded-3xl ring-1 ring-white/10"
            style={{ background: 'linear-gradient(160deg, #1e3a22 0%, #0e1c10 100%)' }}
          >
            <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
            <div className="px-6 py-7">
              <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: 'rgba(214,175,60,0.65)' }}>Confirmed</p>
              <h2 className="mt-2 text-[22px] font-black tracking-tight text-white">日程が確定しました</h2>
              {confirmedDateLabel && (
                <p className="mt-3 text-[26px] font-black leading-tight" style={{ color: '#d4af3c' }}>
                  {confirmedDateLabel}
                </p>
              )}
              <p className="mt-3 text-sm leading-6 text-white/45">
                回答受付は終了しました。詳細は幹事からの案内をお待ちください。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 回答フォーム（日程確定前のみ） ───────────────────────────────── */}
      {!isDateConfirmed && (
        <div className="space-y-4">

          {/* 現時点の状況サマリー（Recommended Date ヒーロー） */}
          {showSummary && (
            <div
              className="overflow-hidden rounded-3xl ring-1 ring-white/10"
              style={{ background: 'linear-gradient(160deg, #1e3a22 0%, #0e1c10 100%)' }}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
              <div className="px-6 py-6">
                <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: 'rgba(214,175,60,0.65)' }}>
                  Recommended Date
                </p>
                {topDateLabels.length === 1 ? (
                  <>
                    <p className="mt-2 text-[26px] font-black leading-tight tracking-tight" style={{ color: '#d4af3c' }}>
                      {topDateLabels[0]}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-white/50">
                      現時点で最も回答が集まっている日程です
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mt-2 space-y-1">
                      {topDateLabels.map((label) => (
                        <p key={label} className="text-[20px] font-black leading-snug tracking-tight" style={{ color: '#d4af3c' }}>
                          {label}
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-5 text-white/50">
                      上記の日程に同程度で回答が集まっています
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* みんなの回答（アコーディオン） */}
          <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/8">
            <button
              type="button"
              onClick={() => setShowResponseTable((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3.5"
            >
              <span className="text-sm font-bold text-white/70">
                みんなの回答を見る
                <span className="ml-2 font-normal text-white/35">{responses.length}人</span>
              </span>
              {showResponseTable
                ? <ChevronUp size={15} className="shrink-0 text-white/35" />
                : <ChevronDown size={15} className="shrink-0 text-white/35" />
              }
            </button>

            {showResponseTable && (
              <div className="border-t border-white/8 px-4 pb-4 pt-3">
                {responses.length === 0 ? (
                  <p className="text-sm text-white/35">まだ回答はありません。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-1.5">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 bg-transparent px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-white/35">
                            名前
                          </th>
                          {dates.map((d) => {
                            const isTop = showSummary && topDateLabels.includes(d.label ?? '')
                            return (
                              <th
                                key={d.id}
                                className="min-w-[64px] px-2 py-2 text-center text-[10px] font-black tracking-wider text-white/35"
                              >
                                <div className="flex flex-col items-center gap-1">
                                  <span>{formatDateLabelShort(d.label)}</span>
                                  {isTop && (
                                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                                      最多
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
                            <td className="sticky left-0 z-10 rounded-l-xl bg-white/5 px-3 py-2.5 text-sm font-bold text-white/75 ring-1 ring-inset ring-white/8">
                              {row.participantName}
                            </td>
                            {row.values.map((value, index) => (
                              <td
                                key={`${row.participantName}-${dates[index]?.id ?? index}`}
                                className="px-2 py-2.5 text-center text-base font-black"
                              >
                                <span className={
                                  value === 'yes' ? 'text-emerald-400'
                                  : value === 'maybe' ? 'text-amber-400'
                                  : 'text-white/20'
                                }>
                                  {value === 'yes' ? '○' : value === 'maybe' ? '△' : '×'}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 前回回答復元バナー */}
          {hasSavedResponse && (
            <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/8">
              <p className="text-xs leading-5 text-white/45">
                前回の回答を読み込みました。内容を変更して再送信できます。
              </p>
            </div>
          )}

          {/* お名前 */}
          <div className="rounded-3xl bg-white/5 px-4 py-4 ring-1 ring-white/8">
            <p className="text-sm font-bold text-white/80">お名前</p>
            <input
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="例：田中"
              className="mt-3 w-full rounded-2xl bg-white/8 px-4 py-3 text-base text-white outline-none ring-1 ring-white/10 placeholder:text-white/25 focus:ring-white/20 transition"
            />
          </div>

          {/* 候補日 */}
          <div className="rounded-3xl bg-white/5 px-4 py-4 ring-1 ring-white/8">
            <p className="text-sm font-bold text-white/80">候補日</p>
            {dates.length === 0 ? (
              <p className="mt-3 text-sm text-white/35">候補日はまだありません</p>
            ) : (
              <div className="mt-3 space-y-3">
                {dates.map((d) => {
                  const selected = answers[d.id]
                  return (
                    <div key={d.id} className="rounded-2xl bg-white/5 px-4 py-4 ring-1 ring-white/8">
                      <p className="text-sm font-bold text-white/75">{d.label ?? '日付未設定'}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {/* ○ */}
                        <button
                          type="button"
                          onClick={() => setAnswer(d.id, 'yes')}
                          className={`flex items-center justify-center rounded-xl py-3 ring-1 transition active:scale-95 ${
                            selected === 'yes'
                              ? 'bg-emerald-500/25 ring-emerald-500/60'
                              : 'bg-white/5 ring-white/10 hover:ring-emerald-500/30'
                          }`}
                        >
                          <span className={`text-[20px] font-black leading-none ${selected === 'yes' ? 'text-emerald-400' : 'text-white/20'}`}>○</span>
                        </button>
                        {/* △ */}
                        <button
                          type="button"
                          onClick={() => setAnswer(d.id, 'maybe')}
                          className={`flex items-center justify-center rounded-xl py-3 ring-1 transition active:scale-95 ${
                            selected === 'maybe'
                              ? 'bg-amber-500/20 ring-amber-400/60'
                              : 'bg-white/5 ring-white/10 hover:ring-amber-400/30'
                          }`}
                        >
                          <span className={`text-[20px] font-black leading-none ${selected === 'maybe' ? 'text-amber-400' : 'text-white/20'}`}>△</span>
                        </button>
                        {/* × */}
                        <button
                          type="button"
                          onClick={() => setAnswer(d.id, 'no')}
                          className={`flex items-center justify-center rounded-xl py-3 ring-1 transition active:scale-95 ${
                            selected === 'no'
                              ? 'bg-white/12 ring-white/25'
                              : 'bg-white/5 ring-white/10 hover:ring-white/20'
                          }`}
                        >
                          <span className={`text-[20px] font-black leading-none ${selected === 'no' ? 'text-white/60' : 'text-white/20'}`}>×</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ジャンル（任意） */}
          <div className="rounded-3xl bg-white/5 px-4 py-5 ring-1 ring-white/8">
            <p className="text-sm font-bold text-white/80">何系のお店がいい？<span className="ml-1.5 text-xs font-normal text-white/35">任意</span></p>
            <p className="mt-0.5 text-xs leading-5 text-white/35">幹事が候補を選ぶときの参考にします</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PARTICIPANT_GENRE_OPTIONS.map((option) => {
                const isSelected = prefGenre === option
                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => setPrefGenre(isSelected ? null : option)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/40'
                        : 'bg-white/5 text-white/45 ring-white/10 hover:ring-white/20'
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
            <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/20">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* ── スティッキー送信ボタン ────────────────────────────────────────── */}
      {!isDateConfirmed && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-4"
          style={{ background: 'linear-gradient(to top, #111111 60%, transparent)' }}
        >
          <div className="mx-auto max-w-2xl space-y-2">
            <p className="text-center text-[11px] leading-5 text-white/30">
              予定が変わっても同じ端末・ブラウザで修正できます
            </p>
            <button
              type="button"
              onClick={submitResponse}
              disabled={submitting}
              className="w-full rounded-2xl py-4 text-base font-black text-white transition active:scale-[0.98] disabled:opacity-40"
              style={{
                background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)',
                boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
              }}
            >
              {submitting ? '送信中…' : hasSavedResponse ? '回答を更新' : '回答を送信'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
