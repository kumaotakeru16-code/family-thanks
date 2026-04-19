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
  ChevronLeft,
  CircleDashed,
  XCircle,
  Share2,
  House,
  Settings,
  ImagePlus,
  Heart,
  Plus,
} from 'lucide-react'

import { createEvent, loadEventData } from '@/lib/kanji-db'
import { saveDecision } from '@/lib/kanji-db'
import { loadDecision } from '@/lib/kanji-db'
import { StationInput } from '@/app/components/StationInput'
import { SettlementStep, type SettlementDraft } from '@/app/components/SettlementStep'
import { SettlementSummaryTable, type CompletionData, type CompleteResult } from '@/app/components/SettlementSummaryTable'
import { SettingsScreen } from '@/app/components/SettingsScreen'
import { StoreExternalLink, AffiliateNote } from '@/app/components/StoreExternalLink'
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
import {
  type UserSettings,
  loadUserSettings,
  saveUserSettings,
  loadUserSettingsCloud,
  removePastEventCloud,
} from '@/app/lib/user-settings'
import {
  type SavedEvent,
  loadSavedEvents,
  persistSavedEvent,
  updateSavedEventStatus,
  removeSavedEvent,
} from '@/app/lib/event-store'
import {
  buildPastEventRecord,
  saveCompletionData,
  toggleFavoriteStore,
} from '@/app/lib/event-actions'
import { trackEvent } from '@/app/lib/analytics'

// --- Types ---
type Step =
  | 'home'
  | 'settings'
  | 'create'
  | 'dates'
  | 'shareLink'
  | 'dashboard'

  | 'dateConfirmed'
  | 'organizerConditions'
  | 'storeSuggestion'
  | 'manualStore'
  | 'finalConfirm'
  | 'settlement'
  | 'settlementConfirm'
  | 'shared'
  | 'pastStores'
  | 'storeDetail'

type AppMode = 'full' | 'store_only'

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

// SavedEvent 型は event-store.ts で定義・管理（import 済み）

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

function generateShareText(eventType: string, store: StoreCandidate, conditions: string[], name?: string): string {
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
  const header = name ? `${name}はここにしました👇` : '今回ここにしました👇'
  return `${header}\n${store.name}\n${store.link}\n\nみんなの希望を見て選びました。${closer}`
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
  mainGuestAvailability?: Availability | null
  availableCount: number
  maybeCount?: number
  totalCount: number
  eventType: EventType | string
  isBest?: boolean
}) {
  const {
    mainGuestAvailability,
    availableCount,
    maybeCount = 0,
    totalCount,
    eventType,
    isBest = true,
  } = params

  if (totalCount === 0) return ''

  if (isBest) {
    // ── BEST候補：決定を後押しする強いトーン ──────────────────────────────────
    if (availableCount === 0) {
      return 'まだ十分な回答が集まっていないため、日程理由は表示していません。'
    }
    if (availableCount === totalCount) {
      return `全員（${totalCount}人）が参加できます。この日程で確定しましょう。`
    }
    if (mainGuestAvailability === 'yes') {
      if (eventType === '歓迎会' || eventType === '送別会') {
        return `主賓が無理なく参加でき、参加人数も ${availableCount}/${totalCount} 人と確保できるため、この日程が最も自然です。`
      }
      return `主賓を含む${availableCount}人が参加可能。今回の候補でいちばんまとまりやすいです。`
    }
    if (availableCount >= Math.ceil(totalCount * 0.6)) {
      return `${availableCount}/${totalCount}人が参加できる最多候補。この日が一番決めやすいです。`
    }
    return `全体の予定を考慮すると、この日程が最も現実的な選択です。`

  } else {
    // ── BEST以外：代替案として控えめなトーン ─────────────────────────────────
    if (availableCount === totalCount) {
      return `全員参加できますが、他候補の方がより決めやすい日程です`
    }
    if (mainGuestAvailability === 'no') {
      return `主賓の参加が難しい候補です。日程優先ならこの候補も選べます。`
    }
    if (mainGuestAvailability === 'yes') {
      return `主賓は参加可能ですが、参加人数でメイン候補に次ぐ日程です。`
    }
    if (availableCount > 0 && maybeCount > 0) {
      return `参加予定${availableCount}人・調整中${maybeCount}人います。調整次第で開催できます。`
    }
    if (maybeCount > 0) {
      return `調整中が${maybeCount}人います。開催候補として成立しますが、調整が必要です。`
    }
    if (availableCount > 0) {
      return `参加人数はやや少なめですが、日程優先ならこの候補も選べます。`
    }
    return `一部調整は必要ですが、開催候補としては成立しています。`
  }
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

  // 判断理由テンプレート — 「なぜこの店か」を幹事が他人に説明できる言葉で
  if (hasVip && hasPrivateRoom && area) {
    return `主賓を個室で囲める${area}周辺の候補。今回の会に一番合っています。`
  }
  if (hasVip && area && genre) {
    return `主賓優先で選んだ${area}周辺の${genre}。集まりやすさと条件のバランスが最良です。`
  }
  if (hasVip && area) {
    return `${area}周辺で主賓が来やすく、今回の条件に最も合う候補です。`
  }
  if (hasPrivateRoom && hasFreeDrink && area) {
    return `個室あり・飲み放題で${area}周辺。今回の人数で会費もまとめやすい候補です。`
  }
  if (hasPrivateRoom && area && genre) {
    return `個室あり・${area}周辺の${genre}。落ち着いて話せ、今回の会に使いやすい候補です。`
  }
  if (hasPrivateRoom && area) {
    return `個室あり・${area}周辺。今回の人数で落ち着いて話せる、最有力の候補です。`
  }
  if (hasFreeDrink && area && genre) {
    return `${area}周辺の${genre}で飲み放題あり。今回の会費をまとめやすい候補です。`
  }
  if (hasFreeDrink && area) {
    return `飲み放題あり・${area}周辺。会費が計算しやすく、今回に決めやすい候補です。`
  }
  if (isFormal && hasPrivateRoom) {
    return `個室あり。${eventType}として落ち着いて使えます。今回の条件に合っています。`
  }
  if (isFormal && area) {
    return `${area}周辺の${eventType}向け候補。アクセスと雰囲気のバランスが今回の会に合います。`
  }
  if (genre && area && priceRange) {
    return `${area}周辺・${priceRange}の${genre}。今回の条件でいちばん決めやすい候補です。`
  }
  if (genre && area) {
    return `${area}周辺の${genre}。参加者の希望エリアと一致し、今回の候補で最有力です。`
  }
  if (area && priceRange) {
    return `${area}周辺・${priceRange}の価格帯。会費もまとめやすく今回に最適な候補です。`
  }
  if (area) {
    return `${area}周辺で集まりやすく、今回の条件でいちばんバランスが取れている候補です。`
  }
  if (genre) {
    return `参加者希望の${genre}ジャンルで、今回の会に最も合う候補です。`
  }
  if (organizerConditions.length > 0) {
    return `${organizerConditions.slice(0, 2).join('・')}の条件に合い、今回の候補で一番まとめやすいです。`
  }
  return `今回の参加人数・エリア・条件のバランスがいちばんよい候補です。`
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
  'manualStore',
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
  const [appMode, setAppMode] = useState<AppMode>('full')
  const [eventType, setEventType] = useState<EventType>('歓迎会')
  const [eventName, setEventName] = useState('')

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
  const [showPrioritySheet, setShowPrioritySheet] = useState(false)
  const [showResponseTable, setShowResponseTable] = useState(false)
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
  /** store_only で選んだ店をフルフローに引き継ぐための一時 state。resetFlowState でクリアする。 */
  const [prefilledStore, setPrefilledStore] = useState<StoreCandidate | null>(null)
  /** true のとき organizerConditions をスキップして storeSuggestion で軸候補のみ表示する。 */
  const [skipStoreCondition, setSkipStoreCondition] = useState(false)
  const [previousStores, setPreviousStores] = useState<StoreCandidate[]>([])
  const [previousSelectedStoreId, setPreviousSelectedStoreId] = useState<string>('')
  const [isLoadingStores, setIsLoadingStores] = useState(false)
  const [storeFetchError, setStoreFetchError] = useState('')
  /** Condition-relaxation notes from Gemini (e.g. walk expanded, price widened) */
  const [storeSelectNotes, setStoreSelectNotes] = useState<string[]>([])
  /** True when Google Places returned fallback (quota / unavailable). Ratings are hidden; candidates still shown. */
  const [placesFallback, setPlacesFallback] = useState(false)
  const [eventDetail, setEventDetail] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [showStartSheet, setShowStartSheet] = useState(false)

  // ── 清算 state ──────────────────────────────────────────────────────────────
  const [settlementDraft, setSettlementDraft] = useState<SettlementDraft | null>(null)
  const [settlementConfig, setSettlementConfig] = useState<SettlementConfig | null>(null)
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null)
  const [settlementMessage, setSettlementMessage] = useState('')
  const [settlementCopied, setSettlementCopied] = useState(false)
  const [organizerSettings, setOrganizerSettings] = useState<OrganizerSettings>(() => loadOrganizerSettings())
  const [userSettings, setUserSettings] = useState<UserSettings>(() => loadUserSettings())

  // ── スプラッシュ ─────────────────────────────────────────────────────────────
  const [showSplash, setShowSplash] = useState(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    setUserSettings(loadUserSettings())
    // クラウドからもロードしてマージする（クラウド側を優先）
    // データがなければ localStorage の値をそのまま使う
    void loadUserSettingsCloud().then((cloud) => {
      if (!cloud) return
      setUserSettings((prev) => ({
        ...prev,
        favoriteStores: cloud.favoriteStores.length > 0 ? cloud.favoriteStores : prev.favoriteStores,
        pastEventRecords: cloud.pastEventRecords.length > 0 ? cloud.pastEventRecords : prev.pastEventRecords,
      }))
    })
    void trackEvent('app_open')
    const t = setTimeout(() => setShowSplash(false), 1800)
    return () => clearTimeout(t)
  }, [])

  // ── 手動店舗 state ───────────────────────────────────────────────────────────
  const [isManualStore, setIsManualStore] = useState(false)
  const [manualStoreName, setManualStoreName] = useState('')
  const [manualStoreUrl, setManualStoreUrl] = useState('')
  const [manualStoreMemo, setManualStoreMemo] = useState('')
  // 手動検索
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [manualSearchStation, setManualSearchStation] = useState('')
  const [manualSearchResults, setManualSearchResults] = useState<{ id: string; name: string; area: string; access: string; genre: string; link: string; image: string }[]>([])
  const [manualSearchLoading, setManualSearchLoading] = useState(false)
  const [manualSearchError, setManualSearchError] = useState('')
  const [manualSearchSelectedId, setManualSearchSelectedId] = useState('')

  const stepHistoryRef = useRef<Step[]>(['home'])
  const isHandlingBackRef = useRef(false)

  const openLineShare = (text: string) => {
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const [reminderCopied, setReminderCopied] = useState(false)
  const [showReminderPanel, setShowReminderPanel] = useState(false)
  const [editableFinalShareText, setEditableFinalShareText] = useState('')
  // 会作成中の開始感演出
  const [showCreating, setShowCreating] = useState(false)
  // 完了済みの会 詳細モーダル
  const [completedEventDetail, setCompletedEventDetail] = useState<import('@/app/lib/user-settings').PastEventRecord | null>(null)
  const [showDetailParticipants, setShowDetailParticipants] = useState(false)
  // manual store お気に入りパネル
  const [showFavoritePicker, setShowFavoritePicker] = useState(false)
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

  // ── 長押し削除 state ────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'ongoing'; id: string; name: string } |
    { type: 'completed'; id: string; title: string } |
    null
  >(null)
  const [toastVisible, setToastVisible] = useState(false)
  const longPressFiredRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

// ── 長押し削除 ────────────────────────────────────────────────────────────────

const LONG_PRESS_MS = 500

/** 長押しイベントハンドラーを生成する。スクロール検知でキャンセル。 */
function makeLongPressHandlers(onLongPress: () => void) {
  return {
    onTouchStart: () => {
      longPressFiredRef.current = false
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onTouchMove: () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    },
    onTouchEnd: () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    },
    onMouseDown: () => {
      longPressFiredRef.current = false
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onMouseMove: () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    },
    onMouseUp: () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    },
    onMouseLeave: () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    },
  }
}

