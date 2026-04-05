'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { createEvent, loadEventData } from '@/lib/kanji-db'
import { saveDecision } from '@/lib/kanji-db'
import { loadDecision } from '@/lib/kanji-db'
import { StationInput } from '@/app/components/StationInput'

// --- Types ---
type Step =
  | 'home'
  | 'create'
  | 'dates'
  | 'shareLink'
  | 'dashboard'

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
type OrganizerPrefs = {
  priceRange: string
  genres: string[]
  drinks: string[]
  privateRoom: string
  allYouCanDrink: string
  smoking: string
  areas: string[]
  atmosphere: string[]
  walkMinutes: string
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
  googleRating?: number
  googleRatingCount?: number
  // Passed to Gemini for station/price selection logic; not rendered directly
  stationName?: string
  budgetCode?: string
  walkMinutes?: number | null
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

// --- Types (continued) ---
type SavedEvent = {
  id: string
  name: string
  eventType: string
  createdAt: number
  /** Phase reached by this event */
  status?: 'date_pending' | 'store_pending' | 'store_confirmed'
  /** Date ID confirmed by the organizer (set when status becomes store_pending) */
  confirmedDateId?: string
}

// --- Constants ---
const EVENT_TYPES: EventType[] = ['歓迎会', '送別会', '普通の飲み会', '少人数ごはん', '会食']
const AREA_OPTIONS = ['渋谷', '新宿', '池袋', '東京', '品川', '横浜']

// Hot Pepper ジャンル準拠のラベル（UI表示用）
const HP_GENRE_OPTIONS = [
  '居酒屋',
  '和食',
  '洋食',
  'イタリアン・フレンチ',
  '中華',
  '焼肉・ホルモン',
  '焼き鳥',
  '韓国料理',
  'カフェ・スイーツ',
  'バー・ダイニングバー',
  'アジア・エスニック',
]

// UIラベル → Hot Pepper 予算コードの変換マップ（Gemini 選定ルールに渡すため）
const BUDGET_CODE_MAP: Record<string, string> = {
  '3,000円以下':     'B005',
  '3,001〜4,000円': 'B006',
  '4,001〜5,000円': 'B007',
  '5,001〜7,000円': 'B008',
  '7,001〜10,000円': 'B009',
}

/**
 * Google Places enrich 対象件数。
 * Gemini が選んだ上位 N 件だけを enrich する（全候補に叩かない）。
 * 3 / 4 / 5 / 6 と後から数字を変えるだけで調整できる。
 */
const PLACES_ENRICH_LIMIT = 5

// UIラベル → Hot Pepper ジャンルコードの変換マップ（クライアント側で解決し、ラベル変更に引きずられないようにする）
const GENRE_CODE_MAP: Record<string, string> = {
  '居酒屋': 'G001',
  '和食': 'G004',
  '洋食': 'G005',
  'イタリアン・フレンチ': 'G006',
  '中華': 'G007',
  '焼肉・ホルモン': 'G008',
  '焼き鳥': 'G001',
  '韓国料理': 'G017',
  'カフェ・スイーツ': 'G014',
  'バー・ダイニングバー': 'G012',
  'アジア・エスニック': 'G009',
}

// Hot Pepper budget code に対応する予算帯
const HP_BUDGET_OPTIONS = [
  '3,000円以下',      // B005: 2001〜3000円
  '3,001〜4,000円',  // B006
  '4,001〜5,000円',  // B007
  '5,001〜7,000円',  // B008
  '7,001〜10,000円', // B009
  '指定なし',
]
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
      if (!genre.startsWith('atm:') && !genre.startsWith('pref:') && !genre.startsWith('drink:')) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1)
      }
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
  orgPrefs?: OrganizerPrefs
  eventType?: string
  mainGuestCount?: number
}) {
  const { store, organizerConditions, orgPrefs, eventType = '', mainGuestCount = 0 } = params

  const storeTags = store.tags ?? []
  const area = orgPrefs?.areas[0]
  const genre = orgPrefs?.genres?.find(g => g !== 'なんでもいい')
  const priceRange = orgPrefs?.priceRange && orgPrefs.priceRange !== '指定なし' ? orgPrefs.priceRange : null
  const hasPrivateRoom = orgPrefs?.privateRoom === '個室あり' && storeTags.includes('個室あり')
  const hasFreeDrink = orgPrefs?.allYouCanDrink === '希望' && storeTags.some(t => t.includes('飲み放題'))
  const formalTypes = ['会食', '歓迎会', '送別会']
  const isFormal = eventType && formalTypes.includes(eventType)
  const hasVip = mainGuestCount > 0

  // Natural sentence templates — most specific first
  if (hasVip && hasPrivateRoom && area) {
    return `${area}周辺にあり、個室で主賓を囲んでゆっくり話しやすい候補です`
  }
  if (hasVip && area && genre) {
    return `${area}周辺の${genre}で、主賓の都合を優先して選んだ候補です`
  }
  if (hasVip && area) {
    return `${area}周辺で集まりやすく、主賓の都合を考慮した候補です`
  }
  if (hasPrivateRoom && hasFreeDrink && area) {
    return `${area}周辺で、個室ありかつ飲み放題で過ごしやすい候補です`
  }
  if (hasPrivateRoom && area && genre) {
    return `${area}周辺の${genre}で、個室ありで落ち着いて話せる候補です`
  }
  if (hasPrivateRoom && area) {
    return `${area}周辺にあり、個室でゆっくり過ごしやすい候補です`
  }
  if (hasFreeDrink && area && genre) {
    return `${area}周辺の${genre}で、飲み放題ありで会費もまとめやすい候補です`
  }
  if (hasFreeDrink && area) {
    return `${area}周辺にあり、飲み放題ありで会費を合わせやすい候補です`
  }
  if (isFormal && hasPrivateRoom) {
    return `個室ありで、${eventType}の席として落ち着いて使いやすい候補です`
  }
  if (isFormal && area) {
    return `${area}周辺にあり、${eventType}の席として使いやすい候補です`
  }
  if (genre && area && priceRange) {
    return `${area}周辺の${genre}で、${priceRange}の価格帯にも合わせやすい候補です`
  }
  if (genre && area) {
    return `${area}周辺で${genre}が楽しめる、参加者の希望に寄せた候補です`
  }
  if (area && priceRange) {
    return `${area}周辺にあり、${priceRange}の価格帯で会費をまとめやすい候補です`
  }
  if (area) {
    return `${area}周辺で集まりやすく、条件のバランスがよい候補です`
  }
  if (genre) {
    return `参加者希望の${genre}ジャンルに合わせた候補です`
  }
  if (organizerConditions.length > 0) {
    return `${organizerConditions.slice(0, 2).join('・')}の条件に合う候補です`
  }
  return '条件のバランスがよい候補です'
}

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

const FLOW_STEPS: Step[] = [
  'create',
  'shareLink',
  'dashboard',
  'dateConfirmed',
  'organizerConditions',
  'storeSuggestion',
  'finalConfirm',
  'shared',
]

