'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronUp } from 'lucide-react'

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
  store_name: string | null
  store_url: string | null
  store_area: string | null
  store_memo: string | null
  store_image: string | null
  store_access: string | null
  store_chips: string[] | null
  date_reason: string | null
  store_reason: string | null
}

type PaymentInfo = {
  paypayId?: string
  bankName?: string
  branchName?: string
  accountType?: string
  accountNumber?: string
  accountName?: string
}

type PastEventRow = {
  title: string
  event_date: string
  store_name: string
  store_link: string | null
  participants: string[]
  memo: string
  has_photo: boolean
  photo_url: string | null
  settlement_results: { name: string; total: number }[] | null
  payment_info: PaymentInfo | null
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
  const [dates, setDates] = useState<EventDateRow[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [decision, setDecision] = useState<DecisionRow | null>(null)
  const [pastEvent, setPastEvent] = useState<PastEventRow | null>(null)
  const [pastEventPhotoUrl, setPastEventPhotoUrl] = useState<string | null>(null)

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
        { data: decisionBasic },
      ] = await Promise.all([
        supabase.from('events').select('id, name').eq('id', eventId),
        supabase.from('event_dates').select('id, event_id, label, sort_order').eq('event_id', eventId).order('sort_order', { ascending: true }),
        supabase.from('responses').select('id, participant_name, date_answers').eq('event_id', eventId),
        supabase.from('decisions').select('selected_date_id').eq('event_id', eventId).maybeSingle(),
      ])
      if (eventError) { setErrorMessage(`イベント取得エラー: ${eventError.message}`); setLoading(false); return }
      if (!eventData || eventData.length === 0) { setErrorMessage('イベントが見つかりませんでした'); setLoading(false); return }
      if (dateError) { setErrorMessage(`候補日取得エラー: ${dateError.message}`); setLoading(false); return }
      const event = eventData[0] as { name: string | null }
      setEventName(event.name ?? '')
      setDates((dateData ?? []) as EventDateRow[])
      setResponses((responseData ?? []) as ResponseRow[])

      // store 系カラムは DB マイグレーション後に存在する。なければ null で補完。
      let decisionData: DecisionRow | null = decisionBasic
        ? { selected_date_id: decisionBasic.selected_date_id, store_name: null, store_url: null, store_area: null, store_memo: null, store_image: null, store_access: null, store_chips: null, date_reason: null, store_reason: null }
        : null
      if (decisionBasic) {
        const { data: storeData } = await supabase
          .from('decisions')
          .select('store_name, store_url, store_area, store_memo, store_image, store_access, store_chips, date_reason, store_reason')
          .eq('event_id', eventId)
          .maybeSingle()
        if (storeData) {
          decisionData = { ...decisionData!, ...storeData }
        }
      }
      setDecision(decisionData)

      // 清算完了データ（past_events）取得
      const { data: pastData } = await supabase
        .from('past_events')
        .select('title, event_date, store_name, store_link, participants, memo, has_photo, photo_url, settlement_results, payment_info')
        .eq('event_id', eventId)
        .maybeSingle()
      if (pastData) setPastEvent(pastData as PastEventRow)

      setLoading(false)
    }
    fetchPageData()
  }, [eventId])

  // 写真の signed URL を生成
  useEffect(() => {
    if (!pastEvent?.has_photo || !pastEvent.photo_url) return
    supabase.storage
      .from('past-event-photos')
      .createSignedUrl(pastEvent.photo_url, 60 * 60 * 24 * 7)
      .then(({ data }) => { if (data?.signedUrl) setPastEventPhotoUrl(data.signedUrl) })
  }, [pastEvent])

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

  // "4/29（水）19:00" → { dayPart: "4/29", weekday: "水", time: "19:00" }
  function parseDateLabelParts(label: string): { dayPart: string; weekday: string; time: string } {
    const m = label.match(/^(\d+\/\d+)（(.)）(.+)$/)
    if (!m) return { dayPart: label, weekday: '', time: '' }
    return { dayPart: m[1], weekday: m[2], time: m[3].trim() }
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

  const isSettled       = useMemo(() => !!pastEvent, [pastEvent])
  const isDateConfirmed = useMemo(() => !!decision?.selected_date_id, [decision])
  const isStoreDecided  = useMemo(() => !!decision?.store_name, [decision])

  const confirmedDateStats = useMemo(() => {
    if (!decision?.selected_date_id) return null
    return dateStats.find((s) => s.dateId === decision.selected_date_id) ?? null
  }, [decision, dateStats])

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
            className="overflow-hidden rounded-3xl"
            style={{ background: 'var(--brand)' }}
          >
            <div className="px-6 py-8">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-black/50">Thanks</p>
              <h1 className="mt-2 text-[26px] font-black tracking-tight text-black">
                回答ありがとうございます
              </h1>
              <p className="mt-3 text-sm leading-6 text-black/55">
                幹事がみんなの回答を見て、日程を調整します。
              </p>
              <p className="mt-3 text-xs leading-5 text-black/40">
                予定が変わっても大丈夫です。同じ端末・同じブラウザでこのページを開けば、回答をあとから修正できます。
              </p>
            </div>
          </div>

          {/* アプリ紹介 */}
          <div className="rounded-2xl bg-white/5 px-5 py-5 ring-1 ring-white/8">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
              この会の幹事が使っているアプリ
            </p>
            <div className="flex items-center gap-3">
              <img
                src="/brand/kanji-app-icon.png"
                alt="KANJI"
                width={40}
                height={40}
                style={{ objectFit: 'contain', borderRadius: 10 }}
                draggable={false}
              />
              <span className="text-base font-black tracking-wide text-white">KANJI</span>
            </div>
            <p className="mt-2.5 text-xs leading-5 text-white/40">
              幹事のやることを、まとめて進められます
            </p>
            <a
              href="/"
              className="mt-3.5 inline-block text-xs font-bold text-brand/80 underline underline-offset-2 transition hover:text-brand"
            >
              このアプリで会を作る →
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── 共通パーツ ────────────────────────────────────────────────────────────

  /** 参加者一覧アコーディオン（確定後共用） */
  const ParticipantAccordion = () => {
    if (!confirmedDateStats) return null
    const { yes, maybe, no } = confirmedDateStats
    if (yes.length === 0 && maybe.length === 0 && no.length === 0) return null
    return (
      <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/8">
        <button
          type="button"
          onClick={() => setShowResponseTable((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3.5"
        >
          <span className="text-sm font-bold text-white/70">
            参加者
            <span className="ml-2 font-normal text-white/35">{responses.length}人</span>
          </span>
          {showResponseTable
            ? <ChevronUp size={15} className="shrink-0 text-white/35" />
            : <ChevronDown size={15} className="shrink-0 text-white/35" />
          }
        </button>
        {showResponseTable && (
          <div className="border-t border-white/8 px-5 pb-4 pt-3 space-y-2">
            {yes.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-10 shrink-0 text-[11px] font-bold text-white/55">参加</span>
                <p className="text-[13px] font-bold text-white/75 leading-snug">{yes.join('・')}</p>
              </div>
            )}
            {maybe.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-10 shrink-0 text-[11px] font-bold text-white/35">調整中</span>
                <p className="text-[13px] font-bold text-white/40 leading-snug">{maybe.join('・')}</p>
              </div>
            )}
            {no.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-10 shrink-0 text-[11px] font-bold text-white/20">不可</span>
                <p className="text-[13px] font-bold text-white/20 leading-snug">{no.join('・')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  /** アプリ紹介 */
  const AppPromo = () => (
    <div className="rounded-2xl bg-white/5 px-5 py-5 ring-1 ring-white/8">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
        この会の幹事が使っているアプリ
      </p>
      <div className="flex items-center gap-3">
        <img
          src="/brand/kanji-app-icon.png"
          alt="KANJI"
          width={40}
          height={40}
          style={{ objectFit: 'contain', borderRadius: 10 }}
          draggable={false}
        />
        <span className="text-base font-black tracking-wide text-white">KANJI</span>
      </div>
      <p className="mt-2.5 text-xs leading-5 text-white/40">幹事のやることを、まとめて進められます</p>
      <a
        href="/"
        className="mt-3.5 inline-block text-xs font-bold text-brand/80 underline underline-offset-2 transition hover:text-brand"
      >
        このアプリで会を作る →
      </a>
    </div>
  )

  return (
    <div className={`mx-auto min-h-screen w-full max-w-2xl px-4 pt-8 sm:px-6 ${isDateConfirmed ? 'pb-16' : 'pb-32'}`}>

      {/* ── イベントヘッダー ─────────────────────────────────────────────── */}
      <div className="mb-6 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Event</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">{eventName}</h1>
      </div>

      {/* ══════════════════════════════════════════════
          STATE D: 清算完了後
          主役 → 会の名前、次 → 支払い金額・送金先、サブ → 写真・メモ
         ══════════════════════════════════════════════ */}
      {isSettled && pastEvent && (
        <div className="space-y-4 pb-4">

          {/* 主役: 写真（あれば最上部） */}
          {pastEvent.has_photo && pastEventPhotoUrl && (
            <div className="overflow-hidden rounded-3xl">
              <img
                src={pastEventPhotoUrl}
                alt="会の写真"
                className="w-full object-cover"
                style={{ maxHeight: 340 }}
              />
            </div>
          )}

          {/* 主役カード: 会の名前 */}
          <div className="overflow-hidden rounded-3xl" style={{ background: 'var(--brand)' }}>
            <div className="px-6 pt-5 pb-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-[11px] font-black text-brand">
                ✓ 会が終わりました
              </span>
              <h2 className="mt-4 text-[32px] font-black leading-tight tracking-tight text-black">
                {pastEvent.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {pastEvent.event_date && (
                  <p className="text-sm font-bold text-black/55">{pastEvent.event_date}</p>
                )}
                {pastEvent.store_name && (
                  <p className="text-sm font-bold text-black/40">{pastEvent.store_name}</p>
                )}
              </div>
            </div>
          </div>

          {/* 支払い金額 */}
          {pastEvent.settlement_results && pastEvent.settlement_results.length > 0 && (
            <>
              <div className="overflow-hidden rounded-2xl bg-white/6 ring-1 ring-white/8">
                <div className="px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">支払い金額</p>
                  <div className="mt-3 space-y-3">
                    {pastEvent.settlement_results.map((r) => (
                      <div key={r.name} className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white/65">{r.name}</span>
                        <span className="text-[20px] font-black tabular-nums text-white">
                          ¥{r.total.toLocaleString('ja-JP')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="px-1 text-[11px] leading-5 text-white/30">
                ※金額は調整のうえ、100円単位で切り上げて計算しています
              </p>
            </>
          )}

          {/* 送金先 */}
          {pastEvent.payment_info && (pastEvent.payment_info.paypayId || pastEvent.payment_info.bankName) && (
            <div className="overflow-hidden rounded-2xl bg-white/6 ring-1 ring-white/8">
              <div className="px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">送金先</p>
                <div className="mt-3 space-y-2">
                  {pastEvent.payment_info.paypayId && (
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-white/45">PayPay</span>
                      <span className="text-[14px] font-black text-white/80">{pastEvent.payment_info.paypayId}</span>
                    </div>
                  )}
                  {pastEvent.payment_info.bankName && pastEvent.payment_info.accountNumber && (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-white/45">銀行</span>
                        <span className="text-[14px] font-black text-white/80">
                          {[pastEvent.payment_info.bankName, pastEvent.payment_info.branchName].filter(Boolean).join(' ')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-white/45">口座番号</span>
                        <span className="text-[14px] font-black tabular-nums text-white/80">
                          {[pastEvent.payment_info.accountType, pastEvent.payment_info.accountNumber].filter(Boolean).join(' ')}
                        </span>
                      </div>
                      {pastEvent.payment_info.accountName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-white/45">名義</span>
                          <span className="text-[14px] font-black text-white/80">{pastEvent.payment_info.accountName}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* メモ（幹事から参加者へのメッセージ） */}
          {pastEvent.memo && (
            <div className="overflow-hidden rounded-2xl bg-white/6 px-5 py-4 ring-1 ring-white/8">
              <p className="text-sm leading-6 text-white/60 whitespace-pre-line">{pastEvent.memo}</p>
            </div>
          )}

          <AppPromo />
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STATE A: お店決定後
          主役 → お店、サブ → 日程、参加者
         ══════════════════════════════════════════════ */}
      {!isSettled && isStoreDecided && (
        <div className="space-y-4 pb-4">

          {/* 主役: お店カード（BEST CHOICE スタイル） */}
          <div className="overflow-hidden rounded-3xl bg-stone-900 shadow-xl shadow-stone-900/30">
            {/* 画像左 / 情報右 */}
            <div className="flex gap-3 p-4">
              {decision!.store_image ? (
                <div className="w-[47%] shrink-0">
                  <img
                    src={decision!.store_image}
                    alt={decision!.store_name ?? ''}
                    className="aspect-square w-full rounded-2xl object-cover object-center"
                    style={{ filter: 'brightness(0.92)' }}
                  />
                </div>
              ) : (
                <div className="flex w-[47%] shrink-0 aspect-square items-center justify-center rounded-2xl bg-white/10">
                  <span className="text-2xl">🍽️</span>
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2.5">
                {/* バッジ */}
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-brand ring-1 ring-brand/30">
                  ✓ お店が決まりました
                </span>
                {/* 店名 */}
                <h2 className="text-[17px] font-black tracking-tight text-white leading-snug">
                  {decision!.store_name}
                </h2>
                {/* 理由（店名直後） */}
                {decision!.store_reason && (
                  <div className="rounded-xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/28">
                      この店にした理由
                    </p>
                    <p className="line-clamp-1 text-[13px] font-black leading-snug text-white">
                      {decision!.store_reason}
                    </p>
                  </div>
                )}
                {/* アクセス */}
                {decision!.store_access && (
                  <div className="flex items-start gap-1">
                    <span className="mt-[3px] shrink-0 text-white/35 text-[10px]">🚃</span>
                    <p className="line-clamp-1 text-[11px] leading-5 text-white/45">{decision!.store_access}</p>
                  </div>
                )}
                {/* チップ */}
                {decision!.store_chips && decision!.store_chips.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {decision!.store_chips.map(chip => (
                      <span key={chip} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                {/* 条件チェック（store_reason を ・ で分割） */}
                {decision!.store_reason && (
                  <div className="space-y-1">
                    {decision!.store_reason.split('・').map((r, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="mt-[3px] shrink-0 text-brand text-[10px]">✓</span>
                        <span className="line-clamp-1 text-[11px] leading-[1.4] text-white/55">{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* エリア */}
                {decision!.store_area && (
                  <p className="text-[11px] text-white/40">{decision!.store_area}</p>
                )}
                {/* メモ */}
                {decision!.store_memo && (
                  <p className="text-[11px] leading-5 text-white/35">{decision!.store_memo}</p>
                )}
              </div>
            </div>
            {/* 予約リンク */}
            {decision!.store_url && (
              <div className="px-4 pb-4">
                <a
                  href={decision!.store_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.07] px-4 py-3.5 text-sm font-black text-white ring-1 ring-brand/50 transition active:scale-[0.98]"
                >
                  詳細を確認する →
                </a>
              </div>
            )}
          </div>

          {/* サブ: 日程 */}
          {confirmedDateLabel && (
            <div className="overflow-hidden rounded-2xl bg-white/6 ring-1 ring-white/8">
              <div className="px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">日程</p>
                <p className="mt-2 text-xl font-black text-white/80">{confirmedDateLabel}</p>
              </div>
            </div>
          )}

          {/* サブ: 参加者 */}
          <ParticipantAccordion />

          {/* アプリ紹介 */}
          <AppPromo />
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STATE B: 日程確定後（お店未決定）
          主役 → 日程、サブ → 参加者
         ══════════════════════════════════════════════ */}
      {!isSettled && isDateConfirmed && !isStoreDecided && (
        <div className="space-y-4 pb-4">

          {/* 主役: 日程カード */}
          <div className="overflow-hidden rounded-3xl" style={{ background: 'var(--brand)' }}>
            <div className="px-6 pt-5 pb-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-[11px] font-black text-brand">
                ✓ 確定
              </span>
              {confirmedDateLabel && (() => {
                const { dayPart, weekday, time } = parseDateLabelParts(confirmedDateLabel)
                return (
                  <div className="mt-4">
                    <div className="flex items-end gap-1">
                      <span className="text-[72px] font-black leading-none tracking-tight text-black">{dayPart}</span>
                      {weekday && <span className="mb-2.5 text-xl font-bold text-black/60">（{weekday}）</span>}
                    </div>
                    {time && <p className="mt-2 text-[22px] font-bold text-black/80">{time}〜</p>}
                  </div>
                )
              })()}
              {decision?.date_reason ? (
                <p className="mt-4 text-sm font-bold text-black/60">{decision.date_reason}</p>
              ) : (
                <p className="mt-4 text-sm leading-6 text-black/55">
                  回答受付は終了しました。詳細は幹事からの案内をお待ちください。
                </p>
              )}
            </div>
          </div>

          {/* サブ: 参加者 */}
          <ParticipantAccordion />

          {/* アプリ紹介 */}
          <AppPromo />
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STATE C: 日程調整中（フォーム）
          主役 → 回答フォーム
         ══════════════════════════════════════════════ */}
      {!isSettled && !isDateConfirmed && (
        <div className="space-y-4">

          {/* 現時点の第一候補（3人以上回答時） */}
          {showSummary && (
            <div className="overflow-hidden rounded-3xl" style={{ background: 'var(--brand)' }}>
              <div className="px-6 pt-5 pb-7">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-[11px] font-black text-brand">
                  ✓ 第一候補
                </span>
                {topDateLabels.length === 1 ? (() => {
                  const { dayPart, weekday, time } = parseDateLabelParts(topDateLabels[0])
                  return (
                    <div className="mt-4">
                      <div className="flex items-end gap-1">
                        <span className="text-[72px] font-black leading-none tracking-tight text-black">{dayPart}</span>
                        {weekday && <span className="mb-2.5 text-xl font-bold text-black/60">（{weekday}）</span>}
                      </div>
                      {time && <p className="mt-2 text-[22px] font-bold text-black/80">{time}〜</p>}
                    </div>
                  )
                })() : (
                  <div className="mt-4 space-y-1">
                    {topDateLabels.map((label) => (
                      <p key={label} className="text-[22px] font-black leading-snug tracking-tight text-black">
                        {label}
                      </p>
                    ))}
                    <p className="mt-2 text-sm text-black/55">
                      上記の日程に同程度で回答が集まっています
                    </p>
                  </div>
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
                          <th className="sticky left-0 z-10 bg-transparent px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-white/35">名前</th>
                          {dates.map((d) => {
                            const isTop = showSummary && topDateLabels.includes(d.label ?? '')
                            return (
                              <th key={d.id} className="min-w-[64px] px-2 py-2 text-center text-[10px] font-black tracking-wider text-white/35">
                                <div className="flex flex-col items-center gap-1">
                                  <span>{formatDateLabelShort(d.label)}</span>
                                  {isTop && (
                                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[9px] font-bold text-brand">最多</span>
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
                              <td key={`${row.participantName}-${dates[index]?.id ?? index}`} className="px-2 py-2.5 text-center text-base font-black">
                                <span className={value === 'yes' ? 'text-brand' : value === 'maybe' ? 'text-brand/50' : 'text-white/20'}>
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
                        <button type="button" onClick={() => setAnswer(d.id, 'yes')}
                          className={`flex items-center justify-center rounded-xl py-3 ring-1 transition active:scale-95 ${selected === 'yes' ? 'bg-brand/20 ring-brand/50' : 'bg-white/5 ring-white/10 hover:ring-brand/25'}`}>
                          <span className={`text-[20px] font-black leading-none ${selected === 'yes' ? 'text-brand' : 'text-white/20'}`}>○</span>
                        </button>
                        <button type="button" onClick={() => setAnswer(d.id, 'maybe')}
                          className={`flex items-center justify-center rounded-xl py-3 ring-1 transition active:scale-95 ${selected === 'maybe' ? 'bg-brand/10 ring-brand/30' : 'bg-white/5 ring-white/10 hover:ring-brand/15'}`}>
                          <span className={`text-[20px] font-black leading-none ${selected === 'maybe' ? 'text-brand/60' : 'text-white/20'}`}>△</span>
                        </button>
                        <button type="button" onClick={() => setAnswer(d.id, 'no')}
                          className={`flex items-center justify-center rounded-xl py-3 ring-1 transition active:scale-95 ${selected === 'no' ? 'bg-white/12 ring-white/25' : 'bg-white/5 ring-white/10 hover:ring-white/20'}`}>
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
                  <button type="button" key={option} onClick={() => setPrefGenre(isSelected ? null : option)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${isSelected ? 'bg-brand/15 text-brand ring-brand/35' : 'bg-white/5 text-white/45 ring-white/10 hover:ring-white/20'}`}>
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

      {/* ── スティッキー送信ボタン（調整中のみ） ────────────────────────── */}
      {!isSettled && !isDateConfirmed && (
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
              className="w-full rounded-2xl py-4 text-base font-black text-black transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: 'var(--brand)' }}
            >
              {submitting ? '送信中…' : hasSavedResponse ? '回答を更新' : '回答を送信'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
