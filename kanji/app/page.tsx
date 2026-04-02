'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { createEvent, loadEventData } from '@/lib/kanji-db'
import { saveDecision } from '@/lib/kanji-db'
import { loadDecision } from '@/lib/kanji-db'

// --- Types ---
type Step =
  | 'home'
  | 'create'
  | 'dates'
  | 'shareLink'
  | 'dashboard'
  | 'dateSuggestion'
  | 'dateConfirmed'
  | 'organizerConditions'
  | 'storeSuggestion'
  | 'finalConfirm'
  | 'shared'
  | 'pastStores'
  | 'storeDetail'

type EventType = '歓迎会' | '送別会' | '普通の飲み会' | '少人数ごはん' | '会食'
type Availability = 'yes' | 'maybe' | 'no'
type DateOption = { id: string; label: string }
type Participant = {
  id: string
  name: string
  availability: Record<string, Availability>
  area: string[]
  genres: string[]
}
type StoreCandidate = {
  id: string
  name: string
  link: string
  genre?: string
  image?: string
  area?: string
  access?: string
  reason?: string
  description?: string
  tags?: string[]
}
type PastStore = {
  id: string
  name: string
  area: string
  eventType: string
  members: string[]
  rating: '◎' | '○' | '△'
  memo: string
}

// --- Constants ---
const EVENT_TYPES: EventType[] = ['歓迎会', '送別会', '普通の飲み会', '少人数ごはん', '会食']
const AREA_OPTIONS = ['渋谷', '新宿', '恵比寿', '中間でOK']
const GENRE_OPTIONS = ['居酒屋', '焼肉', 'イタリアン', 'カフェ']
const ORGANIZER_CONDITION_OPTIONS = ['個室あり', '禁煙希望', '喫煙可がよい', '静かめ', '会食向き']

const INITIAL_DATES: DateOption[] = [
  { id: 'date1', label: '4/10（水）19:00' },
  { id: 'date2', label: '4/12（金）19:00' },
  { id: 'date3', label: '4/13（土）18:00' },
]

const MOCK_PARTICIPANTS: Participant[] = [
  {
    id: 'p1',
    name: '山田',
    availability: { date1: 'maybe', date2: 'yes', date3: 'yes' },
    area: ['渋谷'],
    genres: ['居酒屋', 'カフェ'],
  },
  {
    id: 'p2',
    name: '田中',
    availability: { date1: 'no', date2: 'yes', date3: 'maybe' },
    area: ['新宿', '中間でOK'],
    genres: ['イタリアン'],
  },
  {
    id: 'p3',
    name: '佐藤',
    availability: { date1: 'yes', date2: 'yes', date3: 'no' },
    area: ['渋谷', '中間でOK'],
    genres: ['焼肉', '居酒屋'],
  },
]

const MOCK_STORES: StoreCandidate[] = [
  {
    id: 's1',
    name: '渋谷 焼肉 まるまる',
    area: '渋谷',
    access: '渋谷駅 徒歩3分',
    reason: '焼肉・居酒屋希望が多く、渋谷に集まりやすく、個室条件を満たす店を優先しました。',
    link: 'https://example.com/store-1',
    tags: ['個室あり', '禁煙', '会食向き'],
  },
  {
    id: 's2',
    name: '恵比寿 イタリアン さんかく',
    area: '恵比寿',
    access: '恵比寿駅 徒歩4分',
    reason: '中間寄りで全員が集まりやすく、ジャンル希望にも沿いやすい候補です。',
    link: 'https://example.com/store-2',
    tags: ['個室あり', '静かめ'],
  },
  {
    id: 's3',
    name: '渋谷 居酒屋 しかく',
    area: '渋谷',
    access: '渋谷駅 徒歩2分',
    reason: '渋谷希望が多く、居酒屋ジャンルに合わせやすい駅近の候補です。',
    link: 'https://example.com/store-3',
    tags: ['駅近', '禁煙'],
  },
]

const MOCK_PAST_STORES: PastStore[] = [
  {
    id: 'ps1',
    name: '渋谷 焼肉 まるまる',
    area: '渋谷',
    eventType: '歓迎会',
    members: ['山田', '田中', '佐藤', '鈴木'],
    rating: '◎',
    memo: '個室でゆっくり話せた。コスパも良く全員に好評でした。',
  },
  {
    id: 'ps2',
    name: '新宿 居酒屋 しかく',
    area: '新宿',
    eventType: '送別会',
    members: ['山田', '高橋', '田中'],
    rating: '○',
    memo: '駅近で集まりやすかったが少し賑やかで話しにくかった。',
  },
  {
    id: 'ps3',
    name: '恵比寿 イタリアン さんかく',
    area: '恵比寿',
    eventType: '忘年会',
    members: ['田中', '佐藤', '鈴木', '高橋'],
    rating: '△',
    memo: '料理は良かったが少し高め。次は別の場所も試してみたい。',
  },
]

// --- Helpers ---
function scoreAvailability(v?: Availability): number {
  if (v === 'yes') return 2
  if (v === 'maybe') return 1
  return 0
}

function availabilityLabel(v?: Availability) {
  if (v === 'yes') return '○'
  if (v === 'maybe') return '△'
  if (v === 'no') return '×'
  return '-'
}

function availabilityStyle(v?: Availability) {
  if (v === 'yes') return 'text-emerald-600 font-bold'
  if (v === 'maybe') return 'text-amber-500'
  return 'text-stone-300'
}

function ratingStyle(r: '◎' | '○' | '△') {
  if (r === '◎') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (r === '○') return 'bg-stone-100 text-stone-500 ring-stone-200'
  return 'bg-amber-50 text-amber-600 ring-amber-200'
}

function generateShareText(eventType: string, store: StoreCandidate, conditions: string[]): string {
  const hasPrivateRoom = conditions.includes('個室あり')
  if (eventType === '会食') {
    return `今回の会場が決まりました。\n${store.name}\n${store.link}\n\nご都合の良い日にお越しください。よろしくお願いします。`
  }
  if (eventType === '少人数ごはん') {
    return `場所が決まりました！👇\n${store.name}\n${store.link}\n\n気軽に来てください〜`
  }
  const closer = hasPrivateRoom
    ? 'アクセスしやすく、個室もあるのでゆっくり話せます！'
    : '雰囲気も合いそうなお店にしました！'
  return `今回ここにしました👇\n${store.name}\n${store.link}\n\nみんなの希望を見て選びました。${closer}`
}

function uniqueCount(values: string[]) {
  return new Set(values).size
}

