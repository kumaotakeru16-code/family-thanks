'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin,
  UtensilsCrossed,
  Wallet,
  DoorClosed,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  MessageSquareQuote,
  Star,
  Train,
  CheckCircle2,
  Clock,
  ArrowRight,
  CalendarDays,
  Users,
  Receipt,
  CalendarPlus,
  ChevronRight,
  CircleDashed,
} from 'lucide-react'

import { createEvent, loadEventData } from '@/lib/kanji-db'
import { saveDecision } from '@/lib/kanji-db'
import { loadDecision } from '@/lib/kanji-db'
import { StationInput } from '@/app/components/StationInput'
import { SettlementStep } from '@/app/components/SettlementStep'
import { SettlementSummaryTable } from '@/app/components/SettlementSummaryTable'
import {
  type SettlementConfig,
  type SettlementResult,
  calcSettlement,
  generateSettlementMessage,
} from '@/app/lib/settlement'
import {
  type OrganizerSettings,
  loadOrganizerSettings,
  saveOrganizerSettings,
} from '@/app/lib/organizer-settings'

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
  | 'settlement'
  | 'settlementConfirm'
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
  privateRoom: string
  areas: string[]
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
  hasPrivateRoom?: boolean
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
const HP_GENRE_OPTIONS = ['和食', '洋食', '中華'] as const

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

// 参加者が選んだ旧ジャンル（任意入力含む）を新3択に正規化する
const PARTICIPANT_GENRE_NORMALIZE: Record<string, string> = {
  // 和風・居酒屋 寄り
  '居酒屋': '和食',
  '和食': '和食',
  '焼き鳥': '和食',
  'やきとり': '和食',
  '焼肉・ホルモン': '和食',
  '韓国料理': '和食',
  '海鮮': '和食',
  '魚': '和食',
  '寿司': '和食',
  '刺身': '和食',
  '炉端': '和食',
  'おでん': '和食',
  '鍋': '和食',
  '鶏料理': '和食',
  '串焼き': '和食',
  '串焼': '和食',
  '和風・居酒屋': '和食',
  // 洋食 寄り
  '洋食': '洋食',
  'イタリアン': '洋食',
  'イタリアン・フレンチ': '洋食',
  'イタリアン・スペイン系': '洋食',
  'フレンチ': '洋食',
  'スペイン': '洋食',
  'バル': '洋食',
  'ビストロ': '洋食',
  // 中華 寄り
  '中華': '中華',
  '四川': '中華',
  '上海': '中華',
  '広東': '中華',
  '餃子': '中華',
  '小籠包': '中華',
  '火鍋': '中華',
}
function normalizeParticipantGenre(g: string): string | null {
  return PARTICIPANT_GENRE_NORMALIZE[g] ?? null
}

// 価格帯UI選択肢（「指定なし」= 内部的に4,000〜7,000円帯を自然に優先するデフォルトモード）
const HP_BUDGET_OPTIONS = [
  '指定なし',
  '4,001〜5,000円',
  '5,001〜7,000円',
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
  const hasFreeDrink = false
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
  'settlement',
  'settlementConfirm',
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
    priceRange: '指定なし',
    genres: [],
    privateRoom: '',
    areas: [],
  })


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

  // ── 清算 state ──────────────────────────────────────────────────────────────
  const [settlementConfig, setSettlementConfig] = useState<SettlementConfig | null>(null)
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null)
  const [settlementMessage, setSettlementMessage] = useState('')
  const [settlementCopied, setSettlementCopied] = useState(false)
  const [organizerSettings, setOrganizerSettings] = useState<OrganizerSettings>(() => loadOrganizerSettings())

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

  // ── 編集可能メッセージ state ────────────────────────────────────────────────
  const [editableShareMessage, setEditableShareMessage] = useState('')
  const [editableReminderText, setEditableReminderText] = useState('')
  const [editableDateConfirmedText, setEditableDateConfirmedText] = useState('')
  const [editableMaybeConfirmText, setEditableMaybeConfirmText] = useState('')

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
    setSelectedDateIds([])
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
  let privateRoomCount = 0
  activeParticipants.forEach(p => {
    ;(p.genres ?? []).forEach((g: string) => {
      if (g === 'pref:個室') {
        privateRoomCount++
      } else if (!g.startsWith('atm:') && !g.startsWith('pref:') && !g.startsWith('drink:')) {
        const normalized = normalizeParticipantGenre(g)
        if (normalized) genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1)
      }
    })
  })
  const half = total / 2
  return {
    genres: [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g),
    privateRoom: privateRoomCount > half ? '必要' : 'どちらでも',
    areas: getTopAreas(activeParticipants).slice(0, 2),
  }
}, [activeParticipants])