// --- Date helpers ---
function weekdayLabel(d: Date, time = '19:00'): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${m}/${day}（${dow}）${time}`
}

function getNextWeekMonday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay()
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysUntilMonday)
  return monday
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateWeekdays(from: Date, to: Date): DateOption[] {
  const result: DateOption[] = []
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      result.push({ id: `wd-${dateKey(new Date(d))}`, label: weekdayLabel(new Date(d)) })
    }
    d.setDate(d.getDate() + 1)
  }
  return result
}

// --- Main Component ---
export default function Page() {
  const [step, setStep] = useState<Step>('home')
  const [eventType, setEventType] = useState<EventType>('歓迎会')
  const [eventName, setEventName] = useState('歓迎会')

  const [dateInput, setDateInput] = useState('')
  const [generatedDates, setGeneratedDates] = useState<DateOption[]>([])
  const [selectedDateIds, setSelectedDateIds] = useState<string[]>([])

  const [showAltDates, setShowAltDates] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [calViewMonth, setCalViewMonth] = useState<Date>(new Date())

  const [selectedHour, setSelectedHour] = useState('19')
  const [selectedMinute, setSelectedMinute] = useState('00')

  const [dates, setDates] = useState<DateOption[]>(INITIAL_DATES)
  const [participants] = useState<Participant[]>(MOCK_PARTICIPANTS)
  const [mainGuestIds, setMainGuestIds] = useState<string[]>([])
  const [showHeroParticipants, setShowHeroParticipants] = useState(false)
  const [showFinalParticipants, setShowFinalParticipants] = useState(false)


  

  const [showAltStores, setShowAltStores] = useState(false)

  const [orgPrefs, setOrgPrefs] = useState<OrganizerPrefs>({
    priceRange: '4,001〜5,000円',
    genres: [],
    drinks: [],
    privateRoom: '',
    allYouCanDrink: '',
    smoking: '',
    areas: [],
    atmosphere: [],
    walkMinutes: '15分以内',
  })
  const [showAdvancedPrefs, setShowAdvancedPrefs] = useState(false)

  const orgPrefsInitRef = useRef(false)
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
  const [storeFetchError, setStoreFetchError] = useState('')
  /** Condition-relaxation notes from Gemini (e.g. walk expanded, price widened) */
  const [storeSelectNotes, setStoreSelectNotes] = useState<string[]>([])
  /** True when Google Places returned fallback (quota / unavailable). Ratings are hidden; candidates still shown. */
  const [placesFallback, setPlacesFallback] = useState(false)
  const [eventDetail, setEventDetail] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  const stepHistoryRef = useRef<Step[]>(['home'])
  const isHandlingBackRef = useRef(false)

  const openLineShare = (text: string) => {
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const [reminderCopied, setReminderCopied] = useState(false)
  const [urlOnly, setUrlOnly] = useState(false)
  const [urlOnlyInvite, setUrlOnlyInvite] = useState(false)
  const [urlOnlyReminder, setUrlOnlyReminder] = useState(false)
  const [dateShareTab, setDateShareTab] = useState<'yes' | 'maybe'>('yes')
  const [stationCommitted, setStationCommitted] = useState(true)
  const [stationError, setStationError] = useState('')
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([])
  const [dateCopied, setDateCopied] = useState(false)
  const [maybeCopied, setMaybeCopied] = useState(false)
  const [heroBestDateId, setHeroBestDateId] = useState<string | null>(null)

  const selectedTime = `${selectedHour}:${selectedMinute}`


　
  
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
    const value = rawAnswers?.[date.id] ?? rawAnswers?.[legacyKey]

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

useEffect(() => {
  if (step === 'create' && generatedDates.length === 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = new Date(today)
    cutoff.setDate(today.getDate() + 3)
    const monday = getNextWeekMonday()
    const twoWeeksEnd = new Date(monday)
    twoWeeksEnd.setDate(monday.getDate() + 13)
    const weekdays = generateWeekdays(monday, twoWeeksEnd).filter(d => {
      const key = d.id.replace('wd-', '')
      return key >= dateKey(cutoff)
    })
    setGeneratedDates(weekdays)
    setSelectedDateIds(weekdays.map(d => d.id))
  }
}, [step, generatedDates.length])

// Update date labels when selectedTime changes
useEffect(() => {
  if (generatedDates.length === 0) return
  setGeneratedDates(prev => prev.map(d => ({
    ...d,
    label: d.label.replace(/\s*\d{1,2}:\d{2}$/, '') + ' ' + selectedTime,
  })))
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedTime])

  const activeDates = useMemo(() => {
  if (dbDates.length === 0) return dates
  return dbDates.map((d: any) => ({
    id: d.id,
    label: d.label,
  }))
}, [dbDates, dates])

const selectedStore: StoreCandidate | null =
  recommendedStores.find((s: StoreCandidate) => s.id === selectedStoreId) ?? null




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

const finalDateId = finalDecision?.selected_date_id ?? null

const finalYesParticipants =
  finalDateId
    ? activeParticipants.filter((p) => p.availability?.[finalDateId] === 'yes')
    : []

const finalMaybeParticipants =
  finalDateId
    ? activeParticipants.filter((p) => p.availability?.[finalDateId] === 'maybe')
    : []

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

    const mgBonuses = mainGuestIds.map(mgId => {
      const mg = activeParticipants.find(p => p.id === mgId)
      const mga = mg?.availability?.[date.id]
      return mga === 'yes' ? 3 : mga === 'maybe' ? 1 : 0
    })
    const bonus = mgBonuses.reduce((s: number, b: number) => s + b, 0)

    // summarize main guest availability: 'yes' if all yes, 'maybe' if any maybe, 'no' if any no, undefined if none selected
    const mgAvails = mainGuestIds.map(mgId => {
      const mg = activeParticipants.find(p => p.id === mgId)
      return mg?.availability?.[date.id]
    }).filter(Boolean) as Availability[]
    const mga: Availability | undefined = mgAvails.length === 0 ? undefined
      : mgAvails.every(a => a === 'yes') ? 'yes'
      : mgAvails.some(a => a === 'no') ? 'no'
      : 'maybe'

    return {
      date,
      score: totalScore + bonus,
      availableCount,
      mainGuestAvailability: mga,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}, [activeDates, activeParticipants, mainGuestIds])



const heroDate = useMemo(() => {
  if (heroBestDateId) {
    const d = activeDates.find(d => d.id === heroBestDateId)
    if (d) return d
  }
  return recommendedDate?.date ?? null
}, [heroBestDateId, activeDates, recommendedDate])

const heroYesCount = heroDate
  ? activeParticipants.filter(p => p.availability?.[heroDate.id] === 'yes').length
  : 0

const heroYesParticipants = heroDate
  ? activeParticipants.filter((p) => p.availability?.[heroDate.id] === 'yes')
  : []

const heroMaybeParticipants = heroDate
  ? activeParticipants.filter((p) => p.availability?.[heroDate.id] === 'maybe')
  : []

  const selectedMainGuests = activeParticipants.filter((p) => mainGuestIds.includes(p.id))

const heroMaybeCount = heroDate
  ? activeParticipants.filter(p => p.availability?.[heroDate.id] === 'maybe').length
  : 0

const confirmedYesParticipants = heroDate
  ? activeParticipants.filter((p) => p.availability?.[heroDate.id] === 'yes')
  : []

const maybeParticipants = heroDate
  ? activeParticipants.filter((p) => p.availability?.[heroDate.id] === 'maybe')
  : []

const yesCount = confirmedYesParticipants.length
const maybeCount = maybeParticipants.length
const maybeNames = maybeParticipants.map((p) => p.name)

const altDates = useMemo(
  () => activeDates.filter(d => d.id !== heroDate?.id),
  [activeDates, heroDate]
)
const totalCount = yesCount + maybeCount
const participantMajority = useMemo(() => {
  const total = activeParticipants.length
  if (total === 0) return null
  const genreCounts = new Map<string, number>()
  const atmCounts = new Map<string, number>()
  let privateRoomCount = 0
  let allYouCanDrinkCount = 0
  const drinkCounts = new Map<string, number>()
  activeParticipants.forEach(p => {
    ;(p.genres ?? []).forEach((g: string) => {
      if (g.startsWith('atm:')) {
        const atm = g.slice(4)
        atmCounts.set(atm, (atmCounts.get(atm) ?? 0) + 1)
      } else if (g === 'pref:個室') {
        privateRoomCount++
      } else if (g === 'pref:飲み放題') {
        allYouCanDrinkCount++
      } else if (g.startsWith('drink:')) {
        const drink = g.slice(6)
        drinkCounts.set(drink, (drinkCounts.get(drink) ?? 0) + 1)
      } else {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
      }
    })
  })
  const half = total / 2
  return {
    genres: [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g),
    atmosphere: [...atmCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([a]) => a)
      .slice(0, 2),
    privateRoom: privateRoomCount > half ? '必要' : 'どちらでも',
    allYouCanDrink: allYouCanDrinkCount > half ? '希望' : 'どちらでも',
    drinks: [...drinkCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d)
      .slice(0, 2),
    areas: getTopAreas(activeParticipants).slice(0, 2),
  }
}, [activeParticipants])

const genreRanking = useMemo(() => {
  const counts = new Map<string, number>()
  activeParticipants.forEach(p => {
    ;(p.genres ?? []).forEach((g: string) => {
      if (!g.startsWith('atm:') && !g.startsWith('pref:') && !g.startsWith('drink:') && g !== 'なんでもいい') {
        counts.set(g, (counts.get(g) ?? 0) + 1)
      }
    })
  })
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre, count]) => ({ genre, count }))
}, [activeParticipants])

const organizerConditions = useMemo(() => {
  const c: string[] = []
  if (orgPrefs.privateRoom === '個室あり') c.push('個室あり')
  if (orgPrefs.smoking === '禁煙希望') c.push('禁煙希望')
  if (orgPrefs.smoking === '喫煙可') c.push('喫煙可がよい')
  if (orgPrefs.atmosphere.includes('落ち着き')) c.push('静かめ')
  orgPrefs.genres.forEach(g => c.push(g))
  orgPrefs.areas.forEach(a => c.push(a))
  if (orgPrefs.allYouCanDrink === '希望') c.push('飲み放題希望')
  return c
}, [orgPrefs])

useEffect(() => {
  if (step === 'organizerConditions' && participantMajority && !orgPrefsInitRef.current) {
    orgPrefsInitRef.current = true
    setOrgPrefs(p => ({
      ...p,
      genres: participantMajority.genres.length
        ? [participantMajority.genres.find(g => g !== 'なんでもいい') ?? participantMajority.genres[0]]
        : p.genres,
      atmosphere: participantMajority.atmosphere.length ? participantMajority.atmosphere : p.atmosphere,
      privateRoom: participantMajority.privateRoom === '必要' ? '個室あり' : p.privateRoom,
      allYouCanDrink: participantMajority.allYouCanDrink === '希望' ? '希望' : p.allYouCanDrink,
      drinks: participantMajority.drinks.length ? participantMajority.drinks : p.drinks,
      areas: participantMajority.areas.length ? participantMajority.areas : p.areas,
    }))
  }
}, [step, participantMajority])

useEffect(() => {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('kanji_events')
    if (raw) setSavedEvents(JSON.parse(raw))
  } catch {}
}, [])

useEffect(() => {
  const pool = recommendedStores.length > 0 ? recommendedStores : MOCK_STORES
  if (pool.length > 0) setSelectedStoreId(pool[0].id)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [recommendedStores])

const storePool = recommendedStores




  
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
      orgPrefs,
      eventType,
      mainGuestCount: mainGuestIds.length,
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
const secondaryStores = alternativeStores.slice(0, 4)



function buildSubStoreReason(store: StoreCandidate) {
const areaHit = activeParticipants.some((p) =>
  (p.area ?? []).some((a: string) =>  (store.area ?? '').includes(a))
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

function persistEvent(id: string, name: string, type: string) {
  const item: SavedEvent = { id, name, eventType: type, createdAt: Date.now(), status: 'date_pending' }

  setSavedEvents((prev) => {
    const filtered = prev.filter((e) => e.id !== id)
    const updated = [item, ...filtered].slice(0, 3)

    try {
      localStorage.setItem('kanji_events', JSON.stringify(updated))
    } catch {}

    return updated
  })
}

function updateEventStatus(
  id: string,
  status: NonNullable<SavedEvent['status']>,
  confirmedDateId?: string
) {
  setSavedEvents(prev => {
    const updated = prev.map(e =>
      e.id === id
        ? { ...e, status, ...(confirmedDateId ? { confirmedDateId } : {}) }
        : e
    )
    try { localStorage.setItem('kanji_events', JSON.stringify(updated)) } catch {}
    return updated
  })
}

async function openSavedEvent(id: string, name: string, type: string) {
  setCreatedEventId(id)
  setEventName(name)
  setEventType(type as EventType)
  setHeroBestDateId(null)
  setRecommendedStores([])
  setFinalDecision(null)
  setMainGuestIds([])
  setShowHeroParticipants(false)
  setShowAltDates(false)

  // Read persisted status from localStorage (set as the event progresses)
  const savedEv = savedEvents.find(e => e.id === id)
  const status = savedEv?.status ?? 'date_pending'
  const confirmedDateId = savedEv?.confirmedDateId ?? null

  try {
    const result = await loadEventData(id)
    setDbDates(result.dates ?? [])
    setDbResponses(result.responses ?? [])

    if (status === 'store_pending' && confirmedDateId) {
      // Date confirmed, store not yet selected
      // → resume at dateConfirmed so the organizer sees the confirmed date and can proceed
      setHeroBestDateId(confirmedDateId)
      setStep('dateConfirmed')

    } else if (status === 'store_confirmed') {
      // Store was already selected in a previous session
      // → resume at finalConfirm with full decision state restored
      try {
        const dr = await loadDecision(id)
        const decision = dr?.decision ?? null
        setFinalDecision(decision)
        setFinalDates(dr?.dates ?? result.dates ?? [])
        setFinalEvent(dr?.event ?? null)
        if (decision?.selected_date_id) setHeroBestDateId(decision.selected_date_id)
        setStep('finalConfirm')
      } catch {
        // loadDecision failed → fall back to dateConfirmed
        if (confirmedDateId) setHeroBestDateId(confirmedDateId)
        setStep('dateConfirmed')
      }

    } else {
      // date_pending or unknown → show dashboard (collect responses)
      setStep('dashboard')
    }
  } catch {
    setStep('dashboard')
  }
}

async function copyShareText() {
    try { await navigator.clipboard.writeText(shareText); alert('コピーしました') }
    catch { alert('コピーに失敗しました') }
  }

async function decideRecommendedDate() {
  if (!heroDate) return

  const currentEventId = createdEventId || finalEvent?.id
  if (!currentEventId) {
    alert('event_id が見つかりません')
    return
  }

  if (totalCount === 0) {
    alert('まだ回答がありません。参加者の回答を待ってから日程を決めてください。')
    return
  }

  if (heroYesCount === 0) {
    alert('参加できる人がいないため、この状態では日程を確定できません。')
    return
  }

  try {
const data = await saveDecision({
  eventId: currentEventId,
  selectedDateId: heroDate.id,
  organizerConditions,
})

    setFinalDecision(data)
    setStep('dateConfirmed')
    // Persist status so openSavedEvent can resume at the right position
    updateEventStatus(currentEventId, 'store_pending', heroDate.id)
  } catch (e: any) {
    alert(`決定保存に失敗しました: ${e?.message ?? 'unknown error'}`)
  }
}

async function fetchRecommendedStores() {
  if (!heroDate) {
    alert('先に日程を確定してください')
    return
  }

  if (!stationCommitted) {
    setStationError('駅名は候補から選択してください')
    return
  }
  setStationError('')

  setIsLoadingStores(true)
  setStoreFetchError('')
  setStoreSelectNotes([])
  setPlacesFallback(false)

  try {
    // ── Step 1: Hot Pepper で候補取得 ────────────────────────────────────────
    const genreCodes = orgPrefs.genres
      .map(g => GENRE_CODE_MAP[g])
      .filter((c): c is string => Boolean(c))

    const hpRes = await fetch('/api/hotpepper/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        areas: orgPrefs.areas,
        priceRange: orgPrefs.priceRange,
        genreCodes,
        privateRoom: orgPrefs.privateRoom,
        allYouCanDrink: orgPrefs.allYouCanDrink,
        walkMinutes: orgPrefs.walkMinutes,
        count: 30,
      }),
    })
    if (!hpRes.ok) throw new Error(`HTTP ${hpRes.status}`)

    const hpData = await hpRes.json()
    console.log('[fetchRecommendedStores] hp:', { mode: hpData.searchMode, count: hpData.stores?.length })

    const hpStores: StoreCandidate[] = (hpData.stores ?? []).map((s: any, i: number) => ({
      id: s.id ?? `hp-store-${i + 1}`,
      name: s.name ?? `候補${i + 1}`,
      area: s.area ?? '未設定',
      access: s.access ?? '',
      image: s.image ?? undefined,
      reason: s.reason ?? '条件に合いやすい候補です',
      link: typeof s.link === 'string' ? s.link : '',
      tags: Array.isArray(s.tags) ? s.tags.slice(0, 4) : [],
      stationName: s.stationName ?? '',
      budgetCode: s.budgetCode ?? '',
      genre: s.genre ?? '',
      walkMinutes: s.walkMinutes ?? null,
    }))

    // ── Step 2: Gemini で選定・順位付け・理由生成 ──────────────────────────
    // Gemini が失敗しても HP 順位で続行するため try-catch で囲む
    let rankedStores = hpStores
    let selectNotes: string[] = []

    if (hpStores.length > 0) {
      try {
        const walkNum = orgPrefs.walkMinutes
          ? parseInt(orgPrefs.walkMinutes.replace('分以内', ''), 10) || null
          : null
        const conditions = {
          targetStation: orgPrefs.areas[0] ?? '',
          maxWalkMinutes: walkNum,
          budgetCode: BUDGET_CODE_MAP[orgPrefs.priceRange] ?? '',
          budgetLabel: orgPrefs.priceRange,
          genre: orgPrefs.genres[0] ?? '',
        }

        const selRes = await fetch('/api/store-select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stores: hpStores, conditions }),
        })

        if (selRes.ok) {
          const selData = await selRes.json()
          const sel = selData.selection
          if (sel?.rankedStoreIds?.length > 0) {
            // Gemini の順位で並び替え
            const byId = new Map(hpStores.map(s => [s.id, s]))
            const reordered = (sel.rankedStoreIds as string[])
              .map(id => byId.get(id))
              .filter((s): s is StoreCandidate => !!s)
            // Gemini が選ばなかった店は末尾に（フォールバック用）
            const selectedIds = new Set(sel.rankedStoreIds as string[])
            const leftover = hpStores.filter(s => !selectedIds.has(s.id))
            rankedStores = [...reordered, ...leftover]

            // Gemini の理由文をマージ
            const reasonMap = Object.fromEntries(
              (sel.reasons ?? []).map((r: any) => [r.storeId, r.reason])
            )
            rankedStores = rankedStores.map(s => ({
              ...s,
              reason: reasonMap[s.id] || s.reason,
            }))

            selectNotes = Array.isArray(sel.fallbackNotes) ? sel.fallbackNotes : []
          }
        }
      } catch {
        // Gemini 失敗 → HP 順位で続行（ログのみ）
        console.warn('[fetchRecommendedStores] Gemini selection failed, using HP order')
      }
    }

    // ── Step 2.5: クライアント側で駅フィルタを再適用 ─────────────────────
    // Gemini が駅条件を守り損ねた場合や leftover に別駅店が混ざる場合の保険。
    // stationName が空文字（HP が駅情報を返さなかった店）は除外しない。
    const targetStation = orgPrefs.areas[0] ?? ''
    if (targetStation) {
      // Pass: exact station match
      // Pass: stationName empty AND access contains "${targetStation}駅" (HP sometimes omits station_name)
      // Fail: stationName non-empty but != targetStation (confirmed different station)
      // Fail: stationName empty AND access doesn't mention targetStation (unknown provenance)
      const stationFiltered = rankedStores.filter(s => {
        if (s.stationName === targetStation) return true
        if (s.stationName && s.stationName !== targetStation) return false
        return (s.access ?? '').includes(`${targetStation}駅`)
      })
      console.log('[fetchRecommendedStores] station filter:', {
        target: targetStation,
        before: rankedStores.length,
        after: stationFiltered.length,
        excluded: rankedStores
          .filter(s => {
            if (s.stationName === targetStation) return false
            if (s.stationName && s.stationName !== targetStation) return true
            return !(s.access ?? '').includes(`${targetStation}駅`)
          })
          .map(s => ({ name: s.name, stationName: s.stationName, access: s.access?.slice(0, 40) })),
      })
      if (stationFiltered.length === 0) {
        // 駅一致候補が0件 → 別駅候補を出さない
        setStoreFetchError('指定駅に近い候補が見つかりませんでした。条件を変えてお試しください。')
        setRecommendedStores([])
        setSelectedStoreId('')
        setStoreSelectNotes([])
        setStep('storeSuggestion')
        return
      }
      rankedStores = stationFiltered
    }

    // ── Step 3: 表示件数を絞る（Best + 他 4件 = 最大 5件）────────────────
    const displayStores = rankedStores.slice(0, PLACES_ENRICH_LIMIT)

    // ── Step 4: Google Places enrich（最終表示候補のみ / 上限 PLACES_ENRICH_LIMIT 件）
    // ルール:
    //   displayStores.length <= PLACES_ENRICH_LIMIT → 全件 enrich
    //   displayStores.length >  PLACES_ENRICH_LIMIT → 上位 PLACES_ENRICH_LIMIT 件のみ
    // displayStores は既に slice(0, PLACES_ENRICH_LIMIT) 済みなので常に上限内に収まる。
    // 1 フローで 1 回のみ呼び出し。失敗・quota 超過時は評価なしで続行（アプリは止めない）。
    let enrichedMap = new Map<string, { rating: number; userRatingCount: number }>()
    try {
      const enrichRes = await fetch('/api/places/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stores: displayStores.map(s => ({ id: s.id, name: s.name, area: s.area, access: s.access })),
        }),
      })
      if (enrichRes.ok) {
        const enrichData = await enrichRes.json()
        // fallback: true = quota 到達 / API 不可 → 評価ラベルを非表示にする
        if (enrichData.fallback) {
          setPlacesFallback(true)
          console.warn('[fetchRecommendedStores] Places fallback:', enrichData.reason)
        }
        ;(enrichData.enriched ?? []).forEach((e: any) => {
          if (e.id && e.rating) enrichedMap.set(e.id, { rating: e.rating, userRatingCount: e.userRatingCount ?? 0 })
        })
      }
    } catch {
      // ネットワーク例外 → 評価なしで続行（再試行しない）
    }

    // ── Step 5: Google 評価を反映して最終並び替え ─────────────────────────
    // Best（Gemini の 1位）は固定。2位以降を Google スコアで微調整。
    const withRatings: StoreCandidate[] = displayStores.map(s => ({
      ...s,
      googleRating: enrichedMap.get(s.id)?.rating,
      googleRatingCount: enrichedMap.get(s.id)?.userRatingCount,
    }))

    function googleScore(s: StoreCandidate): number {
      if (!s.googleRating || !s.googleRatingCount) return 0
      return Math.min(s.googleRating * Math.log10(Math.max(s.googleRatingCount, 1)) * 1.5, 10)
    }

    const [gemBest, ...gemRest] = withRatings
    const restRanked = gemRest
      .map((s, i) => ({ store: s, score: (gemRest.length - i) * 2 + googleScore(s) }))
      .sort((a, b) => b.score - a.score)
      .map(({ store }) => store)
    const [second, ...rest] = restRanked
    const shuffled = [...rest].sort(() => Math.random() - 0.5)
    const finalStores = [gemBest, second, ...shuffled].filter((s): s is StoreCandidate => !!s)

    setRecommendedStores(finalStores)
    setSelectedStoreId(finalStores[0]?.id ?? '')
    setStoreSelectNotes(selectNotes)

    if (hpData?.fallback) {
      setStoreFetchError(hpData?.error ?? '条件に合う店が見つからなかったため、参考候補を表示しています。')
    } else {
      setStoreFetchError('')
    }

    setStep('storeSuggestion')
  } catch (e: any) {
    console.error(e)
    setStoreFetchError(
      e?.message ?? 'お店候補の取得に失敗しました。条件を変えてもう一度お試しください。'
    )
    setRecommendedStores([])
    setSelectedStoreId('')
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
    // Persist status so openSavedEvent can resume at finalConfirm next time
    updateEventStatus(currentEventId, 'store_confirmed')
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

const shareMessage = `${eventName || '会'}の日程調整をお願いします！
以下のリンクから回答してください🙏