/** 削除後トーストを 1.8 秒表示する */
function triggerDeleteToast() {
  setToastVisible(true)
  setTimeout(() => setToastVisible(false), 1800)
}

/** 完了済みレコードをローカル + クラウドから削除する */
function deletePastRecord(id: string) {
  applyUserSettings({
    ...userSettings,
    pastEventRecords: userSettings.pastEventRecords.filter((r) => r.id !== id),
  })
  void removePastEventCloud(id)
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
    cutoff.setDate(today.getDate() + 1) // 明日から選べる
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

// 選択中の日程が BEST候補かどうか
const heroIsBest = heroBestDateId === null || heroDate?.id === recommendedDate?.date?.id

const heroDateReason = (() => {
  if (!heroDate) return ''
  const total = activeParticipants.length
  if (total === 0) return ''
  const hYes = activeParticipants.filter(p => p.availability?.[heroDate.id] === 'yes').length
  const hMaybe = activeParticipants.filter(p => p.availability?.[heroDate.id] === 'maybe').length

  // 主賓の参加可否を選択中の日程に対して直接計算
  let heroMga: Availability | null = null
  if (mainGuestIds.length > 0) {
    const mgAvails = mainGuestIds
      .map(id => activeParticipants.find(p => p.id === id)?.availability?.[heroDate.id])
      .filter((a): a is Availability => a !== undefined)
    if (mgAvails.length > 0) {
      if (mgAvails.every(a => a === 'yes')) heroMga = 'yes'
      else if (mgAvails.some(a => a === 'no')) heroMga = 'no'
      else heroMga = 'maybe'
    }
  }

  return buildDateReason({
    mainGuestAvailability: heroMga,
    availableCount: hYes,
    maybeCount: hMaybe,
    totalCount: total,
    eventType,
    isBest: heroIsBest,
  })
})()


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
  // 進行中の会を event-store.ts 経由でロード（直接 localStorage を触らない）
  setSavedEvents(loadSavedEvents())
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
    ? generateShareText(eventType, selectedStore, organizerConditions, eventName || undefined)
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

// ── 進行中の会 更新ヘルパー ──────────────────────────────────────────────────
// localStorage への直接アクセスは event-store.ts に委譲する。
// 命名は「何をしているか」ベースで、保存先（localStorage / Supabase）に依存しない。

/** 進行中イベントを保存する（新規追加 or 上書き） */
function saveCurrentEventProgress(id: string, name: string, type: string) {
  setSavedEvents(prev => persistSavedEvent(prev, id, name, type))
}

/** 進行中イベントのフェーズ・店舗情報を更新する */
function updateEventStatus(
  id: string,
  status: NonNullable<SavedEvent['status']>,
  confirmedDateId?: string,
  storeInfo?: Pick<SavedEvent, 'isManualStore' | 'storeName' | 'storeUrl' | 'storeMemo' | 'storeId' | 'storeArea'>
) {
  setSavedEvents(prev => updateSavedEventStatus(prev, id, status, confirmedDateId, storeInfo))
}

/** 進行中イベントを削除する（清算完了後に呼ぶ） */
function removeCurrentSavedEvent(id: string) {
  setSavedEvents(prev => removeSavedEvent(prev, id))
}

// ── 設定保存ヘルパー ─────────────────────────────────────────────────────────
// 保存と state 更新を常にセットで行う。片方だけ更新する事故を防ぐ。
// CLOUD-MIGRATION: saveUserSettings / saveOrganizerSettings の実装を差し替えるだけで移行可能。

/** ユーザー設定を更新して保存する */
function applyUserSettings(next: UserSettings) {
  saveUserSettings(next)
  setUserSettings(next)
}

/** 幹事設定を更新して保存する */
function applyOrganizerSettings(next: OrganizerSettings) {
  saveOrganizerSettings(next)
  setOrganizerSettings(next)
}

// ── フロー state 初期化ヘルパー ──────────────────────────────────────────────
// 会を切り替えるとき / 新規作成するときに呼ぶ。
// 「どの state が per-event スコープか」が一箇所で分かるようにする。

/**
 * 手動店舗の入力状態をリセットする。
 * manualStore step に入るとき・別の会を開くときに必ず呼ぶ。
 */
function resetManualStoreState() {
  setIsManualStore(false)
  setManualStoreName('')
  setManualStoreUrl('')
  setManualStoreMemo('')
  setManualSearchQuery('')
  setManualSearchStation('')
  setManualSearchResults([])
  setManualSearchError('')
  setManualSearchSelectedId('')
}

/**
 * フロー全体の per-event state をリセットする。
 * 別の会を開く・新規作成するときに前の会の情報が混入しないよう呼ぶ。
 */
function resetFlowState() {
  setHeroBestDateId(null)
  setRecommendedStores([])
  setPrefilledStore(null)
  setSkipStoreCondition(false)
  setFinalDecision(null)
  setMainGuestIds([])
  setShowHeroParticipants(false)
  setShowAltDates(false)
  resetManualStoreState()
}

/**
 * 清算完了後にホームへ戻るときの UI state を掃除する。
 * 完了済みレコードや userSettings は保持したまま、フロー中間状態だけ捨てる。
 */
function resetFlowStateAfterCompletion() {
  resetFlowState()
  setSettlementDraft(null)
  setSettlementConfig(null)
  setSettlementResult(null)
  setSettlementMessage('')
  setCreatedEventId('')
  setEventName('')
  setDbDates([])
  setDbResponses([])
  setFinalDates([])
  setFinalEvent(null)
}

/**
 * SavedEvent に記録された手動店舗情報を state に復元する。
 * openSavedEvent の store_confirmed 分岐で使う。
 */
function restoreManualStoreState(savedEv: SavedEvent) {
  setIsManualStore(true)
  setManualStoreName(savedEv.storeName ?? '')
  setManualStoreUrl(savedEv.storeUrl ?? '')
  setManualStoreMemo(savedEv.storeMemo ?? '')
}

/**
 * SavedEvent に記録された AI 推薦店情報を最小限の StoreCandidate として復元する。
 * openSavedEvent の store_confirmed 分岐で使う。
 */
function restoreRecommendedStoreState(savedEv: SavedEvent) {
  setIsManualStore(false)
  const restored: StoreCandidate = {
    id: savedEv.storeId ?? 'restored',
    name: savedEv.storeName ?? '',
    link: savedEv.storeUrl ?? '',
    area: savedEv.storeArea ?? '',
    tags: [],
    access: '',
    image: '',
  }
  setRecommendedStores([restored])
  setSelectedStoreId(restored.id)
}

/**
 * AI 提案フローを開始する（organizerConditions CTA から呼ぶ）。
 * isManualStore を必ず false にリセットしてから店舗取得を行う。
 * 前提: heroDate（確定日程）が入っていること
 */
function startStoreSuggestion() {
  setIsManualStore(false)
  fetchRecommendedStores()
}

/**
 * ホームへ戻る。
 * フロー中間状態を掃除してから遷移する。
 * nav のロゴ / ホームアイコンから呼ぶ。
 */
function navigateHome() {
  resetFlowStateAfterCompletion()
  setAppMode('full')
  setStep('home')
}

/**
 * store_only フローを開始する（ホームの「お店の候補を見てみる」から呼ぶ）。
 * 会の作成なしで条件入力 → 店提案 → お気に入り登録のみを行う。
 */
function startStoreOnlyFlow() {
  setAppMode('store_only')
  setOrgPrefs({ priceRange: '指定なし', genres: [], privateRoom: '', areas: [] })
  orgPrefsInitRef.current = true // 参加者なしなので自動入力を抑制
  setStep('organizerConditions')
}

/**
 * manualStore step へ遷移する。
 * isManualStore フラグのセットと入力欄のクリアをまとめて行う。
 * orgPrefs.areas[0] を初期駅名として引き継ぐ（ユーザーが設定した条件を活かす）。
 */
function enterManualStoreStep() {
  setIsManualStore(true)
  setManualStoreName('')
  setManualStoreUrl('')
  setManualStoreMemo('')
  setManualSearchQuery('')
  setManualSearchStation(orgPrefs.areas[0] ?? '')
  setManualSearchResults([])
  setManualSearchError('')
  setManualSearchSelectedId('')
  setStep('manualStore')
}

/**
 * 保存済みの会を開く。
 *
 * フロー:
 *   1. フロー全体の state をリセット（前の会の情報が混入しないよう）
 *   2. Supabase から日程・回答データを取得
 *   3. 保存されたフェーズ（status）に応じてステップを復元
 *      - date_pending  → dashboard（回答収集中）
 *      - store_pending → organizerConditions（日程確定済み、店未選択）
 *      - store_confirmed → finalConfirm（店も確定済み）
 */
async function openSavedEvent(id: string, name: string, type: string) {
  setCreatedEventId(id)
  setEventName(name)
  setEventType(type as EventType)

  // 前の会の state をすべてリセット（per-event scope の state）
  resetFlowState()

  // 保存されたフェーズ情報を読む
  const savedEv = savedEvents.find(e => e.id === id)
  const status = savedEv?.status ?? 'date_pending'
  const confirmedDateId = savedEv?.confirmedDateId ?? null

  try {
    const result = await loadEventData(id)
    setDbDates(result.dates ?? [])
    setDbResponses(result.responses ?? [])

    if (status === 'store_pending' && confirmedDateId) {
      // 日程確定済み・店未選択 → 店探しから再開
      setHeroBestDateId(confirmedDateId)
      orgPrefsInitRef.current = false // participantMajority useEffect を再実行させる
      setStep('organizerConditions')

    } else if (status === 'store_confirmed') {
      // 店も確定済み → 最終確認から再開（決定内容 + 店舗情報を復元）
      try {
        const dr = await loadDecision(id)
        const decision = dr?.decision ?? null
        setFinalDecision(decision)
        setFinalDates(dr?.dates ?? result.dates ?? [])
        setFinalEvent(dr?.event ?? null)
        if (decision?.selected_date_id) setHeroBestDateId(decision.selected_date_id)

        // 店舗状態を復元（手動入力 or AI 推薦）
        if (savedEv?.isManualStore) {
          restoreManualStoreState(savedEv)
        } else if (savedEv?.storeName) {
          restoreRecommendedStoreState(savedEv)
        }

        setStep('finalConfirm')
      } catch {
        // loadDecision 失敗 → dateConfirmed へ fallback
        if (confirmedDateId) setHeroBestDateId(confirmedDateId)
        setStep('dateConfirmed')
      }

    } else {
      // date_pending or unknown → 回答収集画面
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
  // 直前候補を保存してから更新
  setPreviousStores(recommendedStores)
  setPreviousSelectedStoreId(selectedStoreId)
  const currentIds = recommendedStores.map((s) => s.id)
  await fetchRecommendedStores(currentIds)
}

// 手動店名検索（Hot Pepper）
async function runManualSearch() {
  const query = manualSearchQuery.trim()
  if (!query) return
  setManualSearchLoading(true)
  setManualSearchError('')
  setManualSearchResults([])
  setManualSearchSelectedId('')
  try {
    const res = await fetch('/api/hotpepper/manual-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, station: manualSearchStation.trim() }),
    })
    const data = await res.json()
    if (data.error) {
      setManualSearchError(data.error)
    } else {
      setManualSearchResults(data.results ?? [])
      if ((data.results ?? []).length === 0) {
        setManualSearchError('一致する候補が見つかりませんでした。店名をそのまま入力して進めることもできます。')
      }
    }
  } catch {
    setManualSearchError('検索に失敗しました。')
  } finally {
    setManualSearchLoading(false)
  }
}

// 手動検索候補を選択
function selectManualSearchResult(item: { id: string; name: string; link: string }) {
  setManualStoreName(item.name)
  setManualStoreUrl(item.link)
  setManualSearchSelectedId(item.id)
}

// 1つ前の候補に戻る
function restorePreviousStores() {
  if (previousStores.length === 0) return
  setRecommendedStores(previousStores)
  setSelectedStoreId(previousSelectedStoreId || previousStores[0]?.id || '')
  setPreviousStores([])
  setPreviousSelectedStoreId('')
}

// excludeIds: 再取得時に除外したい店のID一覧（「候補を入れ替える」用）
async function fetchRecommendedStores(excludeIds: string[] = []) {
  if (appMode === 'full' && !heroDate) {
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

    void trackEvent('view_store_suggestion')
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

/**
 * @param storeOverride  prefilledStore など、state 外から直接渡したい店。
 *                       省略時は selectedStore（通常フロー）を使う。
 */
async function loadFinalDecisionView(storeOverride?: StoreCandidate) {
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

    // prefilledStore が採用されたタイミングでクリア
    setPrefilledStore(null)

    void trackEvent('confirm_store')
    setStep('finalConfirm')
    // Persist status + store info so openSavedEvent can resume at finalConfirm next time
    const resolvedStore = storeOverride ?? selectedStore
    const storeInfo: Pick<SavedEvent, 'isManualStore' | 'storeName' | 'storeUrl' | 'storeMemo' | 'storeId' | 'storeArea'> = isManualStore && !storeOverride
      ? { isManualStore: true, storeName: manualStoreName, storeUrl: manualStoreUrl, storeMemo: manualStoreMemo }
      : { isManualStore: false, storeId: storeOverride?.id ?? selectedStoreId, storeName: resolvedStore?.name ?? '', storeUrl: resolvedStore?.link ?? '', storeArea: resolvedStore?.area ?? '' }
    updateEventStatus(currentEventId, 'store_confirmed', undefined, storeInfo)
  } catch (e: any) {
    alert(`最終確認データの取得に失敗しました: ${e?.message ?? 'unknown error'}`)
  }
}

// manual store から「この内容で進む」 — 店情報を保存してから finalConfirm へ
function confirmManualStore() {
  const currentEventId = createdEventId || finalEvent?.id
  if (currentEventId) {
    updateEventStatus(currentEventId, 'store_confirmed', undefined, {
      isManualStore: true,
      storeName: manualStoreName,
      storeUrl: manualStoreUrl,
      storeMemo: manualStoreMemo,
    })
  }
  setStep('finalConfirm')
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

const reminderText = `${eventName || 'この会'}の日程調整、まだの方だけ回答お願いします🙏
1分くらいで終わります！

${shareUrl}`

const dateConfirmedShareText =
  heroDate
    ? `${eventName || 'この会'}の日程が決まりました👇\n\n日程：${heroDate.label}`
    : ''

const maybeConfirmText =
  heroDate && maybeNames.length > 0
    ? `${eventName || 'この会'}の日程ですが、この日で進めようと思っています！\n問題なさそうなら確定したいです🙏\n\n日程：${heroDate.label}`
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
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { if (step !== 'finalConfirm') setEditableFinalShareText('') }, [step])

// ── 戻るナビゲーション — 各stepに対応する前のstepを返す ──────────────────────
// FLOW_STEPSの順番と異なる特殊ケースのみ上書き
const backStep: Step | null = (() => {
  if (step === 'shared') return null
  if (step === 'settings') return 'home'
  if (step === 'manualStore') return 'organizerConditions'
  if (step === 'finalConfirm') return isManualStore ? 'manualStore' : 'storeSuggestion'
  if (step === 'organizerConditions' && appMode === 'store_only') return 'home'
  if (step === 'storeSuggestion' && skipStoreCondition && !!prefilledStore) return 'dateConfirmed'
  return getPreviousStep(step)
})()



return (
  <>
  <AnimatePresence>
    {showSplash && (
      <motion.div
        key="splash"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
        style={{ background: '#1C1917' }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      >
        {/* アイコン */}
        <motion.div
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-[28px] bg-stone-800 ring-1 ring-white/10"
        >
          <div className="flex flex-col items-center gap-0.5">
            <CalendarDays size={28} className="text-white/80" strokeWidth={1.8} />
            <span className="text-[17px] font-black tracking-tight text-white">幹事</span>
          </div>
        </motion.div>
        {/* アプリ名 */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="text-[13px] font-bold tracking-[0.18em] text-white/40 uppercase"
        >
          KANJI
        </motion.p>
      </motion.div>
    )}
  </AnimatePresence>
  <main className="min-h-screen" style={{ background: '#111111' }}>
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-20 pt-6 sm:px-5">
      {/* ── グローバルナビ + ステップバー — ホーム以外で sticky 表示 ─────────── */}
      {step !== 'home' && (
        <div className="sticky top-0 z-40 -mx-4 sm:-mx-5 mb-5 border-b border-white/8 bg-[#111111]/95 px-4 pb-2 pt-3 backdrop-blur-sm sm:px-5">
          <header className="flex h-8 items-center justify-between">
            {/* 左: 戻るナビゲーション */}
            {backStep ? (
              <button
                type="button"
                onClick={() => {
                  if (backStep === 'home') {
                    setAppMode('full')
                  }
                  setStep(backStep)
                }}
                className="-ml-2 flex h-8 w-8 items-center justify-center rounded-xl text-stone-400 transition hover:text-stone-700 active:scale-95"
                aria-label="戻る"
              >
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
            ) : (
              <div className="w-8" />
            )}

            {/* 中央: ワードマーク */}
            <button
              type="button"
              onClick={navigateHome}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-stone-400 transition hover:text-stone-600"
            >
              <CalendarDays size={11} strokeWidth={2.5} />
              Kanji
            </button>

            {/* 右: ホームアイコン */}
            <button
              type="button"
              onClick={navigateHome}
              className="-mr-2 flex h-8 w-8 items-center justify-center rounded-xl text-stone-400 transition hover:text-stone-700 active:scale-95"
              aria-label="ホーム"
            >
              <House size={17} strokeWidth={2} />
            </button>
          </header>

          {/* ステップバー */}
          {showProgress && (
            <div className="mt-2">
              <FlowProgress step={step} />
            </div>
          )}
        </div>
      )}

      

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
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900">
                    <CalendarDays size={17} className="text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-[13px] font-black tracking-[0.25em] text-stone-900 uppercase">Kanji</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('settings')}
                  className="-mr-1 flex h-9 w-9 items-center justify-center rounded-xl text-stone-400 transition hover:text-stone-700 active:scale-95"
                  aria-label="設定"
                >
                  <Settings size={17} strokeWidth={2} />
                </button>
              </div>

              {/* キャッチコピー */}
              <h1 className="text-[28px] font-black leading-[1.2] tracking-tight text-stone-900">
                幹事、これ1つで終わる。
              </h1>
              <p className="mt-2.5 text-sm leading-6 text-stone-700">
                日程調整・お店決め・会計共有までまとめて。<br className="sm:hidden" />
              
              </p>
            </motion.div>

            {/* ── 進行中の会 ─────────────────────────────────────── */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <CircleDashed size={12} className="text-stone-400" strokeWidth={2.5} />
                <p className="text-[11px] font-black tracking-[0.2em] text-stone-400 uppercase">進行中</p>
              </div>
              {savedEvents.length > 0 ? (
                <div className="space-y-2.5">
                  {savedEvents.map((ev, idx) => {
                    const s = ev.status ?? 'date_pending'
                    const statusCfg =
                      s === 'store_confirmed'
                        ? { label: '清算する →', cls: 'bg-orange-50 text-orange-700 ring-orange-200', Icon: Receipt }
                        : s === 'store_pending'
                        ? { label: '次：お店を決める', cls: 'bg-stone-100 text-stone-500 ring-stone-300', Icon: CircleDashed }
                        : { label: '次：日程を決める', cls: 'bg-stone-50 text-stone-500 ring-stone-200', Icon: Clock }
                    const { Icon: StatusIcon } = statusCfg
                    return (
                      <motion.button
                        type="button"
                        key={ev.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.05, ease: 'easeOut' }}
                        whileTap={{ scale: 0.982 }}
                        {...makeLongPressHandlers(() => setDeleteTarget({ type: 'ongoing', id: ev.id, name: ev.name }))}
                        onClick={() => {
                          if (longPressFiredRef.current) { longPressFiredRef.current = false; return }
                          openSavedEvent(ev.id, ev.name, ev.eventType)
                        }}
                        className="group flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-stone-100/80 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-50 ring-1 ring-stone-100">
                            <CalendarDays size={15} className="text-stone-500" strokeWidth={2} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-black tracking-tight text-stone-900">{ev.name}</p>
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
                </motion.div>
              )}
            </section>

            {/* ── 完了済みの会 ─────────────────────────────────── */}
            {mounted && (
              <section className="mt-6">
                {/* 完了済みの会の一覧
                    表示ソース: userSettings.pastEventRecords（saveCompletionData で追加）
                    各レコードは buildPastEventRecord で生成し、settlementConfirm 完了時に保存される
                    CLOUD-MIGRATION: Supabase past_events テーブルから SELECT に差し替え予定 */}
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-stone-300" strokeWidth={2.5} />
                  <p className="text-[11px] font-black tracking-[0.2em] text-stone-300 uppercase">完了済み</p>
                </div>
                {userSettings.pastEventRecords.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-200/70 px-6 py-8 text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100/80">
                      <CheckCircle2 size={17} className="text-stone-300" strokeWidth={1.8} />
                    </div>
                    <p className="text-sm font-bold text-stone-400">まだ完了済みの会はありません</p>
                    <p className="mt-1.5 text-xs leading-5 text-stone-400">
                      精算後に会を完了すると、ここに記録が残ります
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userSettings.pastEventRecords.slice(0, 5).map((record, idx) => (
                      <motion.button
                        type="button"
                        key={record.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: idx * 0.04 }}
                        whileTap={{ scale: 0.984 }}
                        {...makeLongPressHandlers(() => setDeleteTarget({ type: 'completed', id: record.id, title: record.title }))}
                        onClick={() => {
                          if (longPressFiredRef.current) { longPressFiredRef.current = false; return }
                          setCompletedEventDetail(record); setShowDetailParticipants(false)
                        }}
                        className="flex w-full items-center justify-between rounded-2xl bg-stone-50 px-4 py-3.5 text-left ring-1 ring-stone-100 transition hover:bg-white hover:shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-stone-100">
                            <CheckCircle2 size={13} className="text-stone-300" strokeWidth={2} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-stone-600">{record.title}</p>
                            <p className="text-[11px] text-stone-400">
                              {record.eventDate}
                              {record.storeName ? `　${record.storeName}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="ml-2 flex shrink-0 items-center gap-1.5">
                          {record.memo && (
                            <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-[9px] font-bold text-stone-500">メモ</span>
                          )}
                          {record.hasPhoto && (
                            <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-[9px] font-bold text-stone-500">写真</span>
                          )}
                          <ChevronRight size={12} className="text-stone-300" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </motion.div>
        )}

        {/* 会作成 開始感オーバーレイ */}
        <AnimatePresence>
          {showCreating && (
            <motion.div
              key="creating"
              className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-[#111111]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.18, ease: 'easeOut' }}
                className="flex flex-col items-center gap-3"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900">
                  <CalendarPlus size={20} className="text-white" strokeWidth={2} />
                </div>
                <p className="text-[15px] font-black tracking-tight text-stone-900">会を作成しました</p>
                <p className="text-[12px] text-stone-400">準備を始めましょう</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 完了済みの会 詳細モーダル */}
        <AnimatePresence>
          {completedEventDetail && (
            <motion.div
              key="completed-detail"
              className="fixed inset-0 z-[200] flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* 背景 */}
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setCompletedEventDetail(null)}
              />
              {/* シート */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-10 pt-6 shadow-2xl max-w-xl mx-auto"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              >
                {/* ハンドル */}
                <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-stone-200" />
                <div className="mb-1 flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-stone-300" strokeWidth={2.5} />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">完了済み</p>
                </div>
                <h3 className="text-xl font-black tracking-tight text-stone-900">{completedEventDetail.title}</h3>
                <div className="mt-5 space-y-4">
                  {/* 日時 */}
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-50 ring-1 ring-stone-100">
                      <CalendarDays size={14} className="text-stone-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">日時</p>
                      <p className="mt-0.5 text-sm font-bold text-stone-800">{completedEventDetail.eventDate || '—'}</p>
                    </div>
                  </div>
                  {/* お店 + お気に入りトグル */}
                  {completedEventDetail.storeName && (() => {
                    const storeKey = completedEventDetail.storeId ?? completedEventDetail.storeName
                    const isFav = userSettings.favoriteStores.some(f => f.id === storeKey)
                    const handleToggleFav = () => {
                      const { next } = toggleFavoriteStore(
                        userSettings,
                        {
                          id: storeKey,
                          name: completedEventDetail.storeName,
                          area: completedEventDetail.storeArea ?? '',
                          genre: completedEventDetail.storeGenre ?? '',
                          link: completedEventDetail.storeLink ?? '',
                        },
                        isFav,
                      )
                      setUserSettings(next)
                    }
                    return (
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-stone-100">
                            <UtensilsCrossed size={14} className="text-stone-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">お店</p>
                            <p className="mt-0.5 truncate text-sm font-bold text-stone-800">{completedEventDetail.storeName}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleFav}
                          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                            isFav
                              ? 'bg-rose-100 text-rose-600 ring-1 ring-rose-200'
                              : 'bg-white text-stone-500 ring-1 ring-stone-200'
                          }`}
                        >
                          <Heart
                            size={11}
                            strokeWidth={2.5}
                            className={isFav ? 'fill-rose-500 text-rose-500' : ''}
                          />
                          {isFav ? 'お気に入り済み' : 'お気に入り'}
                        </button>
                      </div>
                    )
                  })()}
                  {/* 参加者（展開式） */}
                  {completedEventDetail.participants && completedEventDetail.participants.length > 0 && (
                    <div className="overflow-hidden rounded-2xl bg-stone-50 ring-1 ring-stone-100">
                      <button
                        type="button"
                        onClick={() => setShowDetailParticipants(v => !v)}
                        className="flex w-full items-center justify-between px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <Users size={13} className="text-stone-400" strokeWidth={2} />
                          <span className="text-sm font-bold text-stone-700">参加者を見る</span>
                          <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-500">
                            {completedEventDetail.participants.length}名
                          </span>
                        </div>
                        <ChevronDown
                          size={14}
                          className={`text-stone-400 transition-transform duration-200 ${showDetailParticipants ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <AnimatePresence>
                        {showDetailParticipants && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-wrap gap-1.5 border-t border-stone-100 px-4 pb-3.5 pt-3">
                              {completedEventDetail.participants.map((name) => (
                                <span
                                  key={name}
                                  className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-stone-700 ring-1 ring-stone-200"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  {/* メモ */}
                  {completedEventDetail.memo && (
                    <div className="rounded-2xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100">
                      <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-stone-400">メモ</p>
                      <p className="text-sm leading-6 text-stone-700 whitespace-pre-line">{completedEventDetail.memo}</p>
                    </div>
                  )}
                  {/* 写真 */}
                  {completedEventDetail.hasPhoto && (
                    completedEventDetail.photoDataUrl ? (
                      <div>
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">写真</p>
                        <img
                          src={completedEventDetail.photoDataUrl}
                          alt="会の写真"
                          className="w-full max-h-60 rounded-2xl object-contain ring-1 ring-stone-100"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
                        <ImagePlus size={13} className="text-stone-400" />
                        <p className="text-sm text-stone-500">写真（データなし）</p>
                      </div>
                    )
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCompletedEventDetail(null)}
                  className="mt-6 w-full rounded-2xl bg-stone-100 py-3 text-sm font-bold text-stone-600 transition hover:bg-stone-200 active:scale-[0.98]"
                >
                  閉じる
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            設定
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'settings' && (
          <SettingsScreen
            settings={userSettings}
            onSettingsChange={(s) => applyUserSettings(s)}
            organizerName={organizerSettings.organizerName}
            onOrganizerNameChange={(name) => {
              applyOrganizerSettings({ ...organizerSettings, organizerName: name })
            }}
          />
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
              <p className="text-[10px] font-black tracking-[0.22em] text-stone-400 uppercase">Step 1</p>
            </div>
            <h2 className="text-[22px] font-black tracking-tight text-stone-900">候補日を選ぶ</h2>
          </div>
          <Card>

            <div>
              <FieldLabel>イベント名</FieldLabel>
              <input
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder="例：歓迎会 / ごはん会"
                className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
              />
            </div>

            {/* 候補日選択 */}
            <div className="mt-6 border-t border-stone-100 pt-5">
              <div className="mt-3 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
                <p className="text-xs font-bold text-stone-600">開始時間</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <select
                    value={selectedHour}
                    onChange={(e) => setSelectedHour(e.target.value)}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-base font-bold text-stone-700 outline-none transition focus:border-stone-400"
                  >
                    {['17', '18', '19', '20', '21', '22', '23'].map((hour) => (
                      <option key={hour} value={hour}>{hour}時</option>
                    ))}
                  </select>
                  <select
                    value={selectedMinute}
                    onChange={(e) => setSelectedMinute(e.target.value)}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-base font-bold text-stone-700 outline-none transition focus:border-stone-400"
                  >
                    {['00', '15', '30', '45'].map((minute) => (
                      <option key={minute} value={minute}>{minute}分</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-end">
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
                    c.setDate(t.getDate() + 1) // 明日から
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

          </Card>
          </motion.div>
        )}
        {/* ── 会を作る sticky CTA ── */}
        {(step === 'create' || step === 'dates') && (
          <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4 sm:-mx-5 sm:px-5">
            {!eventName.trim() && (
              <p className="mb-2 text-center text-[11px] text-stone-400">会の名前を入力してください</p>
            )}
            {eventName.trim() && selectedDateIds.length === 1 && (
              <p className="mb-2 text-center text-[11px] text-stone-400">候補日は2日以上選んでください</p>
            )}
            <PrimaryBtn
              size="large"
              disabled={!eventName.trim() || selectedDateIds.length < 2}
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

                // 開始感演出（作成APIと並行して表示）
                setShowCreating(true)

                const eventId = await createEvent(
                  eventName,
                  eventType,
                  selectedDates.map((d) => d.label)
                )
                setCreatedEventId(eventId)
                saveCurrentEventProgress(eventId, eventName, eventType)
                void trackEvent('create_event')

                // 演出を短時間見せてから遷移
                setTimeout(() => {
                  setShowCreating(false)
                  setStep('shareLink')
                }, 200)
              }}
            >
              {selectedDateIds.length === 0
                ? '候補日を選んでください'
                : selectedDateIds.length === 1
                  ? 'もう1日以上選んでください'
                  : `この${selectedDateIds.length}件で作成`}
            </PrimaryBtn>
          </div>
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
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 2</p>
    </div>
    <h2 className="text-[22px] font-black tracking-tight text-stone-900">日程調整を送る</h2>
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
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
              value={editableShareMessage}
              onChange={(e) => { setEditableShareMessage(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px' }}
              className="w-full resize-none overflow-hidden text-base leading-6 text-stone-700 outline-none"
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
          {copied ? 'コピーしました' : 'コピー'}
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
    <div className="flex items-start justify-between px-0.5">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
            <CalendarDays size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 3</p>
        </div>
        <h2 className="text-[22px] font-black tracking-tight text-stone-900">日程を決める</h2>
      </div>
      <button
        type="button"
        onClick={() => setShowPrioritySheet(true)}
        className={`mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold ring-1 transition active:scale-95 ${
          mainGuestIds.length > 0
            ? 'bg-emerald-500 text-white ring-emerald-500'
            : 'bg-white text-stone-500 ring-stone-200 hover:bg-stone-50'
        }`}
      >
        <Users size={11} strokeWidth={2.5} />
        優先
        {mainGuestIds.length > 0 && (
          <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[10px] font-black">
            {mainGuestIds.length}
          </span>
        )}
      </button>
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
        {/* 決定候補ヒーロー */}
        <div
          className="overflow-hidden rounded-3xl ring-1 ring-white/10"
          style={{ background: 'linear-gradient(160deg, #1e3a22 0%, #0e1c10 100%)' }}
        >
          {/* 上部ゴールドライン */}
          <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <div className="px-6 py-5">
            {/* ラベル */}
            <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: 'rgba(214,175,60,0.65)' }}>
              {heroIsBest ? 'Recommended Date' : 'Alternative Date'}
            </p>
            {/* 日付（ゴールド） */}
            <p className="mt-2 text-[32px] font-black leading-tight tracking-tight" style={{ color: '#d4af3c' }}>
              {heroDate?.label}
            </p>
            {/* 参加統計 */}
            <p className="mt-1.5 text-sm font-bold text-white/60">
              {yesCount}/{activeParticipants.length} confirmed
              {maybeCount > 0 ? `, ${maybeCount} pending` : ''}
            </p>
            {/* 判断理由 */}
            {heroDateReason && (
              <p className="mt-2 text-[13px] leading-snug text-white/45">{heroDateReason}</p>
            )}
            {/* 参加確定者アバター */}
            {heroYesParticipants.length > 0 && (
              <div className="mt-4">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/28">
                  Confirmed attendees
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {heroYesParticipants.slice(0, 6).map((p, i) => {
                    const avatarPalette = ['#374151','#1d4e2a','#6b4c11','#4c1d95','#7f1d1d','#0e4e6c']
                    return (
                      <div
                        key={p.id}
                        title={p.name}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white ring-1 ring-white/15"
                        style={{ background: avatarPalette[i % avatarPalette.length] }}
                      >
                        {p.name.charAt(0)}
                      </div>
                    )
                  })}
                  {heroYesParticipants.length > 6 && (
                    <span className="text-xs font-bold text-white/30">+{heroYesParticipants.length - 6}</span>
                  )}
                  <span className="ml-1 text-xs text-white/35">
                    {heroYesParticipants.slice(0, 3).map(p => p.name).join(', ')}
                    {heroYesParticipants.length > 3 ? '…' : ''}
                  </span>
                </div>
              </div>
            )}
            {/* 優先者表示 */}
            {mainGuestIds.length > 0 && (() => {
              const firstName = activeParticipants.find(p => p.id === mainGuestIds[0])?.name ?? ''
              const extra = mainGuestIds.length - 1
              return (
                <button
                  type="button"
                  onClick={() => setShowPrioritySheet(true)}
                  className="mt-3 flex items-center gap-1 text-[11px] font-bold text-white/35 transition hover:text-white/55"
                >
                  <Users size={10} strokeWidth={2.5} />
                  優先：{firstName}{extra > 0 ? ` +${extra}` : ''}
                </button>
              )
            })()}
            {/* 詳細トグル */}
            <button
              type="button"
              onClick={() => setShowHeroParticipants((v) => !v)}
              className="mt-3 text-[11px] font-bold underline underline-offset-2"
              style={{ color: 'rgba(214,175,60,0.55)' }}
            >
              {showHeroParticipants ? '参加者を閉じる' : '参加者を見る'}
            </button>
            {showHeroParticipants && (
              <div className="mt-4 space-y-2.5">
                <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/8">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/70">参加予定</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {heroYesParticipants.length > 0 ? (
                      heroYesParticipants.map((p) => (
                        <span key={p.id} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                          {p.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-white/35">まだいません</span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/8">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/70">調整中</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {heroMaybeParticipants.length > 0 ? (
                      heroMaybeParticipants.map((p) => (
                        <span key={p.id} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
                          {p.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-white/35">まだいません</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* 下部ステータスバー */}
          <div className="flex flex-wrap gap-2 bg-black/20 px-6 py-3.5">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
              参加予定 {yesCount}人
            </span>
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
              調整中 {maybeCount}人
            </span>
            {eventType && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/50">
                {eventType}
              </span>
            )}
          </div>
        </div>

        {/* ヒーロー直下 決定CTA */}
        <button
          type="button"
          onClick={decideRecommendedDate}
          className="w-full rounded-2xl py-4 text-[15px] font-black text-white transition active:scale-[0.98]"
          style={{
            background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)',
            boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)'
          }}
        >
          この日で決定 →
        </button>

        {/* ほかの日程（例外導線・リンクレベル） */}
        {altDates.length > 0 && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowAltDates((v) => !v)}
              className="text-[12px] text-stone-400 underline underline-offset-2 transition hover:text-stone-600"
            >
              {showAltDates ? 'ほかの日程を閉じる' : `ほかの日程も見る（${Math.min(altDates.length, 3)}件）`}
            </button>
            {showAltDates && (
              <div className="mt-3 space-y-2 text-left">
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
                      className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-stone-100 transition hover:bg-stone-50 active:scale-[0.99]"
                    >
                      <p className="text-sm font-bold text-stone-700">{d.label}</p>
                      <div className="ml-3 flex shrink-0 items-center gap-1.5">
                        <span className="text-xs font-bold text-emerald-600">○{dYes}</span>
                        <span className="text-xs font-bold text-amber-500">△{dMaybe}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 回答テーブル（デフォルト非表示・詳細確認用） */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowResponseTable((v) => !v)}
            className="text-[12px] text-stone-400 underline underline-offset-2 transition hover:text-stone-600"
          >
            {showResponseTable ? '回答テーブルを閉じる' : '回答テーブルを見る'}
          </button>
        </div>
        {showResponseTable && (
          <div className="overflow-hidden rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div
                  className="grid items-center gap-2 text-xs font-bold text-stone-500"
                  style={{ gridTemplateColumns: `92px repeat(${activeDates.length}, minmax(72px, 1fr))` }}
                >
                  <div>参加者</div>
                  {activeDates.map((date) => {
                    const isSelected = date.id === heroDate?.id
                    return (
                      <button
                        key={date.id}
                        type="button"
                        onClick={() => setHeroBestDateId(date.id)}
                        className={`rounded-lg px-1 py-1 text-left text-xs font-bold transition active:scale-95 ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                        }`}
                      >
                        {date.label}
                      </button>
                    )
                  })}
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
                            className={`flex h-9 items-center justify-center rounded-xl ring-1 ${
                              isHero ? 'bg-stone-50 ring-stone-200' : 'bg-white ring-stone-100'
                            }`}
                          >
                            {value === 'yes' ? (
                              <span className="text-[15px] font-black leading-none text-emerald-500">○</span>
                            ) : value === 'maybe' ? (
                              <span className="text-[15px] font-black leading-none text-amber-400">△</span>
                            ) : value === 'no' ? (
                              <span className="text-[14px] font-bold leading-none text-stone-300">×</span>
                            ) : (
                              <span className="text-[11px] text-stone-300">—</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* リマインド（折りたたみ） */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-100">
          <button
            type="button"
            onClick={() => setShowReminderPanel((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4"
          >
            <div className="flex items-center gap-1.5">
              <MessageSquareQuote size={11} className="text-stone-400" strokeWidth={2.5} />
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">リマインド</p>
            </div>
            {showReminderPanel
              ? <ChevronLeft size={14} className="rotate-90 text-stone-400" />
              : <ChevronRight size={14} className="-rotate-90 text-stone-400" />
            }
          </button>
          {showReminderPanel && (
            <div className="space-y-3 border-t border-stone-100 px-5 pb-5 pt-4">
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                {urlOnlyReminder ? (
                  <p className="text-sm text-stone-700">{shareUrl}</p>
                ) : (
                  <textarea
                    ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                    value={editableReminderText}
                    onChange={(e) => { setEditableReminderText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px' }}
                    className="w-full resize-none overflow-hidden bg-transparent text-base leading-6 text-stone-700 outline-none"
                  />
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 self-start">
                <input
                  type="checkbox"
                  checked={urlOnlyReminder}
                  onChange={(e) => setUrlOnlyReminder(e.target.checked)}
                  className="h-4 w-4 rounded accent-stone-900"
                />
                <span className="text-xs font-bold text-stone-500">URLのみ</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(urlOnlyReminder ? shareUrl : editableReminderText)
                    setReminderCopied(true)
                    setTimeout(() => setReminderCopied(false), 1600)
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
                >
                  {reminderCopied ? 'コピーしました' : 'コピー'}
                </button>
                <button
                  type="button"
                  onClick={() => openLineShare(urlOnlyReminder ? shareUrl : editableReminderText)}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
                >
                  LINEで送る
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    )}
  </motion.div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑥ 日程提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}




        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑦ 日程確定
            前提: heroDate（確定日程）— decideRecommendedDate で saveDecision 後に設定
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
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 4</p>
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">日程共有</h2>
    </div>

    {/* 確定日程 ヒーロー */}
    <div className="overflow-hidden rounded-3xl ring-1 ring-white/10" style={{ background: 'linear-gradient(160deg, #1e3a22 0%, #0e1c10 100%)' }}>
      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="px-6 py-6">
        <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: 'rgba(214,175,60,0.65)' }}>確定日程</p>
        <p className="mt-2 text-[32px] font-black leading-tight tracking-tight" style={{ color: '#d4af3c' }}>{heroDate?.label}</p>
        <p className="mt-1.5 text-sm font-bold text-white/60">最大参加人数 {yesCount + maybeCount}人</p>
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
      <div className="flex flex-wrap gap-2 bg-black/20 px-6 py-3.5">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
          参加予定 {yesCount}人
        </span>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
          調整中 {maybeCount}人
        </span>
        {eventType && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/50">
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
              className="w-full resize-none bg-transparent text-base leading-6 text-stone-700 outline-none"
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
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
            >
              {dateCopied ? 'コピーしました' : 'コピー'}
            </button>
            <button
              type="button"
              onClick={() => openLineShare(editableDateConfirmedText)}
              className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
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
                  className="w-full resize-none bg-transparent text-base leading-6 text-stone-700 outline-none"
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
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
                >
                  {maybeCopied ? 'コピーしました' : 'コピー'}
                </button>
                <button
                  type="button"
                  onClick={() => openLineShare(editableMaybeConfirmText)}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
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

    <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4 sm:-mx-5 sm:px-5">
      <PrimaryBtn size="large" onClick={() => {
        if (skipStoreCondition && prefilledStore) {
          setStep('storeSuggestion')
        } else {
          setStep('organizerConditions')
        }
      }}>
        お店を決める
      </PrimaryBtn>
    </div>
  </motion.div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑧ 幹事条件設定
            前提: heroDate（確定日程）— この step は日程確定後にのみ到達する
                  orgPrefs は participantMajority useEffect で初期化済み（orgPrefsInitRef で1回のみ）
            CTA: startStoreSuggestion() → AI 提案フロー開始
                 enterManualStoreStep() → 手動入力フロー開始
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
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
                    <UtensilsCrossed size={13} className="text-white" strokeWidth={2.5} />
                  </div>
                  {appMode === 'store_only' ? (
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">お店探し</p>
                  ) : (
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 5</p>
                  )}
                </div>
              </div>
              <h2 className="text-[22px] font-black tracking-tight text-stone-900">お店の条件</h2>
            </div>

            {/* store_only から引き継がれた軸候補 — 条件選びの前提として表示 */}
            {prefilledStore && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="rounded-2xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-200"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                    <Sparkles size={9} strokeWidth={2.5} />
                    この会の軸候補
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrefilledStore(null)}
                    className="text-[10px] text-stone-400 transition hover:text-stone-600"
                  >
                    外す
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {prefilledStore.image ? (
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl">
                      <img src={prefilledStore.image} alt={prefilledStore.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                      <UtensilsCrossed size={16} className="text-amber-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-black tracking-tight text-stone-900">{prefilledStore.name}</p>
                    {prefilledStore.access && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-500">
                        <Train size={9} className="shrink-0" />
                        <span className="line-clamp-1">{prefilledStore.access}</span>
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-2.5 text-[11px] leading-5 text-amber-700/70">
                  この店を前提に駅・ジャンル・価格帯を調整してください。
                </p>
              </motion.div>
            )}

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
                        i === 0 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500'
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
                {/* 主ジャンル */}
                <div className="flex flex-wrap gap-2">
                  {HP_GENRE_OPTIONS.map(v => (
                    <Chip key={v} active={orgPrefs.genres[0] === v}
                      onClick={() => setOrgPrefs(p => ({
                        ...p,
                        genres: p.genres[0] === v ? [] : [v],
                      }))}>
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

            {/* CTA — sticky bottom */}
            <div className="sticky bottom-0 -mx-4 space-y-2 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4 sm:-mx-5 sm:px-5">
              <PrimaryBtn size="large" onClick={startStoreSuggestion}>
                {isLoadingStores ? '候補を探しています…' : 'この条件でお店を提案してもらう'}
              </PrimaryBtn>
              {appMode !== 'store_only' && (
                <button
                  type="button"
                  onClick={enterManualStoreStep}
                  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[13px] font-bold text-stone-500 transition hover:bg-stone-50 active:scale-[0.98]"
                >
                  自分でお店を探す
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨ 店提案（決断UI）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
{step === 'storeSuggestion' && (appMode === 'store_only' || heroDate || (skipStoreCondition && !!prefilledStore)) && (
  <div className="space-y-5">
    {/* 「候補を入れ替える」再取得中も同じローディングUIを使う */}
    {isLoadingStores && <StoreLoadingOverlay />}

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="px-0.5"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
            <UtensilsCrossed size={13} className="text-white" strokeWidth={2.5} />
          </div>
          {appMode === 'store_only' ? (
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">お店候補</p>
          ) : (skipStoreCondition && prefilledStore) ? (
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">この会の軸候補</p>
          ) : (
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 6</p>
          )}
        </div>
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">
        {(skipStoreCondition && prefilledStore) ? 'この店で始めますか？' : 'お店を選ぶ'}
      </h2>
    </motion.div>

    {(skipStoreCondition && prefilledStore) ? (
      /* ── 軸候補のみ表示（skip モード） ─────────────────────────── */
      <>
        <motion.div
          key={prefilledStore.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="overflow-hidden rounded-3xl bg-stone-900 shadow-lg shadow-stone-900/20"
        >
          {prefilledStore.image && (
            <div className="relative h-52 overflow-hidden sm:h-60">
              <img
                src={prefilledStore.image}
                alt={prefilledStore.name}
                className="h-full w-full object-cover object-center"
                style={{ filter: 'brightness(0.55)' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-stone-900/10 to-transparent" />
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm ring-1 ring-white/20">
                  <Sparkles size={9} strokeWidth={2.5} />
                  この会の軸候補
                </span>
              </div>
              {prefilledStore.googleRating && (
                <div className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm">
                  <Star size={10} className="fill-amber-400 text-amber-400" />
                  <span className="text-[11px] font-bold text-white">
                    {prefilledStore.googleRating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          )}
          {!prefilledStore.image && (
            <div className="px-5 pt-5 pb-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/60 ring-1 ring-white/10">
                <Sparkles size={9} strokeWidth={2.5} />
                この会の軸候補
              </span>
            </div>
          )}
          <div className="px-5 pt-4 pb-4">
            <h3 className="text-xl font-black tracking-tight text-white leading-snug">{prefilledStore.name}</h3>
            {prefilledStore.access && (
              <div className="mt-2 flex items-start gap-1.5">
                <Train size={11} className="mt-0.5 shrink-0 text-white/35" />
                <p className="text-xs leading-5 text-white/45">{prefilledStore.access}</p>
              </div>
            )}
          </div>
          {prefilledStore.tags && prefilledStore.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-5 pb-4">
              {prefilledStore.tags.slice(0, 4).map(tag => tag ? (
                <span key={tag} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/55">{tag}</span>
              ) : null)}
            </div>
          )}
          {prefilledStore.link && (
            <div className="px-5 pb-5">
              <StoreExternalLink
                href={prefilledStore.link}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
              >
                <ExternalLink size={14} strokeWidth={2.5} />
                ホットペッパーで予約を確認する
              </StoreExternalLink>
            </div>
          )}
        </motion.div>

        {/* 軸候補モード CTA */}
        <motion.div
          className="sticky bottom-0 -mx-4 space-y-2 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4 sm:-mx-5 sm:px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <PrimaryBtn size="large" onClick={() => loadFinalDecisionView(prefilledStore)}>
            この候補で進む
          </PrimaryBtn>
          <button
            type="button"
            onClick={() => {
              setSkipStoreCondition(false)
              fetchRecommendedStores()
            }}
            className="w-full py-2 text-center text-[12px] text-stone-400 transition hover:text-stone-600"
          >
            他の候補も見る →
          </button>
        </motion.div>
      </>
    ) : storePool.length === 0 ? (
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
      </motion.div>
    ) : (
      /* ── 候補あり ────────────────────────────────────────────── */
      <>
        {storeFetchError && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
            {storeFetchError}
          </div>
        )}

        {/* 条件チップ + 候補入れ替え / 戻るボタン */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <motion.div
            className="flex flex-wrap items-center gap-1.5"
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
          </motion.div>
          <div className="flex shrink-0 items-center gap-1.5">
            {previousStores.length > 0 && (
              <button
                type="button"
                onClick={restorePreviousStores}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-stone-500 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-95"
              >
                1つ前に戻る
              </button>
            )}
            <button
              type="button"
              onClick={isLoadingStores ? undefined : refreshStores}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-95"
              aria-label="候補を入れ替える"
            >
              <RefreshCw size={14} className="text-stone-500" strokeWidth={2} />
            </button>
          </div>
        </div>

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
                {/* 画像がないときだけ Best Choice バッジ */}
                {!primaryStore.image && (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/60 ring-1 ring-white/10">
                      <Sparkles size={9} strokeWidth={2.5} />
                      Best Choice
                    </span>
                  </div>
                )}
                <h3 className="text-xl font-black tracking-tight text-white leading-snug">
                  {primaryStore.name}
                </h3>
                {primaryStore.reason && (
                  <p className="mt-2 text-sm font-bold leading-snug text-white/55">{primaryStore.reason}</p>
                )}

                {/* アクセス + エリア情報 */}
                {primaryStore.access && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <Train size={11} className="mt-0.5 shrink-0 text-white/35" />
                    <p className="text-xs leading-5 text-white/45">{primaryStore.access}</p>
                  </div>
                )}
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

              {/* リンク — store_only は「詳細確認」、full は「予約」 */}
              {primaryStore.link && (
                <div className="px-5 pb-5 space-y-1.5">
                  <StoreExternalLink
                    href={primaryStore.link}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
                  >
                    <ExternalLink size={14} strokeWidth={2.5} />
                    {appMode === 'store_only' ? 'お店の詳細を確認する' : 'ホットペッパーから予約する'}
                  </StoreExternalLink>
                  <AffiliateNote />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ベスト直下インラインCTA（full モードのみ） */}
        {appMode !== 'store_only' && primaryStore && (
          <button
            type="button"
            onClick={() => { void loadFinalDecisionView() }}
            className="w-full rounded-2xl py-4 text-[15px] font-black text-white transition active:scale-[0.98]"
            style={{
              background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)',
              boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)'
            }}
          >
            この店で決める →
          </button>
        )}

        {/* 他の候補（サブ扱い） */}
        {secondaryStores.length > 0 && (
          <div className="space-y-2">
            <div className="px-0.5">
              <p className="text-[10px] font-black tracking-[0.15em] text-stone-400 uppercase">他の候補</p>
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
                    {/* 差分バッジ */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {store.hasPrivateRoom && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">個室</span>
                      )}
                      {store.walkMinutes != null && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">徒歩{store.walkMinutes}分</span>
                      )}
                      {store.googleRating && (
                        <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                          <Star size={8} className="fill-amber-400 text-amber-400" />
                          {store.googleRating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 詳細リンク — LinkSwitch により自動アフィリエイト変換される */}
                  {store.link && (
                    <StoreExternalLink
                      href={store.link}
                      stopPropagation
                      className="shrink-0 rounded-xl bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-100 active:scale-95"
                    >
                      詳細
                    </StoreExternalLink>
                  )}
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}

        {/* 自分でお店を探す（full モードのみ、インライン配置） */}
        {appMode !== 'store_only' && (
          <button
            type="button"
            onClick={enterManualStoreStep}
            className="w-full py-2.5 text-center text-[12px] font-bold text-stone-500 transition hover:text-stone-400"
          >
            自分でお店を探す →
          </button>
        )}

        {/* store_only CTA — sticky bottom（full モードは非表示） */}
        {appMode === 'store_only' && (
          <motion.div
            className="sticky bottom-0 -mx-4 space-y-2 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4 sm:-mx-5 sm:px-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            {primaryStore && (() => {
              const storeKey = primaryStore.id
              const isFav = userSettings.favoriteStores.some(f => f.id === storeKey)
              return (
                <PrimaryBtn
                  size="large"
                  onClick={() => {
                    const { next } = toggleFavoriteStore(
                      userSettings,
                      {
                        id: storeKey,
                        name: primaryStore.name,
                        area: primaryStore.area ?? '',
                        genre: orgPrefs.genres[0] ?? primaryStore.genre ?? '',
                        link: primaryStore.link,
                        imageUrl: primaryStore.image,
                        station: primaryStore.access,
                        priceRange: orgPrefs.priceRange !== '指定なし' ? orgPrefs.priceRange : undefined,
                      },
                      isFav,
                    )
                    setUserSettings(next)
                  }}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Heart size={15} strokeWidth={isFav ? 0 : 2} className={isFav ? 'fill-current' : ''} />
                    {isFav ? 'お気に入りから外す' : 'お気に入りに登録する'}
                  </span>
                </PrimaryBtn>
              )
            })()}
            <button
              type="button"
              onClick={() => {
                setPrefilledStore(primaryStore)
                setAppMode('full')
                setSkipStoreCondition(true)
                setStep('create')
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
            >
              このお店を軸に会を作成する
            </button>
          </motion.div>
        )}
      </>
    )}
  </div>
)}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨-c 手動店舗入力
            前提: enterManualStoreStep() で遷移してきていること
                  isManualStore === true（遷移時にセット済み）
                  manualStoreName / manualStoreUrl / manualStoreMemo は空の状態で入る
            完了: confirmManualStore() → finalConfirm へ遷移し store_confirmed を保存
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'manualStore' && (
          <motion.div
            className="space-y-5 pb-28"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* ヘッダー */}
            <div className="px-0.5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
                    <UtensilsCrossed size={13} className="text-white" strokeWidth={2.5} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Store</p>
                </div>
                {/* お気に入りから選ぶ */}
                <button
                  type="button"
                  onClick={() => setShowFavoritePicker((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-bold text-stone-500 transition hover:bg-stone-50 active:scale-95"
                >
                  <Heart size={10} strokeWidth={2.5} />
                  お気に入りから選ぶ
                </button>
              </div>
              <h2 className="text-[22px] font-black tracking-tight text-stone-900">お店を登録する</h2>
            </div>

            {/* お気に入りピッカー */}
            <AnimatePresence>
              {showFavoritePicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
                    <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">お気に入りのお店</p>
                      <button
                        type="button"
                        onClick={() => setShowFavoritePicker(false)}
                        className="text-[11px] text-stone-400 hover:text-stone-600"
                      >
                        閉じる
                      </button>
                    </div>
                    {userSettings.favoriteStores.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <Heart size={22} className="mx-auto mb-2 text-stone-200" strokeWidth={1.5} />
                        <p className="text-sm font-bold text-stone-400">お気に入りはまだありません</p>
                        <p className="mt-1 text-[11px] text-stone-300">会を完了するときに登録できます</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-100">
                        {userSettings.favoriteStores.map((fav) => (
                          <button
                            key={fav.id}
                            type="button"
                            onClick={() => {
                              setManualStoreName(fav.name)
                              setManualStoreUrl(fav.link)
                              setShowFavoritePicker(false)
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 active:scale-[0.99]"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-50 ring-1 ring-stone-100">
                              <UtensilsCrossed size={12} className="text-stone-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-stone-900">{fav.name}</p>
                              {fav.area && <p className="text-[11px] text-stone-400">{fav.area}</p>}
                            </div>
                            <span className="text-[11px] font-bold text-stone-400">選択 →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 候補検索 */}
            <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
              <p className="mb-2.5 text-[10px] font-black uppercase tracking-wider text-stone-500">候補を検索</p>
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runManualSearch() }}
                  placeholder="店名（例：鳥一、イタリアン）"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
                <input
                  type="text"
                  value={manualSearchStation}
                  onChange={(e) => setManualSearchStation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runManualSearch() }}
                  placeholder="駅名（任意）"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={runManualSearch}
                  disabled={manualSearchLoading || !manualSearchQuery.trim()}
                  className="w-full rounded-xl bg-stone-800 py-3 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
                >
                  {manualSearchLoading ? '検索中…' : '候補を検索'}
                </button>
              </div>

              {/* 検索結果 */}
              {manualSearchError && (
                <p className="mt-3 text-xs leading-5 text-stone-400">{manualSearchError}</p>
              )}
              {manualSearchResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {manualSearchResults.map((item) => {
                    const isSelected = manualSearchSelectedId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectManualSearchResult(item)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ring-1 transition active:scale-[0.98] ${
                          isSelected
                            ? 'bg-emerald-600 ring-emerald-600'
                            : 'bg-stone-50 ring-stone-100 hover:ring-stone-300'
                        }`}
                      >
                        {item.image ? (
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                            <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-stone-200">
                            <UtensilsCrossed size={16} className={isSelected ? 'text-white/50' : 'text-stone-400'} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${isSelected ? 'text-white' : 'text-stone-900'}`}>
                            {item.name}
                          </p>
                          <p className={`mt-0.5 truncate text-[11px] ${isSelected ? 'text-white/60' : 'text-stone-400'}`}>
                            {item.area}{item.genre ? ` · ${item.genre}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="shrink-0 text-[10px] font-black text-white/70">選択中</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 直接入力フォーム */}
            <div className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
              <div className="px-4 py-4">
                <label className="mb-1.5 block text-[11px] font-bold text-stone-500">店名</label>
                <input
                  type="text"
                  value={manualStoreName}
                  onChange={(e) => setManualStoreName(e.target.value)}
                  placeholder="例：炭火焼鳥 鳥一"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-base font-bold text-stone-900 outline-none transition placeholder:font-normal placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
              </div>
              <div className="px-4 py-4">
                <label className="mb-1.5 block text-[11px] font-bold text-stone-500">URL</label>
                <input
                  type="url"
                  inputMode="url"
                  value={manualStoreUrl}
                  onChange={(e) => setManualStoreUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
              </div>
              <div className="px-4 py-4">
                <label className="mb-1.5 block text-[11px] font-bold text-stone-500">メモ</label>
                <textarea
                  value={manualStoreMemo}
                  onChange={(e) => setManualStoreMemo(e.target.value)}
                  placeholder="個室あり、渋谷3分など"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
              </div>
            </div>

            {/* CTA — sticky bottom */}
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4">
              <div className="mx-auto max-w-xl space-y-2">
                {/* Hot Pepper URL のときだけ表示 — LinkSwitch により自動アフィリエイト変換される */}
                {manualStoreUrl && /hotpepper\.jp/i.test(manualStoreUrl) && (
                  <>
                    <StoreExternalLink
                      href={manualStoreUrl}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
                    >
                      <ExternalLink size={13} strokeWidth={2.5} />
                      ホットペッパーから予約する
                    </StoreExternalLink>
                    <AffiliateNote />
                  </>
                )}
                <button
                  type="button"
                  onClick={confirmManualStore}
                  className="w-full rounded-2xl px-4 py-4 text-sm font-black text-white transition active:scale-[0.98]"
                  style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)', boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)' }}
                >
                  この内容で進む →
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑨-b 最終確認（決定内容 + 共有文プレビュー）
            前提: heroDate（確定日程）または finalDecision（DB保存済み日程）
                  isManualStore ? manualStoreName : selectedStore（確定店舗）
            openSavedEvent で store_confirmed のとき、store 情報が復元されていること
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
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
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Step 7</p>
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">共有</h2>
    </div>

    {(() => {
      const finalSelectedDate =
        finalDecision && finalDates.length > 0
          ? finalDates.find((d: any) => d.id === finalDecision.selected_date_id) ?? null
          : null

      const finalStore = isManualStore
        ? (manualStoreName ? { id: 'manual', name: manualStoreName, link: manualStoreUrl, area: undefined as string | undefined } : null)
        : (selectedStore || recommendedStores?.[0] || null)

const finalShareText =
  shareText ||
  `${eventName}の日程と場所が決まりました！

日程：${finalSelectedDate?.label ?? heroDate?.label ?? '未定'}
お店：${finalStore?.name ?? '未定'}
${finalStore?.link ?? ''}`

      // 初回表示時だけ editableFinalShareText を初期化
      if (!editableFinalShareText) {
        setTimeout(() => setEditableFinalShareText(finalShareText), 0)
      }

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
                  <p className="text-xs font-bold text-white/40">お店</p>
                  {isManualStore && !manualStoreName ? (
                    <div>
                      <p className="mt-1 text-base font-bold text-white/50">お店は未登録です</p>
                      <p className="mt-0.5 text-xs text-white/30">あとで追記できます</p>
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 text-xl font-black text-white">{finalStore?.name ?? '未設定'}</p>
                      {finalStore?.area && (
                        <p className="mt-0.5 text-sm text-white/50">{finalStore.area}</p>
                      )}
                      {isManualStore && manualStoreMemo && (
                        <p className="mt-0.5 text-xs text-white/40">{manualStoreMemo}</p>
                      )}
                    </>
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
            <div className="mb-3">
              <p className="text-sm font-bold text-stone-900">共有文</p>
            </div>
            <textarea
              value={editableFinalShareText || finalShareText}
              onChange={(e) => setEditableFinalShareText(e.target.value)}
              rows={6}
              className="w-full resize-none rounded-2xl bg-stone-50 px-4 py-3 text-base leading-6 text-stone-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-stone-300"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(editableFinalShareText || finalShareText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
              >
                {copied ? 'コピーしました' : 'コピー'}
              </button>
              <button
                type="button"
                onClick={() => openLineShare(editableFinalShareText || finalShareText)}
                className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                LINEで送る
              </button>
            </div>
          </div>

          {/* お店リンク — LinkSwitch により自動アフィリエイト変換される */}
          {finalStore?.link && (
            <div className="space-y-1.5">
              <StoreExternalLink
                href={finalStore.link}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
              >
                お店ページを開く →
              </StoreExternalLink>
              <AffiliateNote />
            </div>
          )}

          {/* 清算へ進む — sticky bottom */}
          <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent px-4 pb-6 pt-4 sm:-mx-5 sm:px-5">
            <button
              type="button"
              onClick={() => setStep('settlement')}
              className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-4 text-sm font-black text-white transition active:scale-[0.98]"
              style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)', boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)' }}
            >
              会計をまとめる（清算）→
            </button>
          </div>
        </div>
      )
    })()}
  </motion.div>
)}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            清算 ① settlement（入力）
            前提: heroDate（確定日程）+ organizerSettings（幹事名）
            参加者は finalYesParticipants → heroYesParticipants → activeParticipants の優先順
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
              onSaveSettings={(s) => applyOrganizerSettings(s)}
              initialDraft={settlementDraft}
              onSaveDraft={setSettlementDraft}
              onSubmit={(config) => {
                const result = calcSettlement(
                  config,
                  settlementParticipants.map((p) => ({ id: p.id, name: p.name }))
                )
                const storeName = isManualStore
                  ? (manualStoreName || undefined)
                  : ((selectedStore || recommendedStores[0])?.name ?? undefined)
                const payment = {
                  paypayId: organizerSettings.paypayId,
                  bankName: organizerSettings.bankName,
                  branchName: organizerSettings.branchName,
                  accountType: organizerSettings.accountType,
                  accountNumber: organizerSettings.accountNumber,
                  accountName: organizerSettings.accountName,
                }
                const baseMsg = generateSettlementMessage(result, config.parties.map((p) => p.id), storeName, payment)
                const msg = eventName ? baseMsg.replace('会計まとめです。', `${eventName}の会計まとめです。`) : baseMsg
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
            前提: settlementConfig（清算設定）+ settlementResult（計算結果）
            どちらも settlement ステップで SettlementStep.onSubmit から設定される
            完了処理フロー:
              1. buildPastEventRecord でレコード生成
              2. saveCompletionData で userSettings に保存（写真容量超過も吸収）
              3. removeCurrentSavedEvent で進行中一覧から削除
              4. setUserSettings で state 更新 → ホームに戻る（onCompleted 経由）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'settlementConfirm' &&
          settlementConfig &&
          settlementResult && (() => {
            // store 情報
            const settlementStore = isManualStore
              ? (manualStoreName ? { id: 'manual', name: manualStoreName, link: manualStoreUrl, area: '' as string, genre: '' } : null)
              : (selectedStore || recommendedStores?.[0] || null)
            // 日付
            const settlementDate =
              finalDates.length > 0 && finalDecision?.selected_date_id
                ? finalDates.find((d: any) => d.id === finalDecision.selected_date_id)?.label ?? ''
                : heroDate?.label ?? ''

            // onComplete: 保存を試みて結果を返す。ナビゲーションは onCompleted に委譲。
            const handleComplete = (data: CompletionData): CompleteResult => {
              // 1. 完了済みレコードを組み立てる（event-actions.ts に委譲）
              const record = buildPastEventRecord({
                eventName,
                eventDate: settlementDate,
                storeName: settlementStore?.name ?? '',
                storeId: settlementStore?.id,
                storeLink: settlementStore?.link,
                storeArea: settlementStore?.area,
                storeGenre: settlementStore?.genre,
                memo: data.memo,
                hasPhoto: data.hasPhoto,
                photoDataUrl: data.photoDataUrl,
                participants: settlementResult.personResults.map(p => p.name),
              })

              // 2. お気に入り情報を組み立て（任意）
              const favoriteStore =
                data.isFavorite && settlementStore
                  ? {
                      id: settlementStore.id,
                      name: settlementStore.name,
                      area: settlementStore.area ?? '',
                      genre: settlementStore.genre ?? '',
                      link: settlementStore.link ?? '',
                      savedAt: new Date().toISOString(),
                    }
                  : undefined

              // 3. userSettings へ保存（event-actions.ts に委譲）
              //    - pastEventRecords 追加 + お気に入り追加（任意）を一括保存
              //    - 写真が容量超過の場合は photoDataUrl を除いて再保存する
              const { result: saveResult, next: nextSettings } = saveCompletionData(
                userSettings,
                record,
                favoriteStore,
              )

              if (!saveResult.ok) {
                // 完全失敗 — 保存できていないのでナビゲーションしない
                return 'error'
              }

              // 4. 保存成功 — state 更新（写真除去版も考慮）
              setUserSettings(nextSettings)

              // 5. 進行中一覧から除外（event-store.ts 経由で kanji_events も更新）
              if (createdEventId) removeCurrentSavedEvent(createdEventId)
              void trackEvent('complete_settlement')

              return saveResult.photoStripped ? 'photo_failed' : 'ok'
              // ナビゲーション（setStep('home')）は onCompleted に委譲
            }

            // 完了後にホームへ戻る。フロー中間状態を掃除してから遷移する。
            function handleCompleted() {
              resetFlowStateAfterCompletion()
              setStep('home')
            }

            return (
              <SettlementSummaryTable
                result={settlementResult}
                config={settlementConfig}
                message={settlementMessage}
                organizerSettings={organizerSettings}
                storeName={settlementStore?.name}
                storeId={settlementStore?.id}
                storeLink={settlementStore?.link}
                storeArea={settlementStore?.area}
                storeGenre={settlementStore?.genre}
                eventName={eventName}
                eventDate={settlementDate}
                onBack={() => setStep('settlement')}  // 清算入力へ戻る
                onShare={(text) => openLineShare(text)}
                onComplete={handleComplete}
                onCompleted={handleCompleted}
              />
            )
          })()}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑩ 共有
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'shared' && (
          <div className="space-y-4">
            <div className="px-0.5">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
                  <Share2 size={13} className="text-white" strokeWidth={2.5} />
                </div>
                
              </div>
              <h2 className="text-[22px] font-black tracking-tight text-stone-900">みんなに伝えよう</h2>
            </div>

            <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">共有文</p>
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
              <div className="rounded-xl bg-stone-50 px-4 py-3">
                <p className="whitespace-pre-line text-sm leading-7 text-stone-700">
                  {urlOnly ? (selectedStore?.link ?? '') : shareText}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(urlOnly ? (selectedStore?.link ?? '') : shareText)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1600)
                    } catch { alert('コピーに失敗しました') }
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
                >
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
                <a
                  href={`https://line.me/R/msg/text/?${encodeURIComponent(urlOnly ? (selectedStore?.link ?? '') : shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
                >
                  LINEで送る
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⑪ 過去に使ったお店一覧
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 'pastStores' && (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <button type="button" onClick={navigateHome} className="text-stone-400 hover:text-stone-600">←</button>
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
                戻る
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
                    className="block w-full rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.99]"
                    style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)', boxShadow: '0 4px 16px rgba(20,83,45,0.5), inset 0 1px 0 rgba(255,255,255,0.12)' }}
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

      {/* FAB — 幹事を始める（ホームのみ表示） */}
      <AnimatePresence>
        {step === 'home' && (
          <motion.button
            type="button"
            onClick={() => setShowStartSheet(true)}
            aria-label="幹事を始める"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            className="fixed bottom-6 right-5 z-50 flex items-center gap-2 rounded-full px-5 py-4 text-white"
            style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)', boxShadow: '0 8px 28px rgba(20,83,45,0.6), inset 0 1px 0 rgba(255,255,255,0.14)' }}
          >
            <Plus size={18} strokeWidth={2.5} />
            <span className="text-[14px] font-black tracking-tight">幹事を始める</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ボトムシート — 開始方法の選択 */}
      <AnimatePresence>
        {showStartSheet && (
          <>
            {/* 背景オーバーレイ */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowStartSheet(false)}
            />
            {/* シート本体 */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white px-5 pb-10 pt-4 shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              {/* ハンドル */}
              <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-stone-200" />
              <p className="mb-5 text-center text-[13px] font-bold tracking-wide text-stone-400">どこから始めますか</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setShowStartSheet(false); setEventName(''); void trackEvent('start_from_dates'); setStep('create') }}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-stone-50 px-4 py-7 ring-1 ring-stone-100 transition active:scale-95 hover:bg-stone-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900">
                    <CalendarDays size={22} className="text-white" strokeWidth={2} />
                  </div>
                  <span className="text-[15px] font-black tracking-tight text-stone-900">日程</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowStartSheet(false); void trackEvent('start_from_store'); startStoreOnlyFlow() }}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-stone-50 px-4 py-7 ring-1 ring-stone-100 transition active:scale-95 hover:bg-stone-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900">
                    <UtensilsCrossed size={22} className="text-white" strokeWidth={2} />
                  </div>
                  <span className="text-[15px] font-black tracking-tight text-stone-900">お店</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 優先したい人 ボトムシート */}
      <AnimatePresence>
        {showPrioritySheet && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPrioritySheet(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl bg-white px-5 pb-10 pt-5 shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              {/* ハンドル */}
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-stone-200" />

              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">優先したい人</p>
              <p className="mb-4 text-[12px] text-stone-400">この人が参加できる日を優先して推薦します</p>

              <div className="flex flex-wrap gap-2">
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
                      className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition active:scale-95 ${
                        selected
                          ? 'bg-emerald-500 text-white ring-emerald-500'
                          : 'bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {participant.name}
                    </button>
                  )
                })}
              </div>

              {mainGuestIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMainGuestIds([])}
                  className="mt-4 text-[12px] font-bold text-stone-400 underline"
                >
                  選択をリセット
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPrioritySheet(false)}
                className="mt-5 w-full rounded-2xl py-3.5 text-sm font-black text-white transition active:scale-[0.98]"
                style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)', boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)' }}
              >
                完了
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 長押し削除アクションシート */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl bg-white px-5 pb-10 pt-4 shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-stone-200" />
              <p className="mb-1 text-center text-[15px] font-black tracking-tight text-stone-900">
                {deleteTarget.type === 'ongoing' ? '進行中の会を削除しますか？' : '記録を削除しますか？'}
              </p>
              <p className="mb-6 text-center text-[12px] text-stone-400">
                {deleteTarget.type === 'ongoing' ? deleteTarget.name : deleteTarget.title}
              </p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (deleteTarget.type === 'ongoing') {
                      removeCurrentSavedEvent(deleteTarget.id)
                    } else {
                      deletePastRecord(deleteTarget.id)
                    }
                    setDeleteTarget(null)
                    triggerDeleteToast()
                  }}
                  className="w-full rounded-2xl bg-red-500 px-4 py-4 text-[15px] font-black text-white transition active:scale-[0.98] hover:bg-red-600"
                >
                  削除する
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="w-full rounded-2xl bg-stone-100 px-4 py-4 text-[15px] font-bold text-stone-600 transition active:scale-[0.98] hover:bg-stone-200"
                >
                  キャンセル
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 削除トースト */}
      <AnimatePresence>
        {toastVisible && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-[13px] font-bold text-white shadow-lg"
          >
            削除しました
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FlowProgress({ step }: { step: Step }) {
  const current = FLOW_STEPS.indexOf(step)
  return (
    <div className="flex gap-1">
      {FLOW_STEPS.map((_, i) => (
        <div
          key={i}
          className={cx(
            'h-[3px] flex-1 rounded-full transition-all duration-500',
            i < current ? 'bg-emerald-600' : i === current ? 'bg-emerald-400' : 'bg-white/15'
          )}
        />
      ))}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-[#1d1d1d] px-5 py-5 shadow-sm ring-1 ring-white/8 md:px-6 md:py-6 lg:px-7 lg:py-7">
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
  const activeStyle = {
    background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)',
    boxShadow: '0 6px 24px rgba(20,83,45,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
  }
  return (
    <motion.button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      whileTap={disabled ? {} : { scale: 0.975 }}
      transition={{ duration: 0.12 }}
      className={cx(
        'w-full rounded-2xl font-bold tracking-wide',
        size === 'large' ? 'py-4 text-[15px]' : 'py-3 text-sm',
        disabled
          ? 'cursor-not-allowed bg-white/10 text-white/30'
          : 'text-white'
      )}
      style={disabled ? undefined : activeStyle}
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
      className="inline-flex w-full items-center justify-center py-2.5 text-sm font-medium text-stone-400 transition-colors duration-150 hover:text-stone-600"
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
                'relative flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm font-bold transition-all duration-150',
                isSelected && 'scale-[1.08] bg-stone-900 text-white ring-1 ring-stone-900',
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
