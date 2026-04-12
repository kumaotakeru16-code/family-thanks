'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { CalendarDays } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type EventRow = {
  id: string
  name: string | null
  event_type: string | null
}

type EventDateRow = {
  id: string
  event_id: string
  label: string | null
  sort_order: number | null
}

type AvailabilityValue = 'yes' | 'maybe' | 'no'
type ParticipantGenre = '和食' | '洋食' | '中華'

const PARTICIPANT_GENRE_OPTIONS: ParticipantGenre[] = [
  '和食',
  '洋食',
  '中華',
]

// ── 回答保持 ──────────────────────────────────────────────────────────────────
//
// 同じ端末・同じブラウザで同じイベント URL を開いたとき、前回の回答を復元する。
//
// 保存キー:
//   通常:   kanji_participant_response_{eventId}
//   デバッグ: ?debug_multi=1 付きで開いた場合は保存を無効化する
//            → 同じ端末で複数参加者のテストができる
//
// 保存内容:
//   participantName, answers, prefGenre, responseId（DB 行 ID、UPDATE 用）

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
    // 最低限の型ガード
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
    // QuotaExceededError など — 無視してよい（保存できなくても送信は成功している）
  }
}

export default function EventParticipantPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const eventId = params?.eventId as string

  // ?debug_multi=1 があるときは localStorage 保存・復元を完全に無効化する
  // 開発・検証時に同じ端末で複数参加者を試すための逃げ道
  const isDebugMulti = searchParams?.get('debug_multi') === '1'

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('')
  const [dates, setDates] = useState<EventDateRow[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  const [participantName, setParticipantName] = useState('')
  const [answers, setAnswers] = useState<Record<string, AvailabilityValue | undefined>>({})
  const [prefGenre, setPrefGenre] = useState<ParticipantGenre | null>(null)

  // 保存済み回答があるか（ボタン文言・復元バナーの表示判定に使う）
  const [hasSavedResponse, setHasSavedResponse] = useState(false)
  // DB 更新用: 初回送信で取得した responses 行の id
  const [savedResponseId, setSavedResponseId] = useState<string | undefined>(undefined)

  // ── イベントデータ取得 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return

    const fetchPageData = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, name, event_type')
        .eq('id', eventId)

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

      const event = eventData[0] as EventRow
      setEventName(event.name ?? '')
      setEventType(event.event_type ?? '')

      const { data: dateData, error: dateError } = await supabase
        .from('event_dates')
        .select('id, event_id, label, sort_order')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true })

      if (dateError) {
        setErrorMessage(`候補日取得エラー: ${dateError.message}`)
        setLoading(false)
        return
      }

      setDates((dateData ?? []) as EventDateRow[])
      setLoading(false)
    }

    fetchPageData()
  }, [eventId])

  // ── 保存済み回答の復元 ──────────────────────────────────────────────────────
  // イベントデータのロード完了後（dates が確定してから）復元する。
  // dates が空のうちに answers を入れても、allAnswered の判定が狂わないよう
  // loading: false になってから実行する。
  useEffect(() => {
    if (loading) return
    if (!eventId) return
    if (isDebugMulti) return // デバッグモードでは復元しない

    const saved = loadSavedResponse(eventId)
    if (!saved) return

    setParticipantName(saved.participantName)
    setAnswers(saved.answers as Record<string, AvailabilityValue | undefined>)
    if (saved.prefGenre) setPrefGenre(saved.prefGenre)
    if (saved.responseId) setSavedResponseId(saved.responseId)
    setHasSavedResponse(true)
  }, [loading, eventId, isDebugMulti])

  // ── 回答チェック ────────────────────────────────────────────────────────────
  const allAnswered = useMemo(() => {
    if (dates.length === 0) return false
    return dates.every((d) => !!answers[d.id])
  }, [dates, answers])

  const setAnswer = (eventDateId: string, value: AvailabilityValue) => {
    setAnswers((prev) => ({
      ...prev,
      [eventDateId]: value,
    }))
  }

  // ── 送信処理 ────────────────────────────────────────────────────────────────
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
      const key = `date${index + 1}`
      dateAnswers[key] = answers[d.id] || 'maybe'
    })
    const genres = prefGenre ? [prefGenre] : []

    // 再送信（savedResponseId あり）は UPDATE、初回は INSERT
    if (savedResponseId) {
      const { error } = await supabase
        .from('responses')
        .update({
          participant_name: participantName.trim(),
          date_answers: dateAnswers,
          genres,
        })
        .eq('id', savedResponseId)

      if (error) {
        setErrorMessage(`回答の更新エラー: ${error.message}`)
        setSubmitting(false)
        return
      }

      // ローカル保存を更新
      if (!isDebugMulti) {
        saveResponseLocally(eventId, {
          participantName: participantName.trim(),
          answers: answers as Record<string, AvailabilityValue>,
          prefGenre,
          responseId: savedResponseId,
        })
      }
    } else {
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

      // 初回送信: 取得した行 ID とともにローカルへ保存
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

  // ── レンダリング ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
        読み込み中...
      </div>
    )
  }

  if (errorMessage && submitted) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
        {errorMessage}
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-12 sm:px-6">
        <div className="space-y-4">
          {/* 完了メッセージ（主役） */}
          <div className="rounded-3xl bg-white px-6 py-8 shadow-sm ring-1 ring-black/5">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
              Thanks
            </p>
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

          {/* 認知導線（補助） */}
          <div className="rounded-2xl border border-stone-100 bg-stone-50 px-5 py-5">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">
              この会の幹事が使っているアプリ
            </p>
            {/* アイコン + アプリ名 */}
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
      <div className="space-y-6">
        <div className="px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
            Event
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-stone-900">
            {eventName}
          </h1>
          <p className="mt-1 text-sm text-stone-400">{eventType}</p>
        </div>

        {/* 前回回答済みバナー */}
        {hasSavedResponse && (
          <div className="rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
            <p className="text-xs leading-5 text-stone-500">
              前回の回答を読み込みました。内容を変更して再送信できます。
            </p>
          </div>
        )}

        <div className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/5">
          <p className="text-sm font-bold text-stone-900">お名前</p>
          <input
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="例：田中"
            className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none placeholder:text-stone-400"
          />
        </div>

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
                      {/* ○ 参加できる */}
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

                      {/* △ 調整できるかも */}
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

                      {/* × 参加できない */}
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

        {errorMessage ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
            {errorMessage}
          </div>
        ) : null}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-6 pt-4">
        <div className="mx-auto max-w-2xl space-y-2">
          {/* 補足文: 送信前の不安を消す */}
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
    </div>
  )
}
