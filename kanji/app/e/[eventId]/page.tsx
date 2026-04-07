'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

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
type ParticipantGenre = '和風・居酒屋' | '洋食' | '中華'

const PARTICIPANT_GENRE_OPTIONS: ParticipantGenre[] = [
  '和風・居酒屋',
  '洋食',
  '中華',
]

export default function EventParticipantPage() {
  const params = useParams()
  const eventId = params?.eventId as string

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

    const { error } = await supabase
      .from('responses')
      .insert({
        event_id: eventId,
        participant_name: participantName.trim(),
        date_answers: dateAnswers,
        genres,
        areas: [],
      })

    if (error) {
      setErrorMessage(`回答送信エラー: ${error.message}`)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSubmitted(true)
  }

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
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
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

        <div className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/5">
          <p className="text-sm font-bold text-stone-900">お名前</p>
          <input
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="例：田中"
            className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400"
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
                      <button
                        type="button"
                        onClick={() => setAnswer(d.id, 'yes')}
                        className={`rounded-xl px-3 py-1.5 text-sm font-bold ring-1 ${
                          selected === 'yes'
                            ? 'bg-emerald-500 text-white ring-emerald-500'
                            : 'bg-white text-stone-700 ring-stone-200'
                        }`}
                      >
                        ○
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnswer(d.id, 'maybe')}
                        className={`rounded-xl px-3 py-1.5 text-sm font-bold ring-1 ${
                          selected === 'maybe'
                            ? 'bg-amber-400 text-white ring-amber-400'
                            : 'bg-white text-stone-700 ring-stone-200'
                        }`}
                      >
                        △
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnswer(d.id, 'no')}
                        className={`rounded-xl px-3 py-1.5 text-sm font-bold ring-1 ${
                          selected === 'no'
                            ? 'bg-stone-700 text-white ring-stone-700'
                            : 'bg-white text-stone-700 ring-stone-200'
                        }`}
                      >
                        ×
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

        <button
          type="button"
          onClick={submitResponse}
          disabled={submitting}
          className="w-full rounded-2xl bg-stone-900 px-4 py-4 text-base font-black text-white transition hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? '送信中…' : '回答を送信'}
        </button>
      </div>
    </div>
  )
}