const genreRanking = useMemo(() => {
  const counts = new Map<string, number>()
  activeParticipants.forEach(p => {
    ;(p.genres ?? []).forEach((g: string) => {
      if (!g.startsWith('atm:') && !g.startsWith('pref:') && !g.startsWith('drink:') && g !== 'なんでもいい') {
        const normalized = normalizeParticipantGenre(g)
        if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
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
  orgPrefs.areas.forEach(a => c.push(a))
  orgPrefs.genres.forEach(g => c.push(g))
  if (orgPrefs.priceRange !== '指定なし') c.push(orgPrefs.priceRange)
  if (orgPrefs.privateRoom === '個室あり') c.push('個室あり')
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
      privateRoom: participantMajority.privateRoom === '必要' ? '個室あり' : p.privateRoom,
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
      // → resume at organizerConditions so the organizer can search for stores
      setHeroBestDateId(confirmedDateId)
      // orgPrefs を再初期化させる（participantMajority useEffect が走るよう ref をリセット）
      orgPrefsInitRef.current = false
      setStep('organizerConditions')

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

// 「候補を入れ替える」：現在表示中の候補IDを除外して同条件で再取得
async function refreshStores() {
  const currentIds = recommendedStores.map((s) => s.id)
  await fetchRecommendedStores(currentIds)
}

// excludeIds: 再取得時に除外したい店のID一覧（「候補を入れ替える」用）
async function fetchRecommendedStores(excludeIds: string[] = []) {
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
    const hpRes = await fetch('/api/hotpepper/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        areas: orgPrefs.areas,
        // route.ts は targetStation または areas[0] を使う。明示的に渡す
        targetStation: orgPrefs.areas[0] ?? '',
        // route.ts が期待するフィールド名は preferredGenres
        preferredGenres: orgPrefs.genres,
        priceRange: orgPrefs.priceRange,
        privateRoom: orgPrefs.privateRoom,
        peopleCount: totalCount,
        eventType,
      }),
    })
    if (!hpRes.ok) throw new Error(`HTTP ${hpRes.status}`)

    const hpData = await hpRes.json()

    // ── Step 1 診断ログ ──────────────────────────────────────────────────────
    console.log('[fetchRecommendedStores] step1 hp raw:', {
      ok: hpRes.ok,
      shopsLength: Array.isArray(hpData.shops) ? hpData.shops.length : `NOT_ARRAY(${typeof hpData.shops})`,
      selectionError: hpData.selectionError ?? null,
      error: hpData.error ?? null,
    })

    // HP が strict 0件を返した場合 → Gemini/Places を呼ばずに即座に空状態へ
    if ((hpData.shops ?? []).length === 0) {
      const msg =
        hpData?.emptyState?.body ??
        hpData?.error ??
        '指定条件に合う候補が見つかりませんでした。条件を変えてお試しください。'
      setStoreFetchError(msg)
      setRecommendedStores([])
      setSelectedStoreId('')
      setStoreSelectNotes([])
      setStep('storeSuggestion')
      return
    }

    const hpStores: StoreCandidate[] = (hpData.shops ?? []).map((s: any, i: number) => ({
      id: s.id ?? `hp-store-${i + 1}`,
      name: s.name ?? `候補${i + 1}`,
      area: s.area ?? s.station_name ?? '未設定',
      access: s.access ?? '',
      image: s.image_url ?? '',
      reason: s.reason ?? '条件に合いやすい候補です',
      link: typeof s.url === 'string' ? s.url : '',
      tags: Array.isArray(s.tags) ? s.tags.slice(0, 4) : [],
      stationName: s.station_name ?? '',
      budgetCode: s.budget_code ?? '',
      genre: s.genre_name ?? '',
      walkMinutes: s.walkMinutes ?? null,
      hasPrivateRoom:
        s.hasPrivateRoom ??
        (typeof s.private_room === 'string' ? /あり|有|可/.test(s.private_room) : false),
      googleRating: typeof s.google_rating === 'number' ? s.google_rating : undefined,
      googleRatingCount:
        typeof s.google_rating_count === 'number' ? s.google_rating_count : undefined,
    }))

    // ── Step 2: Gemini で選定・順位付け・理由生成 ──────────────────────────
    // Gemini が失敗しても HP 順位で続行するため try-catch で囲む
    let rankedStores = hpStores
    let selectNotes: string[] = []

    if (hpStores.length > 0) {
      try {
        const conditions = {
          targetStation: orgPrefs.areas[0] ?? '',
          budgetCode: BUDGET_CODE_MAP[orgPrefs.priceRange] ?? '',
          budgetLabel: orgPrefs.priceRange,
          priceRange: orgPrefs.priceRange,
          genre: orgPrefs.genres[0] ?? '',
          peopleCount: totalCount,
          eventType,
        }

        const selRes = await fetch('/api/store-select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stores: hpStores, conditions }),
        })

        if (selRes.ok) {
          const selData = await selRes.json()
          const sel = selData.selection

          // rankedStoreIds が本当に配列かを確認してから使う
          const rankedIds: string[] = Array.isArray(sel?.rankedStoreIds)
            ? (sel.rankedStoreIds as string[])
            : []

          if (rankedIds.length > 0) {
            // Gemini の順位で並び替え
            const byId = new Map(hpStores.map(s => [s.id, s]))
            const reordered = rankedIds
              .map(id => byId.get(id))
              .filter((s): s is StoreCandidate => !!s)

            // Gemini が選ばなかった店は末尾に（フォールバック用）
            const selectedIds = new Set(rankedIds)
            const leftover = hpStores.filter(s => !selectedIds.has(s.id))
            rankedStores = [...reordered, ...leftover]

            // Gemini の理由文をマージ
            const reasonMap = Object.fromEntries(
              (Array.isArray(sel.reasons) ? sel.reasons : []).map((r: any) => [r.storeId, r.reason])
            )
            rankedStores = rankedStores.map(s => ({
              ...s,
              reason: reasonMap[s.id] || s.reason,
            }))

            selectNotes = Array.isArray(sel.fallbackNotes) ? sel.fallbackNotes : []
          }
        }
      } catch (e) {
        // Gemini 失敗 → HP 順位で続行。エラー内容を必ずログに残す
        console.warn('[fetchRecommendedStores] Gemini selection failed, using HP order', e)
      }
    }

    console.log('[fetchRecommendedStores] step2 ranked:', {
      rankedStoresLength: rankedStores.length,
      excludeIdsLength: excludeIds.length,
    })

    // ── Step 3: 表示件数を絞る（Best + 他 4件 = 最大 5件）────────────────
    // 「候補を入れ替える」時は excludeIds に含まれる店を後回しにして新鮮な候補を優先する。
    // 足りない場合は除外候補も末尾に補完する（完全排除より新鮮さ優先）。
    // ※ excludeIds はデフォルト [] なので、初回呼び出しでは freshStores === rankedStores になる。
    const excludedSet = new Set<string>(excludeIds)
    const freshStores = rankedStores.filter((s) => !excludedSet.has(s.id))
    const reusableStores = rankedStores.filter((s) => excludedSet.has(s.id))
    // スプレッド構文で配列結合（配列結合であることを明示）
    const reranked: StoreCandidate[] =
      freshStores.length >= PLACES_ENRICH_LIMIT
        ? freshStores
        : [...freshStores, ...reusableStores]
    const displayStores = reranked.slice(0, PLACES_ENRICH_LIMIT)

    console.log('[fetchRecommendedStores] step3 display:', {
      freshStoresLength: freshStores.length,
      reusableStoresLength: reusableStores.length,
      rerankedLength: reranked.length,
      displayStoresLength: displayStores.length,
    })

    // ── Step 4: Google Places enrich — best 候補 1件のみ ─────────────────
    // 設計方針:
    //   - best候補 (displayStores[0]) だけを対象にする。全候補には叩かない。
    //   - ENABLE_GOOGLE_RATING=false で無効化可能。
    //   - 失敗・quota・キーなし → 評価なしで続行（アプリは止めない）。
    let bestRating: { rating: number; userRatingCount: number } | null = null
    const bestStore = displayStores[0]

    if (bestStore) {
      try {
        const enrichRes = await fetch('/api/places/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stores: [
              {
                id: bestStore.id,
                name: bestStore.name,
                area: bestStore.area,
                access: bestStore.access,
              },
            ],
          }),
        })

        if (enrichRes.ok) {
          const enrichData = await enrichRes.json()
          const found = (enrichData.enriched ?? []).find((e: any) => e.id === bestStore.id)
          if (found?.rating) {
            bestRating = {
              rating: found.rating,
              userRatingCount: found.userRatingCount ?? 0,
            }
          }
          console.log('[fetchRecommendedStores] Places:', {
            reason: enrichData.reason,
            got: bestRating ? `★${bestRating.rating}` : 'none',
          })
        }
      } catch {
        // ネットワーク例外 → 評価なしで続行（再試行しない）
      }
    }

    // ── Step 5: best候補に評価を付与。順位は Gemini 確定順を維持。 ────────
    // Google 評価による再ランクはしない（Gemini の選定結果を尊重する）。
    const finalStores: StoreCandidate[] = displayStores.map((s, i) =>
      i === 0 && bestRating
        ? { ...s, googleRating: bestRating.rating, googleRatingCount: bestRating.userRatingCount }
        : s
    )

    setRecommendedStores(finalStores)
    setSelectedStoreId(finalStores[0]?.id ?? '')
    setStoreSelectNotes(selectNotes)

    if (hpData?.fallback) {
      setStoreFetchError(
        hpData?.error ?? '条件に合う店が見つからなかったため、参考候補を表示しています。'
      )
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

const reminderText = `${eventName ? eventName + 'の' : ''}日程調整、まだの方だけ回答お願いします🙏
1分くらいで終わります！

${shareUrl}`

const dateConfirmedShareText =
  heroDate
    ? `${eventName ? eventName + 'の' : ''}日程はこちらで決まりました！\n詳細はまた連絡します🙏\n\n日程：${heroDate.label}`
    : ''

const maybeConfirmText =
  heroDate && maybeNames.length > 0
    ? `${eventName ? eventName + 'の' : ''}日程ですが、この日で進めようと思っています！\n問題なさそうなら確定したいです🙏\n\n日程：${heroDate.label}`
    : ''

// 編集可能メッセージの同期（ベーステキストが変わったらリセット）
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { setEditableShareMessage(shareMessage) }, [shareMessage])
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { setEditableReminderText(reminderText) }, [reminderText])
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { setEditableDateConfirmedText(dateConfirmedShareText) }, [dateConfirmedShareText])
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { setEditableMaybeConfirmText(maybeConfirmText) }, [maybeConfirmText])