function getTopGenres(participants: Participant[]) {
  const counts = new Map<string, number>()

  participants.forEach((p) => {
    p.genres.forEach((genre) => {
      counts.set(genre, (counts.get(genre) ?? 0) + 1)
    })
  })

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre)
}

function getTopAreas(participants: Participant[]) {
  const counts = new Map<string, number>()

  participants.forEach((p) => {
    p.area.forEach((area) => {
      counts.set(area, (counts.get(area) ?? 0) + 1)
    })
  })

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area)
}

function buildDateReason(params: {
  mainGuestAvailability?: Availability
  availableCount: number
  totalCount: number
  eventType: EventType
}) {
  const { mainGuestAvailability, availableCount, totalCount, eventType } = params

  if (totalCount === 0 || availableCount === 0) {
    return 'まだ十分な回答が集まっていないため、日程理由は表示していません。'
  }

  if (availableCount === 1) {
    if (mainGuestAvailability === 'yes') {
      return '現時点では主賓が参加可能で、この候補が最も通しやすい日程です。'
    }
    return '現時点では1名が参加可能で、この候補が最も通しやすい日程です。'
  }

  // 主賓OKパターン
  if (mainGuestAvailability === 'yes') {
    if (eventType === '歓迎会' || eventType === '送別会') {
      return `主賓が無理なく参加でき、参加人数も ${availableCount}/${totalCount} 人と確保できるため、この日程が最も自然です。`
    }
    return `主賓が参加でき、参加人数も ${availableCount}/${totalCount} 人と多いため、この日程が最もバランスの良い選択です。`
  }

  // バランス型
  if (availableCount >= Math.ceil(totalCount * 0.6)) {
    return `主賓優先ではないものの、参加できる人が ${availableCount}/${totalCount} 人と多く、全体として最も無理の少ない日程です。`
  }

  // 消去法型
  return `全体の予定の重なりを考慮すると、この日程が最も現実的な選択です。`
}

