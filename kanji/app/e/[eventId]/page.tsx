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
  const [showPrefs, setShowPrefs] = useState(false)
  const [prefGenres, setPrefGenres] = useState<string[]>([])
  const [prefAtmosphere, setPrefAtmosphere] = useState<string>('')
  const [prefPrivateRoom, setPrefPrivateRoom] = useState<string>('')
  const [prefAllYouCanDrink, setPrefAllYouCanDrink] = useState<string>('')
  const [prefDrinks, setPrefDrinks] = useState<string[]>([])

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

  // 👇 ここが重要（json形式に変換）
  const dateAnswers: Record<string, string> = {}

  dates.forEach((d, index) => {
    const key = `date${index + 1}` // ← 今のDBに合わせる
    dateAnswers[key] = answers[d.id] || 'maybe'
  })

  const { error } = await supabase
    .from('responses')
    .insert({
      event_id: eventId,
      participant_name: participantName.trim(),
      date_answers: dateAnswers,
      genres: [
        ...prefGenres,
        ...(prefAtmosphere ? [`atm:${prefAtmosphere}`] : []),
        ...(prefPrivateRoom === '希望する' ? ['pref:個室'] : []),
        ...(prefAllYouCanDrink === '希望する' ? ['pref:飲み放題'] : []),
        ...prefDrinks.map(d => `drink:${d}`),
      ],
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

        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-black/5">
          <p className="text-sm font-bold text-stone-900">お名前</p>
          <input
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="例：田中"
            className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400"
          />
        </div>

        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-black/5">
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
                        className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
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
                        className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
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
                        className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
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

        {showPrefs && (
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-black/5">
            <p className="mb-4 text-sm font-bold text-stone-900">こだわり</p>
            <div className="space-y-5">

              <div>
                <p className="mb-2 text-xs font-bold text-stone-600">ジャンル</p>
                <div className="flex flex-wrap gap-2">
                  {['居酒屋', '焼肉', 'イタリアン', '和食', 'カフェ・バル'].map(v => (
                    <button type="button" key={v}
                      onClick={() => setPrefGenres(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
                        prefGenres.includes(v) ? 'bg-stone-900 text-white ring-stone-900' : 'bg-stone-50 text-stone-500 ring-stone-200 hover:bg-stone-100'
                      }`}
                    >{v}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold text-stone-600">雰囲気</p>
                <div className="flex flex-wrap gap-2">
                  {['にぎやか', '落ち着き', 'おしゃれ', 'アットホーム'].map(v => (
                    <button type="button" key={v}
                      onClick={() => setPrefAtmosphere(prev => prev === v ? '' : v)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
                        prefAtmosphere === v ? 'bg-stone-900 text-white ring-stone-900' : 'bg-stone-50 text-stone-500 ring-stone-200 hover:bg-stone-100'
                      }`}
                    >{v}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-600">個室</p>
                  <div className="flex gap-2">
                    {['希望する', 'どちらでも'].map(v => (
                      <button type="button" key={v}
                        onClick={() => setPrefPrivateRoom(prev => prev === v ? '' : v)}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold ring-1 transition active:scale-95 ${
                          prefPrivateRoom === v ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-500 ring-stone-200 hover:bg-stone-50'
                        }`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-600">飲み放題</p>
                  <div className="flex gap-2">
                    {['希望する', 'どちらでも'].map(v => (
                      <button type="button" key={v}
                        onClick={() => setPrefAllYouCanDrink(prev => prev === v ? '' : v)}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold ring-1 transition active:scale-95 ${
                          prefAllYouCanDrink === v ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-500 ring-stone-200 hover:bg-stone-50'
                        }`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold text-stone-600">ドリンクの好み</p>
                <div className="flex flex-wrap gap-2">
                  {['ワイン', '日本酒', '焼酎'].map(v => (
                    <button type="button" key={v}
                      onClick={() => setPrefDrinks(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
                        prefDrinks.includes(v) ? 'bg-stone-900 text-white ring-stone-900' : 'bg-stone-50 text-stone-500 ring-stone-200 hover:bg-stone-100'
                      }`}
                    >{v}</button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

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

        {!showPrefs && (
          <button
            type="button"
            onClick={() => setShowPrefs(true)}
            className="w-full text-center text-xs text-stone-400 underline underline-offset-2"
          >
            こだわりを追加する（任意）
          </button>
        )}
      </div>
    </div>
  )
}