${shareUrl}`

const reminderText = `まだの方だけ、回答お願いします🙏
1分くらいで終わります！

${shareUrl}`

const dateConfirmedShareText =
  heroDate
    ? `日程はこちらで決まりました！\n詳細はまた連絡します🙏\n\n日程：${heroDate.label}`
    : ''

const maybeConfirmText =
  heroDate && maybeNames.length > 0
    ? `この日で進めようと思っています！\n問題なさそうなら、この日程で確定したいです🙏\n\n日程：${heroDate.label}`
    : ''



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

            {/* 進行中の会 — リスト or 空状態 */}
            <section>
              <SectionLabel>進行中の会</SectionLabel>
              {savedEvents.length > 0 ? (
                <div className="mt-2.5 space-y-2">
                  {savedEvents.map(ev => (
                    <button
                      type="button"
                      key={ev.id}
                      onClick={() => openSavedEvent(ev.id, ev.name, ev.eventType)}
                      className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-sm ring-1 ring-stone-100 transition hover:shadow-md active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-black tracking-tight text-stone-900">{ev.name}</p>
                        <p className="mt-0.5 text-xs text-stone-400">{ev.eventType}</p>
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        {(() => {
                          const s = ev.status ?? 'date_pending'
                          const cfg =
                            s === 'store_confirmed'
                              ? { label: 'お店決定済み', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' }
                              : s === 'store_pending'
                              ? { label: 'お店未確定', cls: 'bg-sky-50 text-sky-600 ring-sky-200' }
                              : { label: '日程未確定', cls: 'bg-amber-50 text-amber-600 ring-amber-200' }
                          return (
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          )
                        })()}
                        <span className="text-xs font-bold text-stone-400">開く →</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2.5 rounded-3xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-stone-100">
                  <p className="text-sm font-bold text-stone-400">進行中の会がまだありません</p>
                  <p className="mt-1.5 text-xs leading-5 text-stone-400">
                    右下の ＋ ボタンから、新しい会を作れます
                  </p>
                </div>
              )}
            </section>

          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ② 会を作る（会の基本情報 + 候補日選択 を1画面に統合）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {(step === 'create' || step === 'dates') && (
          <Card>
            <StepLabel n={1} />
            <CardTitle>会を作る</CardTitle>

            {/* 会の基本情報 */}
            <FieldLabel>会の種類</FieldLabel>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {EVENT_TYPES.map(t => (
                <Chip key={t} active={eventType === t} onClick={() => { setEventType(t); setEventName(t) }}>
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

            {/* 候補日選択 */}
            <div className="mt-6 border-t border-stone-100 pt-5">
              <FieldLabel>候補日を選ぶ</FieldLabel>

              <div className="mt-3 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
                <p className="text-xs font-bold text-stone-600">開始時間</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold text-stone-400">時</span>
                    <select
                      value={selectedHour}
                      onChange={(e) => setSelectedHour(e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm font-bold text-stone-700 outline-none transition focus:border-stone-400"
                    >
                      {['17', '18', '19', '20', '21', '22', '23'].map((hour) => (
                        <option key={hour} value={hour}>{hour}時</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold text-stone-400">分</span>
                    <select
                      value={selectedMinute}
                      onChange={(e) => setSelectedMinute(e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm font-bold text-stone-700 outline-none transition focus:border-stone-400"
                    >
                      {['00', '15', '30', '45'].map((minute) => (
                        <option key={minute} value={minute}>{minute}分</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-stone-500">カレンダーから候補日を選ぶ</p>
                  <button type="button" onClick={() => setSelectedDateIds([])}
                    className="text-xs font-bold text-stone-500 underline underline-offset-2">
                    すべて外す
                  </button>
                </div>

                <CalendarPicker
                  viewMonth={calViewMonth}
                  onChangeMonth={setCalViewMonth}
                  selectedIds={selectedDateIds}
                  disabledBefore={(() => {
                    const t = new Date()
                    t.setHours(0, 0, 0, 0)
                    const c = new Date(t)
                    c.setDate(t.getDate() + 3)
                    return dateKey(c)
                  })()}
                  onDayClick={(key) => {
                    const id = `wd-${key}`
                    const existing = generatedDates.find((d) => d.id === id)
                    if (existing) {
                      setSelectedDateIds((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                      )
                    } else {
                      const [y, mo, dy] = key.split('-').map(Number)
                      const d = new Date(y, mo - 1, dy)
                      const newDate = { id, label: weekdayLabel(d, selectedTime) }
                      setGeneratedDates((prev) => [...prev, newDate].sort((a, b) => (a.id < b.id ? -1 : 1)))
                      setSelectedDateIds((prev) => [...prev, id])
                    }
                  }}
                />
              </div>

              <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
                <p className="text-xs font-bold text-stone-500">選択中 {selectedDateIds.length}件</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {generatedDates
                    .filter((d) => selectedDateIds.includes(d.id))
                    .sort((a, b) => (a.id < b.id ? -1 : 1))
                    .map((d) => (
                      <span key={d.id} className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-bold text-white">
                        {d.label}
                      </span>
                    ))}
                  {selectedDateIds.length === 0 && (
                    <span className="text-sm text-stone-400">候補日がまだ選ばれていません</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <PrimaryBtn
                size="large"
                disabled={selectedDateIds.length === 0}
                onClick={async () => {
                  const selectedDates = generatedDates
                    .filter((d) => selectedDateIds.includes(d.id))
                    .map((d) => {
                      const base = d.id.replace('wd-', '')
                      const [y, mo, dy] = base.split('-').map(Number)
                      const date = new Date(y, mo - 1, dy)
                      return { ...d, label: weekdayLabel(date, selectedTime) }
                    })
                    .sort((a, b) => (a.id < b.id ? -1 : 1))

                  setDates(selectedDates)
                  setGeneratedDates(selectedDates)

                  const eventId = await createEvent(
                    eventName,
                    eventType,
                    selectedDates.map((d) => d.label)
                  )
                  setCreatedEventId(eventId)
                  persistEvent(eventId, eventName, eventType)
                  setStep('shareLink')
                }}
              >
                {selectedDateIds.length === 0 ? '候補日を選んでください' : `この${selectedDateIds.length}件で作成`}
              </PrimaryBtn>
              <GhostBtn onClick={() => setStep('home')}>← 戻る</GhostBtn>
            </div>
          </Card>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            参加者に送る
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        
        
        
{step === 'shareLink' && (
  <Card>
    <StepLabel n={3} />
    <CardTitle>参加者に送る</CardTitle>

    <div className="space-y-4">
      <div className="rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">
            この内容を送ります
          </p>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={urlOnlyInvite}
              onChange={e => setUrlOnlyInvite(e.target.checked)}
              className="h-3.5 w-3.5 accent-stone-900"
            />
            <span className="text-[11px] font-bold text-stone-500">URLのみ</span>
          </label>
        </div>
        <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-stone-100">
          <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">
            {urlOnlyInvite ? shareUrl : shareMessage}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(urlOnlyInvite ? shareUrl : shareMessage)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
        >
          {copied ? 'コピーしました' : '全文をコピー'}
        </button>

        <button
          type="button"
          onClick={() => openLineShare(urlOnlyInvite ? shareUrl : shareMessage)}
          className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
        >
          LINEで送る
        </button>
      </div>

      <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
        <p className="text-sm leading-6 text-amber-800">
          回答が集まったら、おすすめ日程からすぐ決められます。
        </p>
      </div>
<PrimaryBtn
  size="large"
  onClick={async () => {
    if (!createdEventId) {
      setStep('dashboard')
      return
    }

    try {
      const result = await loadEventData(createdEventId)
      setDbDates(result.dates ?? [])
      setDbResponses(result.responses ?? [])
    } catch (e) {
      console.error('回答状況の再取得に失敗:', e)
    }

    setStep('dashboard')
  }}
>
  回答状況を見る
</PrimaryBtn>

      <GhostBtn onClick={() => setStep('dates')}>← 戻る</GhostBtn>
    </div>
  </Card>
)}



        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑤ ダッシュボード
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'dashboard' && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 6</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">日程を決める</h2>
    </div>

    {totalCount === 0 || !heroDate ? (
      <div className="rounded-3xl bg-white px-6 py-7 shadow-sm ring-1 ring-stone-100">
        <p className="text-base font-black text-stone-900">回答がまだありません</p>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          リンクを送って回答を集めましょう。
        </p>
        <div className="mt-5">
          <PrimaryBtn size="large" onClick={() => setStep('shareLink')}>
            参加者に送る
          </PrimaryBtn>
        </div>
      </div>
    ) : (
      <>
        {/* 優先したい人 — ヒーロー表示より先に選ぶ */}
        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
            優先したい人（任意）
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeParticipants.map((participant) => {
              const selected = mainGuestIds.includes(participant.id)
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() =>
                    setMainGuestIds((prev) =>
                      prev.includes(participant.id)
                        ? prev.filter((id) => id !== participant.id)
                        : [...prev, participant.id]
                    )
                  }
                  className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${
                    selected
                      ? 'bg-stone-900 text-white ring-stone-900'
                      : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {participant.name}
                </button>
              )
            })}
          </div>
          {mainGuestIds.length > 0 && (
            <p className="mt-4 text-xs font-bold text-stone-500">
              選択中：
              <span className="ml-1 text-stone-800">
                {activeParticipants
                  .filter((p) => mainGuestIds.includes(p.id))
                  .map((p) => p.name)
                  .join('、')}
              </span>
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl bg-stone-900">
          <div className="px-6 py-5">
 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
  おすすめ日程
</p>
<p className="mt-1 text-3xl font-black text-white">
  {heroDate?.label}
</p>

<p className="mt-2 text-sm font-bold text-white/70">
  最大参加人数 {yesCount + maybeCount}人
</p>

<div className="mt-3 flex flex-wrap gap-2 bg-white/[0.06] px-6 py-4">
  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
    参加予定 {yesCount}人
  </span>

  <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
    調整中 {maybeCount}人
  </span>

  {eventType && (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
      {eventType}
    </span>
  )}
</div>

<button
  type="button"
  onClick={() => setShowHeroParticipants((v) => !v)}
  className="mt-3 text-xs font-bold text-white/70 underline"
>
  {showHeroParticipants ? '参加者を閉じる' : '参加者を見る'}
</button>

{showHeroParticipants && (
  <div className="mt-4 space-y-3">
    <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/80">
        参加予定
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
{finalYesParticipants.length > 0 ? (
  finalYesParticipants.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20"
            >
              {p.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-white/40">まだいません</span>
        )}
      </div>
    </div>

    <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">
        調整中
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {heroMaybeParticipants.length > 0 ? (
          heroMaybeParticipants.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20"
            >
              {p.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-white/40">まだいません</span>
        )}
      </div>
    </div>
  </div>
)}
          </div>

          <div className="px-6 pb-5">
            <button
              type="button"
              onClick={decideRecommendedDate}
              className="w-full rounded-2xl bg-white px-4 py-3.5 text-base font-black text-stone-900 transition hover:bg-stone-100 active:scale-[0.98]"
            >
              この日で決定
            </button>
          </div>
        </div>

        {altDates.length > 0 && (
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
            <button
              type="button"
              onClick={() => setShowAltDates((v) => !v)}
              className="w-full text-center text-sm font-bold text-stone-500 underline underline-offset-2 transition hover:text-stone-800"
            >
              {showAltDates ? 'ほかの日程を閉じる' : `ほかの日程を見る（${Math.min(altDates.length, 3)}件）`}
            </button>

            {showAltDates && (
              <div className="mt-4 space-y-2">
                {altDates.slice(0, 3).map((d) => {
                  const dYes = activeParticipants.filter((p) => p.availability?.[d.id] === 'yes').length
                  const dMaybe = activeParticipants.filter((p) => p.availability?.[d.id] === 'maybe').length

                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => {
                        setHeroBestDateId(d.id)
                        setShowAltDates(false)
                        setShowHeroParticipants(false)
                      }}
                      className="flex w-full items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 text-left ring-1 ring-stone-100 transition hover:bg-stone-100 active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900">{d.label}</p>
                      </div>

                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600 ring-1 ring-emerald-100">
                          {dYes}人
                        </span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600 ring-1 ring-amber-100">
                          {dMaybe}人
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}


        {/* 未回答者へのリマインド */}
        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">未回答者へのリマインド</p>
          <div className="mt-3 rounded-2xl bg-stone-50 px-4 py-4">
            <p className="whitespace-pre-line text-sm leading-6 text-stone-700">
              {urlOnlyReminder ? shareUrl : reminderText}
            </p>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 self-start">
            <input
              type="checkbox"
              checked={urlOnlyReminder}
              onChange={(e) => setUrlOnlyReminder(e.target.checked)}
              className="h-4 w-4 rounded accent-stone-900"
            />
            <span className="text-xs font-bold text-stone-500">URLのみ</span>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(urlOnlyReminder ? shareUrl : reminderText)
                setReminderCopied(true)
                setTimeout(() => setReminderCopied(false), 1600)
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
            >
              {reminderCopied ? 'コピーしました ✓' : 'コピー'}
            </button>
            <button
              type="button"
              onClick={() => openLineShare(urlOnlyReminder ? shareUrl : reminderText)}
              className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              LINEで送る
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
            回答テーブル
          </p>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[760px]">
              <div
                className="grid items-center gap-2 text-xs font-bold text-stone-500"
                style={{ gridTemplateColumns: `92px repeat(${activeDates.length}, minmax(72px, 1fr))` }}
              >
                <div>参加者</div>
                {activeDates.map((date) => (
                  <div
                    key={date.id}
                    className={date.id === heroDate.id ? 'text-stone-900' : ''}
                  >
                    {date.label}
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2">
                {activeParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    className="grid items-center gap-2"
                    style={{ gridTemplateColumns: `92px repeat(${activeDates.length}, minmax(72px, 1fr))` }}
                  >
                    <div className="truncate text-sm font-bold text-stone-900">
                      {participant.name}
                    </div>

                    {activeDates.map((date) => {
                      const value = participant.availability?.[date.id]
                      const isHero = date.id === heroDate.id

                      return (
                        <div
                          key={date.id}
                          className={`flex h-9 items-center justify-center rounded-xl text-sm font-bold ring-1 ${
                            isHero ? 'bg-stone-50 ring-stone-200' : 'bg-white ring-stone-100'
                          } ${
                            value === 'yes'
                              ? 'text-emerald-600'
                              : value === 'maybe'
                              ? 'text-amber-500'
                              : 'text-stone-300'
                          }`}
                        >
                          {value === 'yes' ? '○' : value === 'maybe' ? '△' : value === 'no' ? '×' : '—'}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
</>
)}
</div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑥ 日程提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}




        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑦ 日程確定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'dateConfirmed' && heroDate && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 6</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">日程確定</h2>
    </div>

    {/* 確定日程 ヒーロー */}
    <div className="overflow-hidden rounded-3xl bg-stone-900">
      <div className="px-6 py-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">確定日程</p>
        <p className="mt-1 text-3xl font-black text-white">{heroDate?.label}</p>
        <p className="mt-2 text-sm font-bold text-white/70">最大参加人数 {yesCount + maybeCount}人</p>
        <button
          type="button"
          onClick={() => setShowHeroParticipants((v) => !v)}
          className="mt-3 text-xs font-bold text-white/70 underline"
        >
          {showHeroParticipants ? '参加者を閉じる' : '参加者を見る'}
        </button>
        {showHeroParticipants && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/80">参加予定</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {finalYesParticipants.length > 0 ? (
                  finalYesParticipants.map((p) => (
                    <span key={p.id} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                      {p.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/40">まだいません</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">調整中</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {heroMaybeParticipants.length > 0 ? (
                  heroMaybeParticipants.map((p) => (
                    <span key={p.id} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
                      {p.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/40">まだいません</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 bg-white/[0.06] px-6 py-4">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
          参加予定 {yesCount}人
        </span>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
          調整中 {maybeCount}人
        </span>
        {eventType && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
            {eventType}
          </span>
        )}
      </div>
    </div>

    {/* 参加者への連絡 — タブ切り替え */}
    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
      <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">参加者への連絡</p>

      {/* タブ */}
      <div className="flex gap-1 rounded-2xl bg-stone-100 p-1">
        <button
          type="button"
          onClick={() => setDateShareTab('yes')}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${dateShareTab === 'yes' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
        >
          参加予定の方へ
        </button>
        <button
          type="button"
          onClick={() => setDateShareTab('maybe')}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${dateShareTab === 'maybe' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
        >
          調整中の方へ
          {maybeCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-white">
              {maybeCount}
            </span>
          )}
        </button>
      </div>

      {dateShareTab === 'yes' && (
        <div className="mt-4">
          <div className="rounded-2xl bg-stone-50 px-4 py-4">
            <p className="whitespace-pre-line text-sm leading-6 text-stone-700">{dateConfirmedShareText}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(dateConfirmedShareText)
                setDateCopied(true)
                setTimeout(() => setDateCopied(false), 1600)
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
            >
              {dateCopied ? 'コピーしました ✓' : 'コピー'}
            </button>
            <button
              type="button"
              onClick={() => openLineShare(dateConfirmedShareText)}
              className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              LINEで送る
            </button>
          </div>
        </div>
      )}

      {dateShareTab === 'maybe' && (
        <div className="mt-4">
          {maybeCount > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {maybeNames.map(name => (
                  <span key={name} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                    {name}さん
                  </span>
                ))}
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-4">
                <p className="whitespace-pre-line text-sm leading-6 text-stone-700">{maybeConfirmText}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(maybeConfirmText)
                    setMaybeCopied(true)
                    setTimeout(() => setMaybeCopied(false), 1600)
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
                >
                  {maybeCopied ? 'コピーしました ✓' : 'コピー'}
                </button>
                <button
                  type="button"
                  onClick={() => openLineShare(maybeConfirmText)}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
                >
                  LINEで送る
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-stone-400">△（調整中）の方はいません</p>
          )}
        </div>
      )}
    </div>

    <PrimaryBtn size="large" onClick={() => setStep('organizerConditions')}>
      お店を決める
    </PrimaryBtn>
    <GhostBtn onClick={() => setStep('dashboard')}>← 戻る</GhostBtn>
  </div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑧ 幹事条件設定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'organizerConditions' && (
          <div className="space-y-4">
            <div className="px-1">
              <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 7</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">条件を設定</h2>
            </div>

            {genreRanking.length > 0 && (
              <div className="rounded-3xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">ジャンル希望ランキング</p>
                <div className="space-y-2">
                  {genreRanking.map(({ genre, count }, i) => (
                    <div key={genre} className="flex items-center gap-3">
                      <span className={`shrink-0 text-[11px] font-black w-5 text-right ${i === 0 ? 'text-stone-900' : 'text-stone-400'}`}>
                        {i + 1}位
                      </span>
                      <div className="flex flex-1 items-center gap-2">
                        <div
                          className="h-1.5 rounded-full bg-stone-900"
                          style={{ width: `${Math.round((count / genreRanking[0].count) * 100)}%`, minWidth: '8px', maxWidth: '100%' }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${i === 0 ? 'text-stone-900' : 'text-stone-500'}`}>{genre}</span>
                      <span className="text-[11px] text-stone-400">{count}人</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-stone-400">1位のジャンルを自動でセットしています</p>
              </div>
            )}
            {genreRanking.length === 0 && activeParticipants.length > 0 && (
              <div className="rounded-3xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                <p className="text-sm text-stone-400">ジャンル希望はまだ集まっていません</p>
              </div>
            )}

            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
              <p className="mb-5 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">幹事条件（修正可）</p>
              <div className="space-y-5">

                {/* ① エリア（駅名） */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">エリア（駅名）</p>
                  <StationInput
                    single
                    value={orgPrefs.areas}
                    onChange={(stations) => {
                      setOrgPrefs((p) => ({ ...p, areas: stations }))
                      setStationError('')
                    }}
                    onCommittedChange={setStationCommitted}
                  />
                  {stationError && (
                    <p className="mt-1.5 text-xs font-bold text-red-600">{stationError}</p>
                  )}
                </div>

                {/* ② 徒歩何分以内 */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">駅から徒歩</p>
                  <div className="flex flex-wrap gap-2">
                    {['5分以内', '10分以内', '15分以内', '20分以内', '指定なし'].map(v => (
                      <Chip key={v} active={orgPrefs.walkMinutes === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, walkMinutes: v }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* ③ ジャンル */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">ジャンル</p>
                  <div className="flex flex-wrap gap-2">
                    {HP_GENRE_OPTIONS.map(v => (
                      <Chip key={v} active={orgPrefs.genres[0] === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, genres: p.genres[0] === v ? [] : [v] }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* ④ 価格帯 */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">価格帯</p>
                  <select
                    value={orgPrefs.priceRange}
                    onChange={(e) => setOrgPrefs((p) => ({ ...p, priceRange: e.target.value }))}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-700 outline-none transition focus:border-stone-400"
                  >
                    {HP_BUDGET_OPTIONS.map((price) => (
                      <option key={price} value={price}>{price}</option>
                    ))}
                  </select>
                </div>

                {/* さらにこだわる */}
                <div className="border-t border-stone-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedPrefs(v => !v)}
                    className="flex w-full items-center justify-between text-xs font-bold text-stone-500 transition hover:text-stone-700"
                  >
                    <span>{showAdvancedPrefs ? 'こだわり条件を閉じる' : 'さらにこだわる'}</span>
                    <span className="text-[10px] text-stone-300">{showAdvancedPrefs ? '▲' : '▼'}</span>
                  </button>

                  {showAdvancedPrefs && (
                    <div className="mt-4 space-y-5">

                      {/* 飲み放題 */}
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">飲み放題</p>
                        <div className="flex gap-2">
                          <Chip active={orgPrefs.allYouCanDrink === '希望'}
                            onClick={() => setOrgPrefs(p => ({ ...p, allYouCanDrink: p.allYouCanDrink === '希望' ? '' : '希望' }))}>
                            希望する
                          </Chip>
                        </div>
                      </div>

                      {/* 個室 */}
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">個室</p>
                        <div className="flex gap-2">
                          <Chip active={orgPrefs.privateRoom === '個室あり'}
                            onClick={() => setOrgPrefs(p => ({ ...p, privateRoom: p.privateRoom === '個室あり' ? '' : '個室あり' }))}>
                            個室あり
                          </Chip>
                        </div>
                      </div>

                      {/* 禁煙 / 喫煙 */}
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">禁煙 / 喫煙</p>
                        <div className="flex flex-wrap gap-2">
                          {['禁煙希望', '喫煙可'].map(v => (
                            <Chip key={v} active={orgPrefs.smoking === v}
                              onClick={() => setOrgPrefs(p => ({ ...p, smoking: p.smoking === v ? '' : v }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>

                      {/* ドリンクの好み */}
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">ドリンクの好み</p>
                        <div className="flex flex-wrap gap-2">
                          {['ワイン', '日本酒', '焼酎'].map(v => (
                            <Chip key={v} active={orgPrefs.drinks[0] === v}
                              onClick={() => setOrgPrefs(p => ({ ...p, drinks: p.drinks[0] === v ? [] : [v] }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>

                      {/* 雰囲気 */}
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">雰囲気</p>
                        <div className="flex flex-wrap gap-2">
                          {['落ち着き', 'にぎやか', 'おしゃれ'].map(v => (
                            <Chip key={v} active={orgPrefs.atmosphere.includes(v)}
                              onClick={() => setOrgPrefs(p => ({
                                ...p,
                                atmosphere: p.atmosphere.includes(v)
                                  ? p.atmosphere.filter(a => a !== v)
                                  : [...p.atmosphere, v],
                              }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}
                </div>

              </div>
            </div>

            <PrimaryBtn size="large" onClick={fetchRecommendedStores}>
              {isLoadingStores ? '店を提案中…' : 'おすすめの店を見る'}
            </PrimaryBtn>
            <GhostBtn onClick={() => setStep('dateConfirmed')}>← 戻る</GhostBtn>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨ 店提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'storeSuggestion' && heroDate && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 9</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">お店を選ぶ</h2>
    </div>
{storePool.length === 0 ? (
  /* ── 空状態: 候補なし ───────────────────────────────────────── */
  <div className="rounded-3xl bg-stone-50 px-6 py-10 text-center ring-1 ring-stone-100">
    <p className="text-base font-bold text-stone-700">指定駅・徒歩条件に合う候補が見つかりませんでした</p>
    <p className="mt-2 text-sm leading-6 text-stone-500">
      {storeFetchError || '徒歩条件を広げるか、価格帯やジャンル条件を見直してください。'}
    </p>
    <div className="mt-5">
      <GhostBtn onClick={() => setStep('organizerConditions')}>条件を調整する</GhostBtn>
    </div>
  </div>
) : (
  /* ── 候補あり ────────────────────────────────────────────────── *//*a*/
  <>
    {storeFetchError && (
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
        {storeFetchError}
      </div>
    )}
    {storeSelectNotes.map((note, i) => (
      <div key={i} className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700 ring-1 ring-sky-100">
        {note}
      </div>
    ))}
    {placesFallback && (
      <p className="text-center text-xs text-stone-400">現在は評価補完なしで候補を表示しています</p>
    )}

    {/* 第一候補 — dark hero */}
    {primaryStore && (
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
          <div className="overflow-hidden h-52 sm:h-64">
            <img src={primaryStore.image} alt={primaryStore.name} className="h-full w-full object-cover object-center opacity-90" />
          </div>
        )}

        <div className="bg-white/[0.06] px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1.5">この会に合う理由</p>
          <p className="text-sm leading-6 text-white/70">{primaryStore.reason || storeReason}</p>
          {primaryStore.googleRating && (
            <p className="mt-3 text-xs text-white/40">
              <span className="text-white/60">Google</span>
              {' '}★ {primaryStore.googleRating.toFixed(1)}
              {primaryStore.googleRatingCount ? `（${primaryStore.googleRatingCount.toLocaleString()}件）` : ''}
            </p>
          )}
        </div>

        <div className="px-6 py-5">
          {primaryStore.link && (
            <a
              href={primaryStore.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-4 text-base font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
            >
              予約ページを見る
            </a>
          )}
        </div>
      </div>
    )}

    {/* 他候補: 折りたたみ + 選択可能（最大 4件） */}
    {secondaryStores.length > 0 && (
      <div>
        <button
          type="button"
          onClick={() => setShowAltStores(v => !v)}
          className="w-full text-center text-xs font-bold text-stone-400 underline underline-offset-2 transition hover:text-stone-600"
        >
          {showAltStores ? 'ほかの候補を閉じる' : `ほかの候補を見る（${secondaryStores.length}件）`}
        </button>
        {showAltStores && (
          <div className="mt-3 space-y-1.5">
            {secondaryStores.map((store: StoreCandidate) => (
              <button
                type="button"
                key={store.id}
                onClick={() => { setSelectedStoreId(store.id); setShowAltStores(false) }}
                className={cx(
                  'flex w-full items-center justify-between rounded-2xl px-4 py-3 ring-1 transition hover:bg-stone-50 active:scale-[0.99]',
                  selectedStoreId === store.id
                    ? 'bg-stone-900 text-white ring-stone-900'
                    : 'bg-white text-stone-700 ring-stone-100'
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">{store.name}</p>
                  {store.area && (
                    <p className={cx('mt-0.5 text-xs', selectedStoreId === store.id ? 'text-white/60' : 'text-stone-400')}>
                      {store.area}{store.access ? ` · ${store.access}` : ''}
                    </p>
                  )}
                  {store.googleRating && (
                    <p className={cx('mt-0.5 text-xs', selectedStoreId === store.id ? 'text-white/50' : 'text-stone-400')}>
                      Google ★ {store.googleRating.toFixed(1)}{store.googleRatingCount ? `（${store.googleRatingCount.toLocaleString()}件）` : ''}
                    </p>
                  )}
                </div>
                <span className={cx('ml-3 shrink-0 text-xs', selectedStoreId === store.id ? 'text-white/60' : 'text-stone-300')}>→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    <PrimaryBtn size="large" onClick={loadFinalDecisionView}>
      この候補で進む
    </PrimaryBtn>
    <GhostBtn onClick={() => setStep('organizerConditions')}>条件を調整する</GhostBtn>
  </>
)}
  </div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨-b 最終確認（決定内容 + 共有文プレビュー）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{/* 確定日程 ヒーロー */}
{step === 'finalConfirm' && (
  <div className="space-y-4">
   <div className="px-1">
  <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 10</p>
  <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">確定情報の共有</h2>
</div>

    {(() => {
      const finalSelectedDate =
        finalDecision && finalDates.length > 0
          ? finalDates.find((d: any) => d.id === finalDecision.selected_date_id) ?? null
          : null

      const finalStore = selectedStore || recommendedStores?.[0] || null



const finalShareText =
  shareText ||
  `${eventName}の日程と場所が決まりました！

日程：${finalSelectedDate?.label ?? heroDate?.label ?? '未定'}
お店：${finalStore?.name ?? '未定'}
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
                  <p className="mt-1 text-2xl font-black text-white">
                    {finalSelectedDate?.label ?? heroDate?.label ?? '未設定'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white/60">
                    最大参加人数 {finalYesParticipants.length + finalMaybeParticipants.length}人
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
              <button
  type="button"
  onClick={() => setShowHeroParticipants((v) => !v)}
  className="mt-3 text-xs font-bold text-white/70 underline"
>
  {showHeroParticipants ? '参加者を閉じる' : '参加者を見る'}
</button>

{showHeroParticipants && (
  <div className="mt-4 space-y-3">
    <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/80">
        参加予定
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {finalYesParticipants.length > 0 ? (
          finalYesParticipants.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20"
            >
              {p.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-white/40">まだいません</span>
        )}
      </div>
    </div>

    <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">
        調整中
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {finalMaybeParticipants.length > 0 ? (
          finalMaybeParticipants.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20"
            >
              {p.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-white/40">まだいません</span>
        )}
      </div>
    </div>
  </div>
)}
            </div>
            <div className="flex flex-wrap gap-2 bg-white/[0.06] px-6 py-4">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                参加予定 {finalYesParticipants.length}人
              </span>
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
                調整中 {finalMaybeParticipants.length}人
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
          {(storeReason || finalStore?.reason) && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
              <p className="text-sm font-bold text-amber-900">この会に合う理由</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">{storeReason || finalStore?.reason}</p>
            </div>
          )}

          {/* 共有文 + CTA */}
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-stone-900">共有文</p>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={urlOnly}
                  onChange={e => setUrlOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-stone-900"
                />
                <span className="text-[11px] font-bold text-stone-500">URLのみ</span>
              </label>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="whitespace-pre-line text-sm leading-6 text-stone-700">
                {urlOnly ? (finalStore?.link ?? '') : finalShareText}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(urlOnly ? (finalStore?.link ?? '') : finalShareText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-900 px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                {copied ? 'コピーしました ✓' : '共有文をコピーする'}
              </button>
              <button
                type="button"
                onClick={() => openLineShare(urlOnly ? (finalStore?.link ?? '') : finalShareText)}
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
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-stone-900">共有文</p>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={urlOnly}
                    onChange={e => setUrlOnly(e.target.checked)}
                    className="h-3.5 w-3.5 accent-stone-900"
                  />
                  <span className="text-[11px] font-bold text-stone-500">URLのみ</span>
                </label>
              </div>
              <p className="whitespace-pre-line text-sm leading-7 text-stone-700">
                {urlOnly ? (selectedStore?.link ?? '') : shareText}
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(urlOnly ? (selectedStore?.link ?? '') : shareText)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  } catch { alert('コピーに失敗しました') }
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-900 px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                {copied ? 'コピーしました ✓' : 'コピー'}
              </button>
              <a
                href={`https://line.me/R/msg/text/?${encodeURIComponent(urlOnly ? (selectedStore?.link ?? '') : shareText)}`}
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

      {/* FAB — 新規作成ボタン（ホームのみ表示） */}
      {step === 'home' && (
        <button
          type="button"
          onClick={() => setStep('create')}
          aria-label="新しい会を作る"
          className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-stone-900 text-white shadow-xl transition hover:bg-stone-800 active:scale-95"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
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
        active ? 'bg-stone-900 text-white' : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200 hover:bg-stone-100'
      )}
    >
      {children}
    </button>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CalendarPicker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CalendarPicker({
  viewMonth,
  onChangeMonth,
  selectedIds,
  disabledBefore,
  onDayClick,
}: {
  viewMonth: Date
  onChangeMonth: (d: Date) => void
  selectedIds: string[]
  disabledBefore: string
  onDayClick: (key: string) => void
}) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const leadingEmpties = firstDay.getDay()
  const totalDays = lastDay.getDate()

  const cells: (Date | null)[] = [
    ...Array<null>(leadingEmpties).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function dk(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
      {/* Month nav */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
          className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          ←
        </button>
        <p className="text-sm font-black text-stone-900">
          {year}年{month + 1}月
        </p>
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
          className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          →
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="mb-1 grid grid-cols-7">
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
          <div key={d} className="py-1 text-center text-[11px] font-bold text-stone-300">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-10 w-10" />
          }

          const dateKeyValue = dk(date)
          const id = `wd-${dateKeyValue}`
          const isWeekend = date.getDay() === 0 || date.getDay() === 6
          const isDisabledBefore = disabledBefore ? dateKeyValue < disabledBefore : false
          const isSelected =
            selectedIds.includes(id) || selectedIds.includes(dateKeyValue)

          return (
            <button
              key={dateKeyValue}
              type="button"
              disabled={isDisabledBefore}
              onClick={() => onDayClick(dateKeyValue)}
              className={cx(
                'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition',
                isSelected && 'bg-stone-900 text-white ring-1 ring-stone-900',
                !isSelected &&
                  !isDisabledBefore &&
                  !isWeekend &&
                  'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50',
                !isSelected &&
                  !isDisabledBefore &&
                  isWeekend &&
                  'bg-stone-50 text-stone-400 ring-1 ring-stone-200 hover:bg-stone-100',
                isDisabledBefore &&
                  'cursor-not-allowed bg-stone-50 text-stone-300 ring-1 ring-stone-100'
              )}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>


    </div>
  )
}