function buildStoreReason(params: {
  store: StoreCandidate
  participants: Participant[]
  organizerConditions: string[]
}) {
  const { store, participants, organizerConditions } = params

  const genreCounts = new Map<string, number>()
  const areaCounts = new Map<string, number>()

  participants.forEach((p) => {
    ;(p.genres ?? []).forEach((genre) => {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
    })

    ;(p.area ?? []).forEach((area) => {
      if (area !== '中間でOK') {
        areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1)
      }
    })
  })

  const topGenreEntry =
    [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const topAreaEntry =
    [...areaCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  const topGenre = topGenreEntry?.[0] ?? null
  const topGenreCount = topGenreEntry?.[1] ?? 0
  const topArea = topAreaEntry?.[0] ?? null

  const genreText = [
    store.genre ?? '',
    store.name ?? '',
    store.reason ?? '',
    ...(store.tags ?? []),
  ].join(' ')

  const areaText = [
    store.area ?? '',
    store.access ?? '',
    store.reason ?? '',
  ].join(' ')

  const genreHit =
    !!topGenre &&
    topGenreCount >= 2 &&
    genreText.includes(topGenre)

  const areaHit =
    !!topArea &&
    areaText.includes(topArea)

  const privateRoomHit =
    organizerConditions.includes('個室あり') &&
    (store.tags ?? []).includes('個室あり')

  const quietHit =
    organizerConditions.includes('静かめ') &&
    (store.tags ?? []).includes('静かめ')

  const businessHit =
    organizerConditions.includes('会食向き') &&
    (store.tags ?? []).includes('会食向き')

  if (genreHit) {
    return `${topGenre}希望が多かったため優先`
  }

  if (areaHit) {
    return `${topArea}に集まりやすいため優先`
  }

  if (privateRoomHit) {
    return '個室条件を満たしやすいため優先'
  }

  if (quietHit) {
    return '落ち着いて話しやすいため優先'
  }

  if (businessHit) {
    return '会の目的に合いやすいため優先'
  }

  return '条件のバランスがよいため優先'
}

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

const FLOW_STEPS: Step[] = [
  'create',
  'dates',
  'shareLink',
  'dashboard',
  'dateSuggestion',
  'dateConfirmed',
  'organizerConditions',
  'storeSuggestion',
  'finalConfirm',
  'shared',
]

// --- Main Component ---
export default function Page() {
  const [step, setStep] = useState<Step>('home')
  const [eventType, setEventType] = useState<EventType>('歓迎会')
  const [eventName, setEventName] = useState('歓迎会')
  const [dateInput, setDateInput] = useState('')
  const [dates, setDates] = useState<DateOption[]>(INITIAL_DATES)
  const [participants] = useState<Participant[]>(MOCK_PARTICIPANTS)
  const [mainGuestId, setMainGuestId] = useState('p1')
  const [organizerConditions, setOrganizerConditions] = useState<string[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState('s1')
  const [selectedPastStoreId, setSelectedPastStoreId] = useState<string | null>(null)
  const [storeDetailOrigin, setStoreDetailOrigin] = useState<Step>('pastStores')

  const [createdEventId, setCreatedEventId] = useState<string>('')
  const [dbDates, setDbDates] = useState<any[]>([])
  const [dbResponses, setDbResponses] = useState<any[]>([])
  const [finalDecision, setFinalDecision] = useState<any | null>(null)
  const [finalEvent, setFinalEvent] = useState<any | null>(null)
  const [finalDates, setFinalDates] = useState<any[]>([])
  const [recommendedStores, setRecommendedStores] = useState<StoreCandidate[]>([])
  const [isLoadingStores, setIsLoadingStores] = useState(false)
  const [storeFetchError, setStoreFetchError] = useState<string | null>(null)
  const [eventDetail, setEventDetail] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const stepHistoryRef = useRef<Step[]>(['home'])
  const isHandlingBackRef = useRef(false)
  const openLineShare = (text: string) => {
  const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
  window.open(url, '_blank')
}
  const [reminderCopied, setReminderCopied] = useState(false)

function getPreviousStep(currentStep: Step): Step | null {
  const currentIndex = FLOW_STEPS.indexOf(currentStep)
  if (currentIndex <= 0) return null
  return FLOW_STEPS[currentIndex - 1] ?? null
}
  

 



function normalizeDateAnswers(
  rawAnswers: Record<string, Availability> | undefined,
  datesForMap: { id: string }[]
): Record<string, Availability> {
  const normalized: Record<string, Availability> = {}

  datesForMap.forEach((date, index) => {
    const legacyKey = `date${index + 1}`
    const value = rawAnswers?.[legacyKey]

    if (value) {
      normalized[date.id] = value
    }
  })

  return normalized
}

useEffect(() => {
  if (typeof window === 'undefined') return

  const historyStack = stepHistoryRef.current
  const lastStep = historyStack[historyStack.length - 1]

  if (lastStep !== step) {
    historyStack.push(step)
  }

  // アプリ内step用の履歴を1つ積む
  window.history.pushState({ appStep: step }, '', window.location.href)
}, [step])

useEffect(() => {
  if (typeof window === 'undefined') return

  const onPopState = () => {
    if (isHandlingBackRef.current) return

    // homeなら通常のブラウザ戻るを許可
    if (step === 'home') return

    const previousStep = getPreviousStep(step)

    if (!previousStep) return

    isHandlingBackRef.current = true
    setStep(previousStep)

    // popstate後にフラグ解除
    window.setTimeout(() => {
      isHandlingBackRef.current = false
    }, 0)
  }

  window.addEventListener('popstate', onPopState)
  return () => window.removeEventListener('popstate', onPopState)
}, [step])

  const activeDates = useMemo(() => {
  if (dbDates.length === 0) return dates
  return dbDates.map((d: any) => ({
    id: d.id,
    label: d.label,
  }))
}, [dbDates, dates])

const selectedStore: StoreCandidate | null =
  recommendedStores?.[0] ?? null

const activeTags = [
  ...(selectedStore?.tags ?? []),
  ...(organizerConditions ?? []),
]



const activeParticipants = useMemo(() => {
  if (dbResponses.length === 0) return []

  return dbResponses.map((r: any, index: number) => ({
    id: r.id ?? `resp-${index}`,
    name: r.participant_name || `参加者${index + 1}`,
    availability: normalizeDateAnswers(r.date_answers ?? {}, activeDates),
    genres: r.genres ?? [],
    area: r.areas ?? [],
  }))
}, [dbResponses, activeDates])



const answeredParticipants = activeParticipants.filter((p) =>
  activeDates.some((date) => {
    const value = p.availability?.[date.id]
    return value === 'yes' || value === 'maybe' || value === 'no'
  })
)

const unanswered = activeParticipants
  .filter((p) =>
    !activeDates.some((date) => {
      const value = p.availability?.[date.id]
      return value === 'yes' || value === 'maybe' || value === 'no'
    })
  )
  .map((p) => p.name)

const answerCount = answeredParticipants.length
const totalCount = activeParticipants.length
const unansweredCount = totalCount - answerCount


const recommendedDate = useMemo(() => {
  if (activeDates.length === 0) return null

  const scored = activeDates.map(date => {
    const totalScore = activeParticipants.reduce(
      (s, p) => s + scoreAvailability(p.availability?.[date.id]),
      0
    )

    const availableCount = activeParticipants.filter(
      p => p.availability?.[date.id] === 'yes'
    ).length

    const mg = activeParticipants.find(p => p.id === mainGuestId)
    const mga = mg?.availability?.[date.id]
    const bonus = mga === 'yes' ? 3 : mga === 'maybe' ? 1 : 0

    return {
      date,
      score: totalScore + bonus,
      availableCount,
      mainGuestAvailability: mga,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}, [activeDates, activeParticipants, mainGuestId])

const altDates = useMemo(
  () => activeDates.filter(d => d.id !== recommendedDate?.date.id).slice(0, 2),
  [activeDates, recommendedDate]
)

const storePool = recommendedStores.length > 0 ? recommendedStores : MOCK_STORES




  
const alternativeStores =
  storePool.filter(s => s.id !== selectedStore?.id)

  const selectedPastStore = MOCK_PAST_STORES.find(s => s.id === selectedPastStoreId)

  const shareText =
  selectedStore
    ? generateShareText(eventType, selectedStore, organizerConditions)
    : ''

const availableCount = recommendedDate?.availableCount ?? 0
  
const dateReason =
  recommendedDate && totalCount > 0 && recommendedDate.availableCount > 0
    ? buildDateReason({
        mainGuestAvailability: recommendedDate.mainGuestAvailability,
        availableCount: recommendedDate.availableCount,
        totalCount,
        eventType,
      })
    : 'まだ十分な回答が集まっていないため、日程理由は表示していません。'



const dateSummaryText =
  totalCount === 0 || availableCount === 0
    ? 'まだ十分な回答が集まっていません'
    : availableCount === 1
    ? '現時点では1名が参加可能です'
    : `参加できる人 ${availableCount}人 — 現時点で最も集まりやすい候補です`

const storeReason = selectedStore
  ? buildStoreReason({
      store: selectedStore,
      participants: activeParticipants,
      organizerConditions,
    })
  : '条件のバランスがよいため優先'

  // Merge store tags + active organizer conditions into display tags (max 4)
const effectiveTags = useMemo(() => {
  const result = [...(selectedStore?.tags ?? [])]
  organizerConditions.forEach(c => {
    const tag = c.replace('希望', '').replace('がよい', '')
    if (!result.includes(tag)) result.push(tag)
  })
  return result.slice(0, 4)
}, [selectedStore, organizerConditions])

  const primaryStore = selectedStore
const secondaryStores = alternativeStores.slice(0, 2)



function buildSubStoreReason(store: StoreCandidate) {
const areaHit = activeParticipants.some((p) =>
  (p.area ?? []).some((a: string) => a !== '中間でOK' && (store.area ?? '').includes(a))
)

const genreHit = activeParticipants.some((p) =>
  (p.genres ?? []).some((g: string) =>
    store.name.includes(g) || (store.reason ?? '').includes(g)
  )
)
  const privateRoomHit = organizerConditions.includes('個室あり') && (store.tags ?? []).includes('個室あり')

  if (privateRoomHit) return '幹事条件を満たしやすい代替候補'
  if (areaHit && genreHit) return 'エリアとジャンルの両方で外しにくい候補'
  if (areaHit) return '集まりやすさを優先した代替候補'
  if (genreHit) return 'ジャンル希望に寄せた代替候補'
  return '条件が少し変わったときの予備候補'
}

  function addDate() {
    const t = dateInput.trim()
    if (!t) return
    setDates(p => [...p, { id: `date-${Date.now()}`, label: t }])
    setDateInput('')
  }
  function removeDate(id: string) { setDates(p => p.filter(d => d.id !== id)) }
  function toggleItem(v: string, list: string[], set: (n: string[]) => void) {
    set(list.includes(v) ? list.filter(i => i !== v) : [...list, v])
  }
  function goToStoreDetail(id: string, origin: Step) {
    setSelectedPastStoreId(id)
    setStoreDetailOrigin(origin)
    setStep('storeDetail')
  }
  // Reuse a past store as the first candidate → jump straight to storeSuggestion
  function reuseStoreAsFirst(pastStore: PastStore) {
    const match = MOCK_STORES.find(s => s.name === pastStore.name)
    setSelectedStoreId(match?.id ?? MOCK_STORES[0].id)
    setStep('storeSuggestion')
  }
  // Reuse event type and start fresh from create
  function reuseEventTypeAndCreate(type: string) {
    setEventType(type as EventType)
    setEventName(type)
    setStep('create')
  }
  async function copyShareText() {
    try { await navigator.clipboard.writeText(shareText); alert('コピーしました') }
    catch { alert('コピーに失敗しました') }
  }

async function decideRecommendedDate() {
  if (!recommendedDate) return

  const currentEventId = createdEventId || finalEvent?.id
  if (!currentEventId) {
    alert('event_id が見つかりません')
    return
  }

  if (totalCount === 0) {
    alert('まだ回答がありません。参加者の回答を待ってから日程を決めてください。')
    return
  }

  if (recommendedDate.availableCount === 0) {
    alert('参加できる人がいないため、この状態では日程を確定できません。')
    return
  }

  try {
const data = await saveDecision({
  eventId: currentEventId,
  selectedDateId: recommendedDate.date.id,
  organizerConditions,
})

    setFinalDecision(data)
    setStep('dateConfirmed')
  } catch (e: any) {
    alert(`決定保存に失敗しました: ${e?.message ?? 'unknown error'}`)
  }
}

async function fetchRecommendedStores() {
  if (!recommendedDate) {
    alert('先に日程を確定してください')
    return
  }

  setIsLoadingStores(true)
  setStoreFetchError(null)

  try {
    const res = await fetch('/api/store-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        date: recommendedDate.date.label,
        participantCount: activeParticipants.length,
        participants: activeParticipants.map((p) => ({
          name: p.name,
          areas: p.area ?? [],
          genres: p.genres ?? [],
        })),
        organizerConditions,
      }),
    })

    const data = await res.json()


    
    console.log('store recommend result:', data)

    if (!res.ok) {
      throw new Error(data?.error ?? `HTTP ${res.status}`)
    }

    const stores: StoreCandidate[] = (data.stores ?? []).map((s: any, index: number) => ({
      id: s.id ?? `gemini-store-${index + 1}`,
      name: s.name ?? `候補${index + 1}`,
      area: s.area ?? '未設定',
      access: s.access ?? '',
      reason: s.reason ?? '条件に合いやすい候補です',
      link: s.link ?? '#',
      tags: Array.isArray(s.tags) ? s.tags.slice(0, 4) : [],
    }))

    if (stores.length === 0) {
      throw new Error('候補が返ってきませんでした')
    }

    setRecommendedStores(stores)
    setSelectedStoreId(stores[0].id)
    setStep('storeSuggestion')
  } catch (e: any) {
    console.error(e)
    setStoreFetchError(e?.message ?? 'unknown error')
    setRecommendedStores([])
    setSelectedStoreId(MOCK_STORES[0].id)
    setStep('storeSuggestion')
  } finally {
    setIsLoadingStores(false)
  }
}


async function loadFinalDecisionView() {
  const currentEventId = createdEventId || finalEvent?.id
  if (!currentEventId) {
    alert('event_id が見つかりません')
    return
  }

  try {
    const result = await loadEventData(currentEventId)
    const decisionResult = await loadDecision(currentEventId)

    setDbDates(result.dates ?? [])
    setDbResponses(result.responses ?? [])
    setFinalDates(result.dates ?? [])
    setFinalDecision(decisionResult?.decision ?? decisionResult ?? null)

    setStep('finalConfirm')
  } catch (e: any) {
    alert(`最終確認データの取得に失敗しました: ${e?.message ?? 'unknown error'}`)
  }
}


const showProgress = FLOW_STEPS.includes(step)

// Sort past stores so ◎ ones appear first
const sortedPastStores = [...MOCK_PAST_STORES].sort((a, b) => {
  const order = { '◎': 0, '○': 1, '△': 2 }
  return order[a.rating] - order[b.rating]
})

const shareUrl =
  typeof window !== 'undefined'
    ? `${window.location.origin}/e/${createdEventId}`
    : ''

const reminderText = `日程調整の回答をお願いします！
1分で終わります🙏

${shareUrl}`

const finalSelectedDate =
  finalDecision && finalDates.length > 0
    ? finalDates.find((d: any) => d.id === finalDecision.selected_date_id) ?? null
    : null

    

return (
  <main className="min-h-screen" style={{ background: '#F5F3EF' }}>
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-14 pt-7 sm:px-6 lg:px-8">
      {/* App header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black tracking-[0.3em] text-stone-400 uppercase">Kanji</p>
          <p className="mt-0.5 text-sm font-semibold text-stone-500">幹事の決定を助けるアプリ</p>
        </div>
        {step !== 'home' && !showProgress && (
          <button
            type="button"
            onClick={() => setStep('home')}
            className="text-xs font-semibold text-stone-400 hover:text-stone-600"
          >
            ホーム
          </button>
        )}
      </header>

      {showProgress && <FlowProgress step={step} />}

      

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ① ホーム
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'home' && (
          <div className="space-y-5">

            {/* Hero CTA */}
            <button type="button"
              onClick={() => setStep('create')}
              className="group relative w-full overflow-hidden rounded-3xl bg-stone-900 px-7 py-7 text-left transition hover:bg-stone-800 active:scale-[0.99]"
            >
              <p className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">新しく始める</p>
              <p className="mt-1.5 text-2xl font-black text-white tracking-tight">会を作る</p>
              <p className="mt-1 text-sm text-white/50">日程調整から店決めまで、約5分で完結</p>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white text-xl transition group-hover:bg-white/20">
                →
              </div>
            </button>

            {/* 進行中の会 */}
           {/*<section>
              <SectionLabel>進行中の会</SectionLabel>
              <button type="button"
                onClick={() => setStep('dashboard')}
                className="mt-2.5 block w-full rounded-3xl bg-white px-5 py-4 text-left shadow-sm ring-1 ring-stone-100 transition hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-black text-stone-900 tracking-tight">新入社員 歓迎会</p>
                    <p className="mt-0.5 text-xs text-stone-400">4/12（金）調整中</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-amber-200">
                    回答待ち 3/5
                  </span>
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t border-stone-50 pt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <p className="text-[11px] text-stone-400">鈴木・高橋が未回答</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1.5">
                    <p className="text-[11px] font-bold text-white">日程を確定する</p>
                    <span className="text-[11px] text-white/50">→</span>
                  </div>
                </div>
              </button>
            </section>*/}

            {/* 過去のお店 — "また使えそうなお店"として見せる */}
            {/*<section>
              <div className="flex items-baseline justify-between">
                <SectionLabel>また使えそうなお店</SectionLabel>
                <button type="button" onClick={() => setStep('pastStores')} className="text-[11px] font-semibold text-stone-400 hover:text-stone-600">
                  すべて見る
                </button>
              </div>
              <div className="mt-2.5 space-y-2">
                {sortedPastStores.slice(0, 2).map(store => (
                  <button type="button"
                    key={store.id}
                    onClick={() => goToStoreDetail(store.id, 'home')}
                    className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-stone-100 transition hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-bold text-stone-800 truncate">{store.name}</p>
                        {store.rating === '◎' && (
                          <span className="shrink-0 text-[10px] font-black text-emerald-600">また使いたい</span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-400">{store.area} · {store.eventType}</p>
                    </div>
                    <span className={cx('ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ring-1', ratingStyle(store.rating))}>
                      {store.rating}
                    </span>
                  </button>
                ))}
              </div>
            </section>*/}

          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ② イベント作成
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'create' && (
          <Card>
            <StepLabel n={1} />
            <CardTitle>イベントを作成</CardTitle>
            <CardSub>会の種類を選ぶと、お店提案や共有文が自動で調整されます。</CardSub>

            <FieldLabel>会の種類</FieldLabel>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {EVENT_TYPES.map(t => (
                <Chip
                  key={t}
                  active={eventType === t}
                  onClick={() => { setEventType(t); setEventName(t) }}
                >
                  {t}
                </Chip>
              ))}
            </div>

            <div className="mt-5">
              <FieldLabel>イベント名（任意）</FieldLabel>
              <input
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder="例：歓迎会 / ごはん会"
                className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
              />
            </div>

            <ButtonRow>
              <GhostBtn onClick={() => setStep('home')}>戻る</GhostBtn>
              <PrimaryBtn onClick={() => setStep('dates')}>次へ</PrimaryBtn>
            </ButtonRow>
          </Card>
        )}

        

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ③ 候補日入力
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'dates' && (
          <Card>
            <StepLabel n={2} />
            <CardTitle>候補日を入れる</CardTitle>
            <CardSub>参加者に○△×で選んでもらう日程です。</CardSub>
            <FieldLabel>候補日を追加</FieldLabel>
            <div className="mt-2 flex gap-2">
              <input
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDate()}
                placeholder="例：4/18（金）19:00"
                className="flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
              />
              <button type="button" onClick={addDate} className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-bold text-stone-600 transition hover:bg-stone-200">
                追加
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {dates.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
                  <span className="text-sm font-medium text-stone-700">{d.label}</span>
                  <button type="button" onClick={() => removeDate(d.id)} className="text-xs text-stone-300 transition hover:text-stone-500">削除</button>
                </div>
              ))}
            </div>
            <ButtonRow>
              <GhostBtn onClick={() => setStep('create')}>戻る</GhostBtn>
              <PrimaryBtn
  onClick={async () => {
    const eventId = await createEvent(
      eventName,
      eventType,
      dates.map((d) => d.label)
    )

    setCreatedEventId(eventId)
    setStep('shareLink')
  }}
>
  共有リンクを発行する
</PrimaryBtn>
            </ButtonRow>
          </Card>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            参加者に送る
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        
        
        
        {step === 'shareLink' && (
          <Card>
            <StepLabel n={3} />
            <CardTitle>参加者に送る</CardTitle>
            <CardSub>リンクを送るだけでOKです。</CardSub>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase mb-1.5">共有 URL</p>
            <p className="font-mono text-sm text-stone-600 break-all">

              
              {shareUrl}
            </p>
            </div>

<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <PrimaryBtn
    onClick={async () => {
      if (!shareUrl) return
      await navigator.clipboard.writeText(shareUrl)
    }}
  >
    リンクをコピー
  </PrimaryBtn>

  <GhostBtn
    onClick={() => {
      if (!shareUrl) return
      const text = `日程調整お願いします！
以下のリンクから回答してください🙏
${shareUrl}`

      const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
      window.open(url, '_blank')
    }}
  >
    LINEで送る
  </GhostBtn>
</div>

            <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-100">
              <p className="text-sm leading-6 text-amber-800">
                回答はすぐ終わります。
              </p>
            </div>
            
            <ButtonRow>
              <GhostBtn onClick={() => setStep('dates')}>戻る</GhostBtn>
             <PrimaryBtn
  onClick={async () => {
    const result = await loadEventData(createdEventId)

    setDbDates(result.dates ?? [])
    setDbResponses(result.responses ?? [])

    setStep('dashboard')
  }}
>
  回答を確認して決める
</PrimaryBtn>
            </ButtonRow>
          </Card>
        )}



        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑤ ダッシュボード
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
       {step === 'dashboard' && (
  <div className="space-y-5">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 4</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">回答状況</h2>
      <p className="mt-1 text-sm text-stone-400">今の回答だけで先に決めてOKです。</p>
    </div>

    <button
      type="button"
      onClick={() => setStep('dateSuggestion')}
      className="w-full rounded-3xl bg-stone-900 px-6 py-5 text-center transition hover:bg-stone-800 active:scale-[0.98]"
    >
      <p className="text-base font-black text-white">日程の提案を見る</p>
      <p className="mt-0.5 text-sm font-normal text-white/50">今の回答で最善の日程を表示します</p>
    </button>

    <div className="grid grid-cols-2 gap-3">
      <StatBox label="回答済み" value={`${answerCount} / ${totalCount}人`} />
      {recommendedDate && (
        <StatBox label="最有力日程" value={recommendedDate.date.label} />
      )}
    </div>

    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-100">
      <div className="flex items-center justify-between border-b border-stone-50 px-5 py-3">
        <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">回答テーブル</p>
        <p className="text-[10px] text-stone-300">○ △ ×</p>
      </div>
      <div className="overflow-x-auto px-5 py-4">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left">
              <th className="pr-5 text-[11px] font-semibold text-stone-400">参加者</th>
              {activeDates.map((d) => (
                <th
                  key={d.id}
                  className={cx(
                    'whitespace-nowrap pr-6 text-[11px] font-semibold',
                    d.id === recommendedDate?.date.id ? 'text-stone-900' : 'text-stone-400'
                  )}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeParticipants.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap pr-5 text-sm font-bold text-stone-700">{p.name}</td>
                {activeDates.map((d) => (
                  <td
                    key={d.id}
                    className={cx(
                      'whitespace-nowrap pr-6 text-sm',
                      availabilityStyle(p.availability[d.id]),
                      d.id === recommendedDate?.date.id && 'rounded-md bg-stone-50'
                    )}
                  >
                    {availabilityLabel(p.availability[d.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {activeParticipants.length > 0 && (
      <div className="rounded-3xl bg-white px-5 py-4 shadow-sm ring-1 ring-stone-100">
        <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">主賓を指定（任意）</p>
        <div className="flex flex-wrap gap-2">
          {activeParticipants.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => setMainGuestId(p.id)}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-bold transition',
                mainGuestId === p.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    )}

    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
      <p className="mb-2 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">未回答への催促</p>
      <p className="mb-4 whitespace-pre-line text-sm leading-6 text-stone-600">{reminderText}</p>
      <div className="space-y-2">
        <button
          type="button"
          onClick={async () => {
            if (!shareUrl) return
            await navigator.clipboard.writeText(reminderText)
            setReminderCopied(true)
            setTimeout(() => setReminderCopied(false), 1600)
          }}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-100 px-4 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-200 active:scale-[0.98]"
        >
          {reminderCopied ? 'コピーしました' : 'リマインドをコピー'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!shareUrl) return
            const url = `https://line.me/R/msg/text/?${encodeURIComponent(reminderText)}`
            window.open(url, '_blank')
          }}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
        >
          LINEで催促する
        </button>
      </div>
    </div>

    <GhostBtn onClick={() => setStep('shareLink')}>← 戻る</GhostBtn>
  </div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑥ 日程提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'dateSuggestion' && recommendedDate && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 5</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">この日程でどうですか</h2>
      <p className="mt-1 text-sm text-stone-400">参加状況から最も集まりやすい日を選びました。</p>
    </div>

    <div className="overflow-hidden rounded-3xl bg-stone-900">
      <div className="px-6 py-6">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/40">この日がベスト</p>
        <p className="text-4xl font-black leading-tight tracking-tight text-white">
          {recommendedDate.date.label}
        </p>
      </div>

      <div className="space-y-3 bg-white/[0.06] px-6 py-5">
        <ReasonItem
          icon="◎"
          text={
            recommendedDate.mainGuestAvailability === 'yes'
              ? '主賓が参加できる'
              : recommendedDate.mainGuestAvailability === 'maybe'
              ? '主賓は調整すれば参加可能'
              : '主賓は参加しにくい日程'
          }
          highlight={recommendedDate.mainGuestAvailability === 'yes'}
        />
        <ReasonItem icon="人" text={dateSummaryText} />
      </div>

      <div className="px-6 py-5">
        <PrimaryBtn size="large" onClick={decideRecommendedDate}>
          この日で決定
        </PrimaryBtn>
      </div>
    </div>

    <div className="rounded-2xl bg-amber-50 px-4 py-4 ring-1 ring-amber-100">
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">提案理由</p>
      <p className="text-sm leading-6 text-amber-800">{dateReason}</p>
    </div>

    {altDates.length > 0 && (
      <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-100 shadow-sm">
        <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">他の候補</p>
        <div className="space-y-2">
          {altDates.map((d) => (
            <div key={d.id} className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500 ring-1 ring-stone-100">
              {d.label}
            </div>
          ))}
        </div>
      </div>
    )}

    <GhostBtn onClick={() => setStep('dashboard')}>← 戻る</GhostBtn>
  </div>
)}



        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑦ 日程確定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'dateConfirmed' && recommendedDate && (
          <Card>
            <StepLabel n={6} />
            <CardTitle>日程が決まりました</CardTitle>
            <CardSub>次は参加者の希望をもとにお店を決めます。</CardSub>
            <div className="rounded-2xl bg-stone-50 px-5 py-5">
              <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase mb-1.5">確定日程</p>
              <p className="text-2xl font-black text-stone-900 tracking-tight">{recommendedDate.date.label}</p>
            </div>
            <ButtonRow>
              <GhostBtn onClick={() => setStep('dateSuggestion')}>戻る</GhostBtn>
<PrimaryBtn size="large" onClick={() => setStep('organizerConditions')}>
  次へ（店決めへ）
</PrimaryBtn>            </ButtonRow>
          </Card>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑧ 幹事条件設定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'organizerConditions' && (
          <Card>
            <StepLabel n={7} />
            <CardTitle>幹事の条件</CardTitle>
            <CardSub>参加者には見せない、幹事だけの条件を追加できます。すべて任意です。</CardSub>
            <div className="flex flex-wrap gap-2">
              {ORGANIZER_CONDITION_OPTIONS.map(c => (
                <Chip key={c} active={organizerConditions.includes(c)} onClick={() => toggleItem(c, organizerConditions, setOrganizerConditions)}>
                  {c}
                </Chip>
              ))}
            </div>
            {organizerConditions.length > 0 && (
              <div className="mt-4 rounded-xl bg-stone-50 px-4 py-3">
                <p className="text-xs text-stone-500">
                  選択中：<span className="font-bold text-stone-700">{organizerConditions.join('・')}</span>
                </p>
              </div>
            )}
            <ButtonRow>
              <GhostBtn onClick={() => setStep('dateConfirmed')}>戻る</GhostBtn>
              <PrimaryBtn onClick={fetchRecommendedStores}>
                {isLoadingStores ? '店を提案中…' : 'おすすめの店を見る'}
              </PrimaryBtn>
            </ButtonRow>
          </Card>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨ 店提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'storeSuggestion' && recommendedDate && recommendedStores.length > 0 && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 9</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">今回の最適解</h2>
      <p className="mt-1 text-sm text-stone-400">比較して悩むより、まずはこの候補から見ればOKです。</p>
    </div>

    {(() => {
      const primaryStore = recommendedStores[0]
      const secondaryStores = recommendedStores.slice(1)
      const participantCount = dbResponses.length
      return (
        <div className="space-y-4">
          {/* 第一候補 — dark hero */}
          <div className="overflow-hidden rounded-3xl bg-stone-900">
            <div className="px-6 py-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Best Choice</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{primaryStore.name}</h3>
              {primaryStore.area && (
                <p className="mt-1 text-sm text-white/50">
                  {primaryStore.area}{primaryStore.access ? ` · ${primaryStore.access}` : ''}
                </p>
              )}
            </div>

            {primaryStore.image && (
              <div className="overflow-hidden">
                <img src={primaryStore.image} alt={primaryStore.name} className="h-52 w-full object-cover opacity-80" />
              </div>
            )}

            <div className="space-y-2 bg-white/[0.06] px-6 py-5">
              <p className="text-sm font-bold text-white/80">{storeReason}</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                  {recommendedDate.date.label}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                  {participantCount}人
                </span>
                {effectiveTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="px-6 py-5">
              <a
                href={primaryStore.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-4 text-base font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
              >
                この店で予約に進む →
              </a>
 <p className="mt-2 text-center text-xs font-semibold text-white/40">
    まずはこの候補を見ればOKです
  </p>

            </div>
          </div>

          {/* 補足理由 */}
          <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
            <p className="text-sm font-bold text-amber-900">この候補を出した理由</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">{storeReason}</p>
          </div>

          {/* 他候補 */}
          {secondaryStores.length > 0 && (
            <details className="rounded-2xl bg-stone-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-stone-700">
                他の候補を見る
              </summary>
              <div className="mt-4 space-y-3">
                {secondaryStores.map((store: any) => (
                  <div key={store.id} className="rounded-2xl border border-stone-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-stone-900">{store.name}</p>
                        {store.genre && <p className="mt-1 text-xs text-stone-500">{store.genre}</p>}
                      </div>
                      {store.area && (
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-600">
                          {store.area}
                        </span>
                      )}
                    </div>
                    {store.reason && (
                      <p className="mt-2 text-sm leading-6 text-stone-600">
  {buildSubStoreReason(store)}
</p>
                    )}
                    <div className="mt-3">
                      <a
                        href={store.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
                      >
                        この候補を見る
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <button
            type="button"
            onClick={() => setStep('finalConfirm')}
            className="w-full rounded-3xl bg-stone-900 px-6 py-5 text-base font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
          >
            この候補で進む →
          </button>
          <GhostBtn onClick={() => setStep('organizerConditions')}>← 条件を見直す</GhostBtn>
        </div>
      )
    })()}
  </div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨-b 最終確認（決定内容 + 共有文プレビュー）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'finalConfirm' && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 10</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">これで進めればOKです</h2>
      <p className="mt-1 text-sm text-stone-400">日程と候補がまとまりました。あとは共有するだけです。</p>
    </div>

    {(() => {
      const finalSelectedDate =
        finalDecision && finalDates.length > 0
          ? finalDates.find((d: any) => d.id === finalDecision.selected_date_id) ?? null
          : null

      const finalStore = selectedStore || recommendedStores?.[0] || null
      const participantCount = dbResponses.length

      const finalShareText =
        shareText ||
        `日程は ${finalSelectedDate?.label ?? '未設定'} で進めたいです！
候補はこちら：${finalStore?.name ?? 'お店未設定'}
${finalStore?.link ?? ''}`

      return (
        <div className="space-y-4">
          {/* 決定内容 */}
          <div className="overflow-hidden rounded-3xl bg-stone-900">
            <div className="px-6 py-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Final Summary</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-bold text-white/40">日程</p>
                  <p className="mt-1 text-xl font-black text-white">
                    {finalSelectedDate?.label ?? recommendedDate?.date.label ?? '未設定'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-white/40">お店候補</p>
                  <p className="mt-1 text-xl font-black text-white">{finalStore?.name ?? '未設定'}</p>
                  {finalStore?.area && (
                    <p className="mt-0.5 text-sm text-white/50">{finalStore.area}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 bg-white/[0.06] px-6 py-4">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                回答者 {participantCount}人
              </span>
              {eventType && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                  {eventType}
                </span>
              )}
              {effectiveTags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 理由 */}
          {finalStore?.reason && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
              <p className="text-sm font-bold text-amber-900">この候補にした理由</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">{finalStore.reason}</p>
            </div>
          )}

          {/* 共有文 + CTA */}
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
            <p className="mb-3 text-sm font-bold text-stone-900">共有文</p>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="whitespace-pre-line text-sm leading-6 text-stone-700">{finalShareText}</p>
            </div>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(finalShareText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-900 px-4 py-4 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                {copied ? 'コピーしました ✓' : '共有文をコピーする'}
              </button>
              <button
                type="button"
                onClick={() => openLineShare(finalShareText)}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                LINEで送る
              </button>
            </div>
          </div>

          {finalStore?.link && (
            <a
              href={finalStore.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-4 text-base font-black text-stone-900 transition hover:bg-stone-50 active:scale-[0.98]"
            >
              お店ページを開く →
            </a>
          )}

          <GhostBtn onClick={() => setStep('storeSuggestion')}>← 店候補を見直す</GhostBtn>
        </div>
      )
    })()}
  </div>
)}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑩ 共有
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'shared' && (
          <div className="space-y-4">
            <div className="px-1">
              <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 10</p>
              <h2 className="mt-1 text-2xl font-black text-stone-900 tracking-tight">みんなに伝えよう</h2>
              <p className="mt-1 text-sm text-stone-400">共有文をそのまま送れます。</p>
            </div>

            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
              <p className="whitespace-pre-line text-sm leading-7 text-stone-700">{shareText}</p>
            </div>

            <div className="space-y-2.5">
              <PrimaryBtn onClick={copyShareText}>コピー</PrimaryBtn>
              <a
                href={`https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                LINEで送る
              </a>
              <GhostBtn onClick={() => setStep('home')}>ホームに戻る</GhostBtn>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑪ 過去に使ったお店一覧
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'pastStores' && (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <button type="button" onClick={() => setStep('home')} className="text-stone-400 hover:text-stone-600">←</button>
              <div>
                <h2 className="text-xl font-black tracking-tight text-stone-900">過去に使ったお店</h2>
                <p className="mt-0.5 text-[11px] text-stone-400">次の幹事業務に活かせます</p>
              </div>
            </div>
            <div className="space-y-3">
              {sortedPastStores.map(store => (
                <button type="button"
                  key={store.id}
                  onClick={() => goToStoreDetail(store.id, 'pastStores')}
                  className="block w-full rounded-3xl bg-white px-5 py-4 text-left shadow-sm ring-1 ring-stone-100 transition hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-black text-stone-500">{store.eventType}</span>
                        <span className="text-[11px] text-stone-400">{store.area}</span>
                        {store.rating === '◎' && (
                          <span className="text-[10px] font-black text-emerald-600">また使いたい</span>
                        )}
                      </div>
                      <p className="text-base font-black text-stone-900 tracking-tight">{store.name}</p>
                    </div>
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ring-1', ratingStyle(store.rating))}>
                      {store.rating}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {store.members.map(m => (
                      <span key={m} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] text-stone-500">{m}</span>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-stone-50 pt-2.5 flex items-center justify-between">
                    <p className="text-[11px] text-stone-300 line-clamp-1">{store.memo}</p>
                    <p className="shrink-0 ml-2 text-[11px] font-semibold text-stone-400">詳細・再利用 →</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑫ 店詳細
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'storeDetail' && selectedPastStore && (
          <div>
            <div className="mb-5">
              <button type="button" onClick={() => setStep(storeDetailOrigin)} className="text-sm font-semibold text-stone-400 hover:text-stone-600">
                ← 戻る
              </button>
            </div>
            <div className="space-y-3">

              {/* Header card */}
              <div className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-stone-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-black text-stone-500">{selectedPastStore.eventType}</span>
                    <h2 className="mt-2.5 text-2xl font-black text-stone-900 tracking-tight">{selectedPastStore.name}</h2>
                    <p className="mt-1 text-sm text-stone-400">{selectedPastStore.area}</p>
                  </div>
                  <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black ring-1', ratingStyle(selectedPastStore.rating))}>
                    {selectedPastStore.rating}
                  </span>
                </div>
              </div>

              {/* Members */}
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-100">
                <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase mb-3">参加メンバー</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPastStore.members.map(m => (
                    <span key={m} className="rounded-full bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">{m}</span>
                  ))}
                </div>
              </div>

              {/* Memo */}
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-100">
                <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase mb-3">幹事メモ</p>
                <p className="text-sm leading-6 text-stone-700">{selectedPastStore.memo}</p>
              </div>

              {/* Reuse actions */}
              <div className="rounded-2xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase mb-3">この店を再利用する</p>
                <div className="space-y-2">
                  <button type="button"
                    onClick={() => reuseStoreAsFirst(selectedPastStore)}
                    className="block w-full rounded-2xl bg-stone-900 px-4 py-3.5 text-left transition hover:bg-stone-800 active:scale-[0.99]"
                  >
                    <p className="text-sm font-black text-white">この店を第一候補にして進める</p>
                    <p className="mt-0.5 text-[11px] text-white/50">お店選びの画面から再開します</p>
                  </button>
                  <button type="button"
                    onClick={() => reuseEventTypeAndCreate(selectedPastStore.eventType)}
                    className="block w-full rounded-2xl bg-white px-4 py-3.5 text-left ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.99]"
                  >
                    <p className="text-sm font-bold text-stone-700">同じ会タイプで新しい会を作る</p>
                    <p className="mt-0.5 text-[11px] text-stone-400">{selectedPastStore.eventType}として最初から始めます</p>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </main>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FlowProgress({ step }: { step: Step }) {
  const current = FLOW_STEPS.indexOf(step)
  return (
    <div className="mb-7 flex gap-1">
      {FLOW_STEPS.map((_, i) => (
        <div
          key={i}
          className={cx(
            'h-[3px] flex-1 rounded-full transition-all duration-500',
            i < current ? 'bg-stone-700' : i === current ? 'bg-stone-900' : 'bg-stone-200'
          )}
        />
      ))}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100 md:px-6 md:py-6 lg:px-7 lg:py-7">
      {children}
    </section>
  )
}

function StepLabel({ n }: { n: number }) {
  return (
    <p className="mb-4 text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">
      Step {n} / 10
    </p>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-black tracking-tight text-stone-900 leading-tight">{children}</h2>
}

function CardSub({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 mb-6 text-sm leading-6 text-stone-400">{children}</p>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">{children}</p>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold text-stone-700">{children}</p>
}

function StatBox({ label, value, soft }: { label: string; value: string; soft?: boolean }) {
  return (
    <div className={cx('rounded-2xl px-4 py-4', soft ? 'bg-amber-50' : 'bg-stone-50')}>
      <p className={cx('text-[10px] font-black tracking-[0.2em] uppercase', soft ? 'text-amber-500' : 'text-stone-400')}>{label}</p>
      <p className={cx('mt-2 text-xl font-black', soft ? 'text-amber-700' : 'text-stone-900')}>{value}</p>
    </div>
  )
}

function ReasonItem({ icon, text, highlight }: { icon: string; text: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cx('mt-0.5 shrink-0 text-sm', highlight ? 'text-emerald-400' : 'text-white/40')}>{icon}</span>
      <p className={cx('text-sm leading-5', highlight ? 'font-semibold text-white/90' : 'text-white/65')}>{text}</p>
    </div>
  )
}

function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 flex gap-3">{children}</div>
}

function PrimaryBtn({
  children,
  onClick,
  size = 'default',
  disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  size?: 'large' | 'default'
  disabled?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cx(
        'w-full rounded-2xl font-black transition active:scale-[0.98]',
        size === 'large' ? 'py-4 text-base' : 'py-3 text-sm',
        disabled
          ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
          : 'bg-emerald-500 text-white hover:bg-emerald-600'
      )}
    >
      {children}
    </button>
  )
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3.5 text-sm font-semibold text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 active:scale-[0.98]"
    >
      {children}
    </button>
  )
}

function DecisionLayout({
  main,
  side,
}: {
  main: React.ReactNode
  side: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <div className="min-w-0 space-y-4">{main}</div>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
        {side}
      </aside>
    </div>
  )
}

function PaneCard({
  title,
  sub,
  children,
}: {
  title: React.ReactNode
  sub?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100 md:px-6 md:py-6">
      <div className="mb-4">
        <h3 className="text-base font-black tracking-tight text-stone-900 md:text-lg">
          {title}
        </h3>
        {sub ? (
          <p className="mt-1 text-sm leading-6 text-stone-400">{sub}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function MiniInfoCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  tone?: 'default' | 'warm'
}) {
  return (
    <div
      className={cx(
        'rounded-2xl px-4 py-4 ring-1',
        tone === 'warm'
          ? 'bg-amber-50 ring-amber-100'
          : 'bg-stone-50 ring-stone-100'
      )}
    >
      <p
        className={cx(
          'text-[10px] font-black uppercase tracking-[0.2em]',
          tone === 'warm' ? 'text-amber-500' : 'text-stone-400'
        )}
      >
        {label}
      </p>
      <div
        className={cx(
          'mt-2',
          tone === 'warm' ? 'text-amber-800' : 'text-stone-900'
        )}
      >
        {value}
      </div>
    </div>
  )
}


function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button"
      onClick={onClick}
      className={cx(
        'rounded-full px-4 py-2 text-sm font-bold transition active:scale-95',
        active ? 'bg-white text-stone-900 ring-1 ring-stone-200' : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
      )}
    >
      {children}
    </button>
  )
}