return (
  <main className="min-h-screen" style={{ background: '#F5F3EF' }}>
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-20 pt-6 sm:px-5">
      {/* App header — step以外では非表示 */}
      {step !== 'home' && (
        <header className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep('home')}
            className="flex items-center gap-1.5 text-[11px] font-bold text-stone-400 transition hover:text-stone-700"
          >
            <CalendarDays size={12} strokeWidth={2.5} />
            <span className="tracking-[0.18em] uppercase">Kanji</span>
          </button>
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
      )}

      {showProgress && <FlowProgress step={step} />}

      

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ① ホーム
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'home' && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* ── Hero ───────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="pt-2"
            >
              {/* ロゴ */}
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900">
                  <CalendarDays size={17} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-[13px] font-black tracking-[0.25em] text-stone-900 uppercase">Kanji</span>
              </div>

              {/* キャッチコピー */}
              <h1 className="text-[28px] font-black leading-[1.2] tracking-tight text-stone-900">
                幹事の仕事を<br />最初から最後まで。
              </h1>
              <p className="mt-2.5 text-sm leading-6 text-stone-500">
                日程調整・お店決め・会計共有まで、<br className="sm:hidden" />
                ひとつのアプリで完結します。
              </p>

              {/* 3機能チップ */}
              <motion.div
                className="mt-5 flex gap-2.5"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
              >
                {[
                  { icon: CalendarDays, label: '日程調整', color: 'bg-sky-50 text-sky-700 ring-sky-200/60' },
                  { icon: UtensilsCrossed, label: 'お店決め', color: 'bg-amber-50 text-amber-700 ring-amber-200/60' },
                  { icon: Receipt, label: '清算共有', color: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' },
                ].map(({ icon: Icon, label, color }) => (
                  <motion.span
                    key={label}
                    variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ${color}`}
                  >
                    <Icon size={11} strokeWidth={2.5} />
                    {label}
                  </motion.span>
                ))}
              </motion.div>
            </motion.div>

            {/* ── 進行中の会 ─────────────────────────────────────── */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <CircleDashed size={12} className="text-stone-400" strokeWidth={2.5} />
                <p className="text-[11px] font-black tracking-[0.2em] text-stone-400 uppercase">進行中の会</p>
              </div>
              {savedEvents.length > 0 ? (
                <div className="space-y-2.5">
                  {savedEvents.map((ev, idx) => {
                    const s = ev.status ?? 'date_pending'
                    const statusCfg =
                      s === 'store_confirmed'
                        ? { label: 'お店決定済み', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 }
                        : s === 'store_pending'
                        ? { label: 'お店未確定', cls: 'bg-sky-50 text-sky-700 ring-sky-200', Icon: Sparkles }
                        : { label: '回答収集中', cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: Clock }
                    const { Icon: StatusIcon } = statusCfg
                    return (
                      <motion.button
                        type="button"
                        key={ev.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.05, ease: 'easeOut' }}
                        whileTap={{ scale: 0.982 }}
                        onClick={() => openSavedEvent(ev.id, ev.name, ev.eventType)}
                        className="group flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-stone-100/80 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-50 ring-1 ring-stone-100">
                            <CalendarDays size={15} className="text-stone-500" strokeWidth={2} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-black tracking-tight text-stone-900">{ev.name}</p>
                            <p className="mt-0.5 text-[11px] text-stone-400">{ev.eventType}</p>
                          </div>
                        </div>
                        <div className="ml-3 flex shrink-0 items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusCfg.cls}`}>
                            <StatusIcon size={9} strokeWidth={2.5} />
                            {statusCfg.label}
                          </span>
                          <ChevronRight size={14} className="text-stone-300 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.2, ease: 'easeOut' }}
                  className="rounded-2xl border-2 border-dashed border-stone-200 px-6 py-10 text-center"
                >
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100">
                    <CalendarPlus size={20} className="text-stone-400" strokeWidth={1.8} />
                  </div>
                  <p className="text-sm font-bold text-stone-500">まだ進行中の会はありません</p>
                  <p className="mt-1.5 text-xs leading-5 text-stone-400">
                    右下のボタンから、新しい会を作れます
                  </p>
                </motion.div>
              )}
            </section>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ② 会を作る（会の基本情報 + 候補日選択 を1画面に統合）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {(step === 'create' || step === 'dates') && (
          <motion.div
            className="space-y-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
          <div className="px-0.5">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
                <CalendarPlus size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <p className="text-[10px] font-black tracking-[0.22em] text-stone-400 uppercase">Step 1 / 10</p>
            </div>
            <h2 className="text-[22px] font-black tracking-tight text-stone-900">会を作る</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-400">イベント名と候補日を設定してください。</p>
          </div>
          <Card>

            <div>
              <FieldLabel>イベント名</FieldLabel>
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
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            参加者に送る
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        
        
        
{step === 'shareLink' && (
  <motion.div
    className="space-y-5"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
  <div className="px-0.5">
    <div className="mb-2 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
        <Users size={13} className="text-white" strokeWidth={2.5} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 3 / 10</p>
    </div>
    <h2 className="text-[22px] font-black tracking-tight text-stone-900">参加者に送る</h2>
    <p className="mt-1 text-[13px] leading-relaxed text-stone-400">リンクを送って回答を集めましょう。</p>
  </div>
  <Card>

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
        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-100">
          {urlOnlyInvite ? (
            <p className="text-sm text-stone-700">{shareUrl}</p>
          ) : (
            <textarea
              value={editableShareMessage}
              onChange={(e) => setEditableShareMessage(e.target.value)}
              rows={5}
              className="w-full resize-none text-sm leading-6 text-stone-700 outline-none"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(urlOnlyInvite ? shareUrl : editableShareMessage)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
        >
          {copied ? 'コピーしました' : '全文をコピー'}
        </button>

        <button
          type="button"
          onClick={() => openLineShare(urlOnlyInvite ? shareUrl : editableShareMessage)}
          className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
        >
          LINEで送る
        </button>
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
  </motion.div>
)}



        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑤ ダッシュボード
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'dashboard' && (
  <motion.div
    className="space-y-4"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    <div className="px-0.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
          <CalendarDays size={13} className="text-white" strokeWidth={2.5} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 6 / 10</p>
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">日程を決める</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-stone-400">回答状況を確認して、最適な日程を決めましょう。</p>
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
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-stone-400" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">優先したい人（任意）</p>
          </div>
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
          <p className="mt-3 text-[11px] leading-5 text-stone-400">
            参加者の回答と優先設定をもとにおすすめ日程を算出しています。主賓がいる場合は上で設定してください。
          </p>
        </div>

        {/* おすすめ日程ヒーロー */}
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
                    {heroYesParticipants.length > 0 ? (
                      heroYesParticipants.map((p) => (
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
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">
                    調整中
                  </p>
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
        </div>

        {/* ほかの日程 */}
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

        {/* 回答テーブル */}
        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-stone-400" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">回答テーブル</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[760px]">
              <div
                className="grid items-center gap-2 text-xs font-bold text-stone-500"
                style={{ gridTemplateColumns: `92px repeat(${activeDates.length}, minmax(72px, 1fr))` }}
              >
                <div>参加者</div>
                {activeDates.map((date) => (
                  <div key={date.id} className={date.id === heroDate.id ? 'text-stone-900' : ''}>
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
                            value === 'yes' ? 'text-emerald-600' : value === 'maybe' ? 'text-amber-500' : 'text-stone-300'
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

        {/* 未回答者へのリマインド */}
        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
          <div className="flex items-center gap-1.5">
            <MessageSquareQuote size={11} className="text-stone-400" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">未回答者へのリマインド</p>
          </div>
          <div className="mt-3 rounded-2xl bg-stone-50 px-4 py-3">
            {urlOnlyReminder ? (
              <p className="text-sm text-stone-700">{shareUrl}</p>
            ) : (
              <textarea
                value={editableReminderText}
                onChange={(e) => setEditableReminderText(e.target.value)}
                rows={4}
                className="w-full resize-none bg-transparent text-sm leading-6 text-stone-700 outline-none"
              />
            )}
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
                await navigator.clipboard.writeText(urlOnlyReminder ? shareUrl : editableReminderText)
                setReminderCopied(true)
                setTimeout(() => setReminderCopied(false), 1600)
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
            >
              {reminderCopied ? 'コピーしました ✓' : 'コピー'}
            </button>
            <button
              type="button"
              onClick={() => openLineShare(urlOnlyReminder ? shareUrl : editableReminderText)}
              className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              LINEで送る
            </button>
          </div>
        </div>

        {/* この日で決定 CTA */}
        <PrimaryBtn size="large" onClick={decideRecommendedDate}>
          この日で決定 →
        </PrimaryBtn>
        <GhostBtn onClick={() => setStep('shareLink')}>← 戻る</GhostBtn>
</>
)}
  </motion.div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑥ 日程提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}




        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑦ 日程確定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'dateConfirmed' && heroDate && (
  <motion.div
    className="space-y-4"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    <div className="px-0.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
          <CalendarDays size={13} className="text-white" strokeWidth={2.5} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 7 / 10</p>
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">日程確定</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-stone-400">参加者に日程を知らせましょう。</p>
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
          <div className="rounded-2xl bg-stone-50 px-4 py-3">
            <textarea
              value={editableDateConfirmedText}
              onChange={(e) => setEditableDateConfirmedText(e.target.value)}
              rows={4}
              className="w-full resize-none bg-transparent text-sm leading-6 text-stone-700 outline-none"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(editableDateConfirmedText)
                setDateCopied(true)
                setTimeout(() => setDateCopied(false), 1600)
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
            >
              {dateCopied ? 'コピーしました ✓' : 'コピー'}
            </button>
            <button
              type="button"
              onClick={() => openLineShare(editableDateConfirmedText)}
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
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <textarea
                  value={editableMaybeConfirmText}
                  onChange={(e) => setEditableMaybeConfirmText(e.target.value)}
                  rows={4}
                  className="w-full resize-none bg-transparent text-sm leading-6 text-stone-700 outline-none"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(editableMaybeConfirmText)
                    setMaybeCopied(true)
                    setTimeout(() => setMaybeCopied(false), 1600)
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-800 active:scale-[0.98]"
                >
                  {maybeCopied ? 'コピーしました ✓' : 'コピー'}
                </button>
                <button
                  type="button"
                  onClick={() => openLineShare(editableMaybeConfirmText)}
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
  </motion.div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑧ 幹事条件設定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'organizerConditions' && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* ローディングオーバーレイ：候補取得中に全面表示（共通コンポーネント） */}
            {isLoadingStores && <StoreLoadingOverlay />}
            {/* ヘッダー */}
            <div className="px-0.5">
              <p className="text-[10px] font-bold tracking-[0.22em] text-stone-400 uppercase">Step 7</p>
              <h2 className="mt-1 text-[22px] font-black tracking-tight text-stone-900">お店の条件</h2>
              <p className="mt-1 text-[13px] text-stone-400 leading-relaxed">
                条件は4つだけ。あとはAIが選びます。
              </p>
            </div>

            {/* 参加者希望タグ（補助情報） */}
            {genreRanking.length > 0 && (
              <motion.div
                className="flex items-start gap-3 rounded-2xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.05 }}
              >
                <UtensilsCrossed size={13} className="mt-0.5 shrink-0 text-stone-400" />
                <div className="min-w-0">
                  <p className="mb-1.5 text-[10px] font-bold tracking-[0.12em] text-stone-400 uppercase">参加者の希望</p>
                  <div className="flex flex-wrap gap-1.5">
                    {genreRanking.map(({ genre, count }, i) => (
                      <span key={genre} className={cx(
                        'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        i === 0 ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'
                      )}>
                        {genre}
                        <span className="ml-1 opacity-50 font-normal">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 条件リスト */}
            <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200/80 shadow-sm">

              {/* 駅 */}
              <div className="px-4 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <MapPin size={13} className="text-stone-400" />
                  <p className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">駅</p>
                </div>
                <StationInput
                  single
                  placeholder="駅名を入力（ひらがなでもOK）"
                  value={orgPrefs.areas}
                  onChange={(stations) => {
                    setOrgPrefs((p) => ({ ...p, areas: stations }))
                    setStationError('')
                  }}
                  onCommittedChange={setStationCommitted}
                />
                {stationError && (
                  <p className="mt-2 text-xs text-red-500">{stationError}</p>
                )}
              </div>

              {/* ジャンル */}
              <div className="px-4 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <UtensilsCrossed size={13} className="text-stone-400" />
                  <p className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">ジャンル</p>
                  <span className="text-[10px] text-stone-300">（任意）</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {HP_GENRE_OPTIONS.map(v => (
                    <Chip key={v} active={orgPrefs.genres[0] === v}
                      onClick={() => setOrgPrefs(p => ({ ...p, genres: p.genres[0] === v ? [] : [v] }))}>
                      {v}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* 価格帯 */}
              <div className="px-4 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <Wallet size={13} className="text-stone-400" />
                  <p className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">価格帯</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {HP_BUDGET_OPTIONS.map(v => (
                    <Chip key={v} active={orgPrefs.priceRange === v}
                      onClick={() => setOrgPrefs(p => ({ ...p, priceRange: v }))}>
                      {v}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* 個室 */}
              <div className="px-4 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <DoorClosed size={13} className="text-stone-400" />
                  <p className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">個室</p>
                </div>
                <div className="flex gap-2">
                  {(['どちらでも', 'あり'] as const).map(v => (
                    <Chip key={v}
                      active={v === 'あり' ? orgPrefs.privateRoom === '個室あり' : orgPrefs.privateRoom !== '個室あり'}
                      onClick={() => setOrgPrefs(p => ({ ...p, privateRoom: v === 'あり' ? '個室あり' : '' }))}>
                      {v}
                    </Chip>
                  ))}
                </div>
              </div>

            </div>

            {/* CTA */}
            <div className="space-y-2.5">
              <PrimaryBtn size="large" onClick={() => fetchRecommendedStores()}>
                {isLoadingStores ? '候補を探しています…' : 'お店候補を見る'}
              </PrimaryBtn>
              <GhostBtn onClick={() => setStep('dateConfirmed')}>戻る</GhostBtn>
            </div>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨ 店提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'storeSuggestion' && heroDate && (
  <div className="space-y-5">
    {/* 「候補を入れ替える」再取得中も同じローディングUIを使う */}
    {isLoadingStores && <StoreLoadingOverlay />}

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="px-1"
    >
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 9</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">お店を選ぶ</h2>
    </motion.div>

    {storePool.length === 0 ? (
      /* ── 空状態 ─────────────────────────────────────────────── */
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl bg-stone-50 px-6 py-10 text-center ring-1 ring-stone-100"
      >
        <p className="text-sm font-bold text-stone-700">条件に合う候補が見つかりませんでした</p>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          {storeFetchError || '価格帯やジャンル条件を変えてお試しください。'}
        </p>
        <div className="mt-5">
          <GhostBtn onClick={() => setStep('organizerConditions')}>条件を調整する</GhostBtn>
        </div>
      </motion.div>
    ) : (
      /* ── 候補あり ────────────────────────────────────────────── */
      <>
        {storeFetchError && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
            {storeFetchError}
          </div>
        )}

        {/* 条件チップ + 条件変更リンク */}
        {organizerConditions.length > 0 && (
          <motion.div
            className="flex flex-wrap items-center gap-1.5 px-0.5"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {organizerConditions.map(c => (
              <motion.span
                key={c}
                variants={{ hidden: { opacity: 0, scale: 0.88 }, visible: { opacity: 1, scale: 1 } }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="inline-flex items-center rounded-full bg-stone-800 px-3 py-1 text-[11px] font-bold text-white/80"
              >
                {c}
              </motion.span>
            ))}
            <motion.button
              type="button"
              onClick={() => setStep('organizerConditions')}
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              className="ml-1 text-[11px] font-bold text-stone-400 underline underline-offset-2 hover:text-stone-600"
            >
              条件を変える
            </motion.button>
          </motion.div>
        )}

        {/* Best候補 — selectedStoreId が変わると AnimatePresence で自然に入れ替わる */}
        <AnimatePresence mode="wait">
          {primaryStore && (
            <motion.div
              key={primaryStore.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden rounded-3xl bg-stone-900 shadow-lg shadow-stone-900/20"
            >
              {/* 画像エリア */}
              {primaryStore.image && (
                <div className="relative h-52 overflow-hidden sm:h-60">
                  <img
                    src={primaryStore.image}
                    alt={primaryStore.name}
                    className="h-full w-full object-cover object-center"
                    style={{ filter: 'brightness(0.55)' }}
                  />
                  {/* グラデーションオーバーレイ */}
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-stone-900/10 to-transparent" />
                  {/* Best Choice バッジ（画像上） */}
                  <div className="absolute left-4 top-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm ring-1 ring-white/20">
                      <Sparkles size={9} strokeWidth={2.5} />
                      Best Choice
                    </span>
                  </div>
                  {/* Google評価（画像右下） */}
                  {primaryStore.googleRating && (
                    <div className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm">
                      <Star size={10} className="fill-amber-400 text-amber-400" />
                      <span className="text-[11px] font-bold text-white">
                        {primaryStore.googleRating.toFixed(1)}
                        {primaryStore.googleRatingCount
                          ? <span className="ml-0.5 font-normal text-white/60">（{primaryStore.googleRatingCount.toLocaleString()}件）</span>
                          : null}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* テキスト + 情報 */}
              <div className="px-5 pt-5 pb-4">
                {/* 画像がないときだけ Best Choice バッジを表示 */}
                {!primaryStore.image && (
                  <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/60 ring-1 ring-white/10">
                    <Sparkles size={9} strokeWidth={2.5} />
                    Best Choice
                  </span>
                )}
                <h3 className="text-xl font-black tracking-tight text-white leading-snug">
                  {primaryStore.name}
                </h3>

                {/* アクセス + エリア情報 */}
                {primaryStore.access && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <Train size={11} className="mt-0.5 shrink-0 text-white/35" />
                    <p className="text-xs leading-5 text-white/45">{primaryStore.access}</p>
                  </div>
                )}
              </div>

              {/* 理由文 */}
              <div className="px-5 pb-4">
                <p className="text-sm leading-6 text-white/65">{primaryStore.reason || storeReason}</p>
              </div>

              {/* タグチップ */}
              {primaryStore.tags && primaryStore.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-5 pb-4">
                  {primaryStore.tags.slice(0, 4).map(tag => tag ? (
                    <span key={tag} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/55">
                      {tag}
                    </span>
                  ) : null)}
                </div>
              )}

              {/* 予約リンク */}
              {primaryStore.link && (
                <div className="px-5 pb-5">
                  <a
                    href={primaryStore.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
                  >
                    <ExternalLink size={14} strokeWidth={2.5} />
                    ホットペッパーで予約を確認する
                  </a>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2位以下 — 選択可能カード（stagger表示） */}
        {secondaryStores.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <p className="text-[10px] font-black tracking-[0.15em] text-stone-400 uppercase">他の候補</p>
              <button
                type="button"
                onClick={isLoadingStores ? undefined : refreshStores}
                className="text-[11px] font-bold text-stone-400 underline underline-offset-2 hover:text-stone-600"
              >
                候補を入れ替える
              </button>
            </div>
            <motion.div
              className="space-y-2"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
            >
              {secondaryStores.map((store: StoreCandidate) => (
                /* タップでこの店を選択 → selectedStoreId 更新で primaryStore が入れ替わる */
                <motion.button
                  type="button"
                  key={store.id}
                  variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setSelectedStoreId(store.id)}
                  className="group flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-stone-100 transition-shadow hover:shadow-md hover:ring-stone-200"
                >
                  {/* サムネイル or アイコン */}
                  {store.image ? (
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                      <img src={store.image} alt={store.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100">
                      <UtensilsCrossed size={18} className="text-stone-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-900 leading-snug">{store.name}</p>
                    {store.access && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
                        <Train size={9} className="shrink-0" />
                        <span className="line-clamp-1">{store.access}</span>
                      </p>
                    )}
                    {store.reason && !store.access && (
                      <p className="mt-0.5 text-xs text-stone-400 line-clamp-1">{store.reason}</p>
                    )}
                  </div>
                  {/* 詳細リンク */}
                  {store.link && (
                    <a
                      href={store.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded-xl bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-100 active:scale-95"
                    >
                      詳細
                    </a>
                  )}
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}

        {/* CTA エリア */}
        <motion.div
          className="space-y-2 pt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <PrimaryBtn size="large" onClick={loadFinalDecisionView}>
            この候補で進む
          </PrimaryBtn>
        </motion.div>
      </>
    )}
  </div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨-b 最終確認（決定内容 + 共有文プレビュー）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{/* 確定日程 ヒーロー */}
{step === 'finalConfirm' && (
  <motion.div
    className="space-y-4"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    <div className="px-0.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
          <CheckCircle2 size={13} className="text-white" strokeWidth={2.5} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 10 / 10</p>
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">確定情報の共有</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-stone-400">決まった内容をみんなに伝えましょう。</p>
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

          {/* 清算へ進む */}
          <button
            type="button"
            onClick={() => setStep('settlement')}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-900 px-4 py-4 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            会計をまとめる（清算）→
          </button>

          {finalStore?.link && (
            <a
              href={finalStore.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
            >
              お店ページを開く →
            </a>
          )}

          <GhostBtn onClick={() => setStep('storeSuggestion')}>← 店候補を見直す</GhostBtn>
        </div>
      )
    })()}
  </motion.div>
)}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            清算 ① settlement（入力）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'settlement' && (() => {
          // 確定日の yes 参加者を優先。なければ active 全員
          const baseParticipants =
            finalYesParticipants.length > 0
              ? finalYesParticipants
              : heroYesParticipants.length > 0
              ? heroYesParticipants
              : activeParticipants

          // 幹事を必ず参加者に含める（重複チェック）
          const organizerName = organizerSettings.organizerName || '幹事'
          const alreadyIn = baseParticipants.some(
            (p) => p.id === 'organizer-self' || p.name === organizerName
          )
          const settlementParticipants = alreadyIn
            ? baseParticipants
            : [{ id: 'organizer-self', name: organizerName }, ...baseParticipants]

          return (
            <SettlementStep
              participants={settlementParticipants.map((p) => ({ id: p.id, name: p.name }))}
              organizerSettings={organizerSettings}
              onSaveSettings={(s) => {
                saveOrganizerSettings(s)
                setOrganizerSettings(s)
              }}
              onSubmit={(config) => {
                const result = calcSettlement(
                  config,
                  settlementParticipants.map((p) => ({ id: p.id, name: p.name }))
                )
                const storeName =
                  (selectedStore || recommendedStores[0])?.name ?? undefined
                const payment = {
                  paypayId: organizerSettings.paypayId,
                  bankName: organizerSettings.bankName,
                  branchName: organizerSettings.branchName,
                  accountType: organizerSettings.accountType,
                  accountNumber: organizerSettings.accountNumber,
                  accountName: organizerSettings.accountName,
                }
                const msg = generateSettlementMessage(result, config.parties.map((p) => p.id), storeName, payment)
                setSettlementConfig(config)
                setSettlementResult(result)
                setSettlementMessage(msg)
                setStep('settlementConfirm')
              }}
              onBack={() => setStep('finalConfirm')}
            />
          )
        })()}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            清算 ② settlementConfirm（確認 + 共有）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'settlementConfirm' &&
          settlementConfig &&
          settlementResult && (
            <SettlementSummaryTable
              result={settlementResult}
              config={settlementConfig}
              message={settlementMessage}
              organizerSettings={organizerSettings}
              onBack={() => setStep('settlement')}
              onShare={() => openLineShare(settlementMessage)}
              onDone={() => setStep('home')}
            />
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
      <AnimatePresence>
        {step === 'home' && (
          <motion.button
            type="button"
            onClick={() => setStep('create')}
            aria-label="新しい会を作る"
            initial={{ opacity: 0, scale: 0.7, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            whileHover={{ scale: 1.07 }}
            whileTap={{ scale: 0.93 }}
            className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-stone-900 text-white shadow-xl"
          >
            <CalendarPlus size={22} strokeWidth={2.2} />
          </motion.button>
        )}
      </AnimatePresence>
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

// ─── 共通ローディングオーバーレイ ────────────────────────────────────────────
// 初回検索・候補入れ替えのどちらでも同じUIを使う
// skeleton カード + pulsing アイコンで「探している感」を演出
function StoreLoadingOverlay() {
  const steps = ['エリアで候補を絞っています', 'ジャンルと価格帯を確認中', 'ベスト候補を選んでいます']
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-50/90 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mx-4 w-full max-w-sm"
      >
        {/* メインカード */}
        <div className="rounded-3xl bg-white px-6 py-7 shadow-xl ring-1 ring-stone-100">
          {/* アイコン列 */}
          <div className="mb-5 flex items-center justify-center gap-3">
            {[MapPin, UtensilsCrossed, Sparkles].map((Icon, i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-100"
              >
                <Icon size={16} className="text-stone-500" />
              </motion.div>
            ))}
          </div>

          <p className="text-center text-[15px] font-black text-stone-900">候補を探しています</p>

          {/* ステップ文言 — 順番にフェード */}
          <div className="relative mt-2 h-6 overflow-hidden text-center">
            {steps.map((s, i) => (
              <motion.p
                key={s}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -6] }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  repeatDelay: steps.length * 1.8 - 1.8,
                  delay: i * 1.8,
                  times: [0, 0.15, 0.8, 1],
                }}
                className="absolute inset-x-0 text-xs text-stone-400"
              >
                {s}
              </motion.p>
            ))}
          </div>

          {/* Skeleton カード群 */}
          <div className="mt-5 space-y-2.5">
            {[1, 2, 3].map((_, i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-3"
              >
                <div className={`h-10 shrink-0 rounded-xl bg-stone-200 ${i === 0 ? 'w-16' : 'w-10'}`} />
                <div className="flex-1 space-y-1.5">
                  <div className={`h-2.5 rounded-full bg-stone-200 ${i === 0 ? 'w-2/3' : 'w-1/2'}`} />
                  <div className="h-2 w-1/3 rounded-full bg-stone-100" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-stone-400">少し時間がかかることがあります</p>
      </motion.div>
    </div>
  )
}

// ─── ボタンコンポーネント ─────────────────────────────────────────────────────
// Framer Motion の whileTap で押し込み感を統一
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
    <motion.button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      whileTap={disabled ? {} : { scale: 0.975 }}
      transition={{ duration: 0.12 }}
      className={cx(
        'w-full rounded-2xl font-bold tracking-wide transition-colors duration-150',
        size === 'large' ? 'py-4 text-[15px]' : 'py-3 text-sm',
        disabled
          ? 'cursor-not-allowed bg-stone-200 text-stone-400'
          : 'bg-stone-900 text-white shadow-md shadow-stone-900/20 hover:bg-stone-800'
      )}
    >
      {children}
    </motion.button>
  )
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.975 }}
      transition={{ duration: 0.12 }}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-medium text-stone-400 transition-colors duration-150 hover:bg-stone-100 hover:text-stone-600"
    >
      {children}
    </motion.button>
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
        'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition duration-150 active:scale-95',
        active
          ? 'bg-stone-900 text-white shadow-sm'
          : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:ring-stone-300 hover:text-stone-700'
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

  const todayKey = dk(new Date())

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
          const isSelected = selectedIds.includes(id) || selectedIds.includes(dateKeyValue)
          const isToday = dateKeyValue === todayKey

          return (
            <button
              key={dateKeyValue}
              type="button"
              disabled={isDisabledBefore}
              onClick={() => onDayClick(dateKeyValue)}
              className={cx(
                'relative flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm font-bold transition',
                isSelected && 'bg-stone-900 text-white ring-1 ring-stone-900',
                !isSelected && isToday && !isDisabledBefore && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300',
                !isSelected && !isToday && !isDisabledBefore && !isWeekend && 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50',
                !isSelected && !isToday && !isDisabledBefore && isWeekend && 'bg-stone-50 text-stone-400 ring-1 ring-stone-200 hover:bg-stone-100',
                isDisabledBefore && 'cursor-not-allowed bg-stone-50 text-stone-300 ring-1 ring-stone-100'
              )}
            >
              {date.getDate()}
              {isToday && <span className="absolute bottom-0.5 text-[7px] font-black leading-none text-emerald-500">今日</span>}
            </button>
          )
        })}
      </div>


    </div>
  )
}
