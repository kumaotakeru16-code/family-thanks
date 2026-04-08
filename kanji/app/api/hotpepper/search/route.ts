import { NextRequest, NextResponse } from 'next/server'

const UI_GENRE_TO_SEARCH_CODES: Record<string, string[]> = {
  '和風・居酒屋': ['G001', 'G004'],
  '洋食': ['G006'],
  '中華': ['G007'],
}

const ALLOWED_PRIMARY_GENRES = new Set(['G001', 'G006', 'G007'])
const ALLOWED_PRICE_RANGES = new Set(['指定なし', '4,001〜5,000円', '5,001〜7,000円'])

type AreaSearchConfig = {
  middleArea?: string
  smallArea?: string
  aliases: string[]
}

const AREA_SEARCH_MAP: Record<string, AreaSearchConfig> = {
  横浜: {
    middleArea: 'Y135',
    smallArea: 'X270',
    aliases: ['横浜', '新高島', '高島町', '平沼橋'],
  },
  新宿: {
    middleArea: 'Y055',
    aliases: ['新宿', '西新宿', '新宿三丁目', '東新宿', '都庁前'],
  },
  渋谷: {
    middleArea: 'Y030',
    aliases: ['渋谷', '神泉', '表参道'],
  },
  池袋: {
    middleArea: 'Y050',
    aliases: ['池袋', '東池袋', '要町'],
  },
  品川: {
    middleArea: 'Y025',
    aliases: ['品川', '高輪ゲートウェイ', '北品川'],
  },
  大阪: {
    middleArea: 'Y300',
    aliases: ['大阪', '梅田', '東梅田', '西梅田', '大阪梅田', '北新地'],
  },
  札幌: {
    middleArea: 'Y500',
    aliases: ['札幌', 'さっぽろ', '大通', 'すすきの', '豊水すすきの'],
  },
  名古屋: {
    middleArea: 'Y220',
    aliases: ['名古屋', '名鉄名古屋', '近鉄名古屋', '国際センター'],
  },
  博多: {
    middleArea: 'Y700',
    aliases: ['博多', '祇園', '櫛田神社前'],
  },
  天神: {
    middleArea: 'Y705',
    aliases: ['天神', '西鉄福岡', '天神南', '赤坂'],
  },
  京都: {
    middleArea: 'Y430',
    aliases: ['京都', '四条', '烏丸', '京都河原町', '祇園四条'],
  },
  神戸: {
    middleArea: 'Y370',
    aliases: ['三宮', '神戸三宮', '三ノ宮', '元町'],
  },
}

type ParsedBudgetAverage = {
  estimatedMin: number | null
  estimatedMax: number | null
  sourceType: 'dinner' | 'normal' | 'banquet' | 'course' | 'generic' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  raw: string
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
}

function normalizeText(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeStationToken(value: string): string {
  return normalizeText(value)
    .replace(/駅/g, '')
    .replace(/\s+/g, '')
}

function parseWalkMinutes(access: string): number | null {
  const m = String(access ?? '').match(/徒歩(\d+)分/)
  return m ? parseInt(m[1], 10) : null
}

function hasPrivateRoom(shop: any): boolean {
  return shop?.private_room === 'あり' || shop?.private_room === '1'
}

function stationNameOf(shop: any): string {
  return typeof shop?.station_name === 'string' ? shop.station_name.trim() : ''
}

function normalizePriceText(text: string): string {
  return String(text ?? '')
    .replace(/[【】\[\]]/g, ' ')
    .replace(/[（(]/g, ' ')
    .replace(/[）)]/g, ' ')
    .replace(/[：:]/g, ':')
    .replace(/[／/]/g, ' / ')
    .replace(/[〜～~]/g, '〜')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseYen(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

function extractRange(fragment: string): { min: number; max: number } | null {
  const text = normalizePriceText(fragment)

  const rangeMatch =
    text.match(/([0-9,]+)\s*円?\s*[〜\-]\s*([0-9,]+)\s*円?/) ||
    text.match(/([0-9,]+)\s*[〜\-]\s*([0-9,]+)\s*円?/)
  if (rangeMatch) {
    const min = parseYen(rangeMatch[1])
    const max = parseYen(rangeMatch[2])
    if (min !== null && max !== null) {
      return { min: Math.min(min, max), max: Math.max(min, max) }
    }
  }

  const singleWithPlus = text.match(/([0-9,]+)\s*円?\s*〜/)
  if (singleWithPlus) {
    const min = parseYen(singleWithPlus[1])
    if (min !== null) return { min, max: min + 1500 }
  }

  const single = text.match(/([0-9,]+)\s*円?/)
  if (single) {
    const value = parseYen(single[1])
    if (value !== null) return { min: value, max: value }
  }

  return null
}

function parseLabeledBudgetCandidates(text: string) {
  const normalized = normalizePriceText(text)
  const candidates: Array<{
    sourceType: ParsedBudgetAverage['sourceType']
    confidence: ParsedBudgetAverage['confidence']
    min: number
    max: number
  }> = []

  const patterns: Array<{
    type: ParsedBudgetAverage['sourceType']
    regex: RegExp
    confidence: ParsedBudgetAverage['confidence']
  }> = [
    { type: 'dinner', regex: /ディナー[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'high' },
    { type: 'normal', regex: /通常平均[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'medium' },
    { type: 'normal', regex: /フリー[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'medium' },
    { type: 'banquet', regex: /宴会[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'medium' },
    { type: 'course', regex: /コース[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'low' },
  ]

  for (const { type, regex, confidence } of patterns) {
    const matches = normalized.matchAll(regex)
    for (const match of matches) {
      const parsed = extractRange(match[1])
      if (!parsed) continue
      candidates.push({
        sourceType: type,
        confidence,
        min: parsed.min,
        max: parsed.max,
      })
    }
  }

  return candidates
}

function parseBudgetAverage(average: string): ParsedBudgetAverage {
  const text = normalizePriceText(average)
  if (!text) {
    return {
      estimatedMin: null,
      estimatedMax: null,
      sourceType: 'unknown',
      confidence: 'low',
      raw: text,
    }
  }

  const labeled = parseLabeledBudgetCandidates(text)
  const priority: ParsedBudgetAverage['sourceType'][] = ['dinner', 'normal', 'banquet', 'course']

  for (const type of priority) {
    const hit = labeled.find((c) => c.sourceType === type)
    if (hit) {
      return {
        estimatedMin: hit.min,
        estimatedMax: hit.max,
        sourceType: hit.sourceType,
        confidence: hit.confidence,
        raw: text,
      }
    }
  }

  const genericRange = extractRange(text)
  if (genericRange) {
    return {
      estimatedMin: genericRange.min,
      estimatedMax: genericRange.max,
      sourceType: 'generic',
      confidence: 'medium',
      raw: text,
    }
  }

  const yenNumbers = (text.match(/[0-9,]+\s*円?/g) || [])
    .map((m) => parseYen(m))
    .filter((n): n is number => n !== null && n >= 500 && n <= 30000)

  if (yenNumbers.length === 1) {
    return {
      estimatedMin: yenNumbers[0],
      estimatedMax: yenNumbers[0],
      sourceType: 'generic',
      confidence: 'medium',
      raw: text,
    }
  }

  if (yenNumbers.length >= 2) {
    const sorted = [...yenNumbers].sort((a, b) => a - b)
    return {
      estimatedMin: sorted[0],
      estimatedMax: sorted[sorted.length - 1],
      sourceType: 'generic',
      confidence: 'low',
      raw: text,
    }
  }

  return {
    estimatedMin: null,
    estimatedMax: null,
    sourceType: 'unknown',
    confidence: 'low',
    raw: text,
  }
}

function requestedPriceRangeToNumbers(priceRange: string): { min: number | null; max: number | null } {
  switch (priceRange) {
    case '指定なし':
      return { min: 4000, max: 7000 }
    case '4,001〜5,000円':
      return { min: 4001, max: 5000 }
    case '5,001〜7,000円':
      return { min: 5001, max: 7000 }
    default:
      return { min: null, max: null }
  }
}

function rangeCenter(min: number, max: number): number {
  return (min + max) / 2
}

function confidencePenalty(confidence: ParsedBudgetAverage['confidence']): number {
  if (confidence === 'high') return 0
  if (confidence === 'medium') return -1
  return -4
}

function priceRangeScoreFromAverage(requestedPriceRange: string, average: string): number {
  const requested = requestedPriceRangeToNumbers(requestedPriceRange)
  const parsed = parseBudgetAverage(average)

  if (requested.min === null || requested.max === null) return 0
  if (parsed.estimatedMin === null || parsed.estimatedMax === null) return -16

  const actualMin = parsed.estimatedMin
  const actualMax = parsed.estimatedMax
  const overlapMin = Math.max(requested.min, actualMin)
  const overlapMax = Math.min(requested.max, actualMax)
  const overlaps = overlapMax >= overlapMin

  const reqCenter = rangeCenter(requested.min, requested.max)
  const actCenter = rangeCenter(actualMin, actualMax)
  const centerGap = Math.abs(reqCenter - actCenter)

  if (overlaps) {
    const requestedWidth = Math.max(1, requested.max - requested.min)
    const overlapWidth = Math.max(0, overlapMax - overlapMin)
    const overlapRatio = overlapWidth / requestedWidth

    let score = 0
    if (overlapRatio >= 0.75 && centerGap <= 350) score = 40
    else if (overlapRatio >= 0.45 && centerGap <= 700) score = 34
    else if (centerGap <= 1200) score = 26
    else score = 18

    if (parsed.sourceType === 'dinner') score += 2
    return score + confidencePenalty(parsed.confidence)
  }

  if (actualMax < requested.min) {
    const gap = requested.min - actualMax

    if (requestedPriceRange === '5,001〜7,000円') {
      if (gap <= 300) return 2 + confidencePenalty(parsed.confidence)
      if (gap <= 800) return -8 + confidencePenalty(parsed.confidence)
      if (gap <= 1500) return -20 + confidencePenalty(parsed.confidence)
      return -32 + confidencePenalty(parsed.confidence)
    }

    if (gap <= 300) return 6 + confidencePenalty(parsed.confidence)
    if (gap <= 800) return -4 + confidencePenalty(parsed.confidence)
    if (gap <= 1500) return -16 + confidencePenalty(parsed.confidence)
    if (gap <= 2500) return -28 + confidencePenalty(parsed.confidence)
    return -40 + confidencePenalty(parsed.confidence)
  }

  if (actualMin > requested.max) {
    const gap = actualMin - requested.max
    if (gap <= 500) return 8 + confidencePenalty(parsed.confidence)
    if (gap <= 1200) return 1 + confidencePenalty(parsed.confidence)
    if (gap <= 2500) return -10 + confidencePenalty(parsed.confidence)
    return -22 + confidencePenalty(parsed.confidence)
  }

  return confidencePenalty(parsed.confidence)
}

function textContainsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function buildGenreSignals(shop: any) {
  const raw = [
    String(shop?.genre?.name ?? ''),
    String(shop?.sub_genre?.name ?? ''),
    String(shop?.catch ?? ''),
    String(shop?.name ?? ''),
  ].join(' ')

  return {
    raw,
    isJapaneseLike: textContainsAny(raw, [/和食/, /海鮮/, /魚/, /寿司/, /刺身/, /炉端/, /おでん/, /鍋/, /鶏料理/, /串焼/, /焼き鳥/, /やきとり/, /居酒屋/]),
    isItalianLike: textContainsAny(raw, [/イタリアン/, /フレンチ/, /ビストロ/, /バル/, /スペイン/, /パエリア/, /ピザ/, /パスタ/]),
    isChineseLike: textContainsAny(raw, [/中華/, /四川/, /上海/, /広東/, /餃子/, /小籠包/, /火鍋/]),
    hasPrivateRoomWord: /個室/.test(raw),
  }
}

function buildShopTags(shop: any): string[] {
  const signals = buildGenreSignals(shop)
  const tags = new Set<string>()
  if (signals.isJapaneseLike) tags.add('和風・居酒屋寄り')
  if (signals.isItalianLike) tags.add('洋食寄り')
  if (signals.isChineseLike) tags.add('中華寄り')
  if (signals.hasPrivateRoomWord) tags.add('個室あり')
  return Array.from(tags)
}

function buildReason(shop: any): string {
  const parts: string[] = []
  const walk = parseWalkMinutes(String(shop?.access ?? ''))
  if (walk !== null) parts.push(`徒歩${walk}分`)
  if (shop?.genre?.name) parts.push(shop.genre.name)
  if (typeof shop?.budget?.average === 'string' && shop.budget.average) parts.push(shop.budget.average)
  if (hasPrivateRoom(shop)) parts.push('個室あり')
  if (shop?.catch) return shop.catch
  return parts.slice(0, 3).join('・') || '条件に合う候補です'
}

function mapShopToStore(shop: any) {
  return {
    id: shop.id,
    name: shop.name,
    area: shop.small_area?.name ?? shop.middle_area?.name ?? shop.address ?? '',
    access: shop.access ?? '',
    image: shop.photo?.pc?.l ?? shop.photo?.pc?.m ?? undefined,
    link: shop.urls?.pc ?? '',
    reason: buildReason(shop),
    tags: [
      shop.genre?.name,
      typeof shop?.budget?.average === 'string' ? shop.budget.average : undefined,
      hasPrivateRoom(shop) ? '個室あり' : undefined,
      shop.wifi === 'あり' ? 'WiFiあり' : undefined,
      ...buildShopTags(shop),
    ].filter((t): t is string => Boolean(t)).slice(0, 6),
    stationName: stationNameOf(shop),
    budgetCode: typeof shop?.budget?.code === 'string' ? shop.budget.code : '',
    budgetAverage: typeof shop?.budget?.average === 'string' ? shop.budget.average : '',
    genre: shop.genre?.name ?? '',
    walkMinutes: parseWalkMinutes(shop.access ?? ''),
    hasPrivateRoom: hasPrivateRoom(shop),
    googleRating: null,
    googleRatingCount: null,
  }
}

async function fetchHotpepper(params: URLSearchParams) {
  const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Hot Pepper API error: HTTP ${res.status}`)
  const data = await res.json()
  const shops: any[] = data?.results?.shop ?? []
  return { url, data, shops }
}

function resolveAreaConfig(input: string): AreaSearchConfig | null {
  const normalized = normalizeStationToken(input)
  if (!normalized) return null

  const direct = AREA_SEARCH_MAP[input]
  if (direct) return direct

  const entry = Object.entries(AREA_SEARCH_MAP).find(([, cfg]) =>
    cfg.aliases.some((alias) => normalizeStationToken(alias) === normalized)
  )
  return entry?.[1] ?? null
}

function buildAreaAliases(targetArea: string): string[] {
  const cfg = resolveAreaConfig(targetArea)
  if (!cfg) return [targetArea]
  return Array.from(new Set([targetArea, ...cfg.aliases]))
}

function baseAreaParams(apiKey: string, targetArea: string) {
  const params = new URLSearchParams({
    key: apiKey,
    format: 'json',
    count: '120',
    order: '4',
    large_service_area: 'SS10',
  })

  const config = resolveAreaConfig(targetArea)
  if (config?.middleArea) params.set('middle_area', config.middleArea)
  else if (config?.smallArea) params.set('small_area', config.smallArea)
  else if (targetArea) params.set('keyword', targetArea.endsWith('駅') ? targetArea : `${targetArea}駅`)

  return params
}

function withOptionalCommonFilters(
  params: URLSearchParams,
  args: { privateRoom: string; allYouCanDrink: string; nonSmoking?: boolean; peopleCount?: number }
) {
  const next = new URLSearchParams(params)
  if (args.privateRoom === '個室あり') next.set('private_room', '1')
  if (args.allYouCanDrink === '希望') next.set('free_drink', '1')
  if (args.nonSmoking) next.set('non_smoking', '1')
  if (args.peopleCount && args.peopleCount >= 10) next.set('party_capacity', String(args.peopleCount))
  return next
}

function shopMatchesArea(shop: any, targetArea: string): boolean {
  if (!targetArea) return true

  const aliases = buildAreaAliases(targetArea).map(normalizeStationToken)
  const stationName = normalizeStationToken(stationNameOf(shop))
  const access = normalizeText(String(shop?.access ?? ''))

  if (stationName && aliases.includes(stationName)) return true
  return aliases.some((alias) => access.includes(`${alias}駅`) || access.includes(alias))
}

function isClearlyOtherArea(shop: any, targetArea: string): boolean {
  if (!targetArea) return false
  const stationName = normalizeStationToken(stationNameOf(shop))
  if (!stationName) return false
  const aliases = buildAreaAliases(targetArea).map(normalizeStationToken)
  return !aliases.includes(stationName)
}

function genreSpecificBoost(shop: any, requestedPrimaryGenreCode: string | null): number {
  if (!requestedPrimaryGenreCode) return 0

  const shopGenreCode = typeof shop?.genre?.code === 'string' ? shop.genre.code : ''
  const signals = buildGenreSignals(shop)

  if (requestedPrimaryGenreCode === 'G001') {
    if (shopGenreCode === 'G001') return 18
    if (shopGenreCode === 'G004' && signals.isJapaneseLike) return 10
    if (signals.isJapaneseLike) return 8
    return shopGenreCode ? -10 : -4
  }

  if (requestedPrimaryGenreCode === 'G006') {
    if (shopGenreCode === 'G006') return 18
    if (signals.isItalianLike) return 10
    return shopGenreCode ? -10 : -4
  }

  if (requestedPrimaryGenreCode === 'G007') {
    if (shopGenreCode === 'G007') return 18
    if (signals.isChineseLike) return 10
    return shopGenreCode ? -10 : -4
  }

  return 0
}

function applyPricePrefilter(shops: any[], priceRange: string) {
  if (!ALLOWED_PRICE_RANGES.has(priceRange)) {
    return { shops: shops.slice(0, 24), usedRelaxation: true }
  }

  const scored = shops.map((shop) => {
    const average = typeof shop?.budget?.average === 'string' ? shop.budget.average : ''
    const priceScore = priceRangeScoreFromAverage(priceRange, average)
    return { shop, priceScore }
  })

  if (priceRange === '指定なし') {
    const natural = scored.filter((s) => s.priceScore >= 18).map((s) => s.shop)
    if (natural.length >= 8) return { shops: natural.slice(0, 40), usedRelaxation: false }

    const wide = scored.filter((s) => s.priceScore >= 8).map((s) => s.shop)
    if (wide.length >= 8) return { shops: wide.slice(0, 36), usedRelaxation: true }

    const sorted = [...scored].sort((a, b) => b.priceScore - a.priceScore).slice(0, 28).map((s) => s.shop)
    return { shops: sorted, usedRelaxation: true }
  }

  const exact = scored.filter((s) => s.priceScore >= 30).map((s) => s.shop)
  if (exact.length >= 6) return { shops: exact.slice(0, 36), usedRelaxation: false }

  const near = scored.filter((s) => s.priceScore >= 10).map((s) => s.shop)
  if (near.length >= 6) return { shops: near.slice(0, 30), usedRelaxation: true }

  const floor = scored.filter((s) => s.priceScore >= 0).map((s) => s.shop)
  if (floor.length >= 6) return { shops: floor.slice(0, 24), usedRelaxation: true }

  const sorted = [...scored].sort((a, b) => b.priceScore - a.priceScore).slice(0, 18).map((s) => s.shop)
  return { shops: sorted, usedRelaxation: true }
}

function scoreStoreForSelection(
  shop: any,
  targetArea: string,
  priceRange: string,
  requestedPrimaryGenreCode: string | null
): number {
  let score = 0

  const areaMatch = shopMatchesArea(shop, targetArea)
  const clearlyOtherArea = isClearlyOtherArea(shop, targetArea)

  if (areaMatch) score += 24
  if (clearlyOtherArea) score -= 26

  const budgetAverage = typeof shop?.budget?.average === 'string' ? shop.budget.average : ''
  score += priceRangeScoreFromAverage(priceRange, budgetAverage)
  score += genreSpecificBoost(shop, requestedPrimaryGenreCode)

  const walk = parseWalkMinutes(String(shop?.access ?? ''))
  if (typeof walk === 'number') score += Math.max(0, 7 - walk)

  if (hasPrivateRoom(shop)) score += 2

  return score
}

function compressBeforeGemini(args: {
  shops: any[]
  targetArea: string
  priceRange: string
  requestedPrimaryGenreCode: string | null
  limit?: number
}) {
  const { shops, targetArea, priceRange, requestedPrimaryGenreCode, limit = 12 } = args

  const scored = shops.map((shop) => {
    const areaMatch = shopMatchesArea(shop, targetArea)
    const clearlyOtherArea = isClearlyOtherArea(shop, targetArea)
    const priceScore = priceRangeScoreFromAverage(
      priceRange,
      typeof shop?.budget?.average === 'string' ? shop.budget.average : ''
    )

    return {
      shop,
      areaMatch,
      clearlyOtherArea,
      priceScore,
      score: scoreStoreForSelection(shop, targetArea, priceRange, requestedPrimaryGenreCode),
    }
  })

  const areaMatched = scored.filter((s) => s.areaMatch)
  const nonOther = scored.filter((s) => !s.clearlyOtherArea)
  const baseAreaPool = areaMatched.length >= 4 ? areaMatched : (nonOther.length >= 4 ? nonOther : scored)

  const exactPrice = baseAreaPool.filter((s) => s.priceScore >= 30)
  const nearPrice = baseAreaPool.filter((s) => s.priceScore >= 10)
  const loosePrice = baseAreaPool.filter((s) => s.priceScore >= 0)

  let pricePool = exactPrice
  let usedRelaxation = false

  if (pricePool.length < 5) {
    pricePool = nearPrice
    usedRelaxation = true
  }
  if (pricePool.length < 5) {
    pricePool = loosePrice
    usedRelaxation = true
  }
  if (pricePool.length < 5) {
    pricePool = [...baseAreaPool]
      .sort((a, b) => {
        if (a.areaMatch !== b.areaMatch) return Number(b.areaMatch) - Number(a.areaMatch)
        if (a.clearlyOtherArea !== b.clearlyOtherArea) return Number(a.clearlyOtherArea) - Number(b.clearlyOtherArea)
        if (a.priceScore !== b.priceScore) return b.priceScore - a.priceScore
        return b.score - a.score
      })
      .slice(0, 18)
    usedRelaxation = true
  }

  const merged = [...pricePool]
    .sort((a, b) => {
      if (a.areaMatch !== b.areaMatch) return Number(b.areaMatch) - Number(a.areaMatch)
      if (a.clearlyOtherArea !== b.clearlyOtherArea) return Number(a.clearlyOtherArea) - Number(b.clearlyOtherArea)
      if (a.priceScore !== b.priceScore) return b.priceScore - a.priceScore
      return b.score - a.score
    })
    .slice(0, limit)

  const hasOverlappingPrice = merged.some((s) => s.priceScore >= 30)

  return {
    shops: merged.map((s) => s.shop),
    budgetRelaxedForBest: !hasOverlappingPrice || usedRelaxation,
  }
}

function buildGenreQueriesFromPreference(preferredGenres: string[]): {
  displayGenre: string
  primaryGenreCode: string | null
  searchGenreCodes: string[]
} {
  const first = preferredGenres[0]?.trim()
  if (!first) {
    return {
      displayGenre: '',
      primaryGenreCode: null,
      searchGenreCodes: [],
    }
  }

  const codes = UI_GENRE_TO_SEARCH_CODES[first] ?? []
  const primaryGenreCode = codes.find((code) => ALLOWED_PRIMARY_GENRES.has(code)) ?? codes[0] ?? null

  return {
    displayGenre: first,
    primaryGenreCode,
    searchGenreCodes: codes,
  }
}

async function fetchGenrePools(args: {
  apiKey: string
  targetArea: string
  privateRoom: string
  allYouCanDrink: string
  nonSmoking?: boolean
  peopleCount?: number
  searchGenreCodes: string[]
}) {
  const areaBase = baseAreaParams(args.apiKey, args.targetArea)
  const commonBase = withOptionalCommonFilters(areaBase, {
    privateRoom: args.privateRoom,
    allYouCanDrink: args.allYouCanDrink,
    nonSmoking: args.nonSmoking,
    peopleCount: args.peopleCount,
  })

  const allShops: any[] = []
  const queryLogs: any[] = []

  for (const genreCode of args.searchGenreCodes) {
    const params = new URLSearchParams(commonBase)
    params.set('genre', genreCode)

    const result = await fetchHotpepper(params)
    queryLogs.push({
      genre: genreCode,
      url: result.url,
      resultCount: result.shops.length,
    })

    allShops.push(...result.shops)
  }

  const deduped = Array.from(new Map(allShops.map((shop) => [shop.id, shop])).values())
  return { shops: deduped, queryLogs }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RECRUIT_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { stores: [], fallback: false, error: 'RECRUIT_API_KEY is not set' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json()
    const prefs = body?.orgPrefs ?? body ?? {}

    const areas = normalizeStringArray(prefs?.areas)
    const targetArea = areas[0]?.trim() ?? ''
    const areaConfig = resolveAreaConfig(targetArea)

    const preferredGenres = normalizeStringArray(body?.genreLabels ?? prefs?.genres)
    const genreQuery = buildGenreQueriesFromPreference(preferredGenres)

    const priceRangeRaw = typeof prefs?.priceRange === 'string' ? prefs.priceRange : '指定なし'
    const priceRange = ALLOWED_PRICE_RANGES.has(priceRangeRaw) ? priceRangeRaw : '指定なし'

    const privateRoom = typeof prefs?.privateRoom === 'string' ? prefs.privateRoom : 'こだわらない'
    const allYouCanDrink = typeof body?.allYouCanDrink === 'string' ? body.allYouCanDrink : ''
    const nonSmoking = body?.nonSmoking === true
    const peopleCount = typeof body?.peopleCount === 'number' ? body.peopleCount : undefined

    const fallbackGenreCodes = ['G001']
    const searchGenreCodes =
      genreQuery.searchGenreCodes.length > 0
        ? genreQuery.searchGenreCodes
        : fallbackGenreCodes

    console.log('[hotpepper/search] request:', {
      areas,
      targetArea,
      areaConfig,
      preferredGenres,
      searchGenreCodes,
      displayGenre: genreQuery.displayGenre || '(未指定)',
      primaryGenreCode: genreQuery.primaryGenreCode ?? '(なし)',
      priceRange,
      privateRoom,
      allYouCanDrink,
      nonSmoking,
      peopleCount,
    })

    const fetched = await fetchGenrePools({
      apiKey,
      targetArea,
      privateRoom,
      allYouCanDrink,
      nonSmoking,
      peopleCount,
      searchGenreCodes,
    })

    console.log('[hotpepper/search] multi-genre query logs:', fetched.queryLogs)

    const allShops = fetched.shops

    if (allShops.length === 0) {
      return NextResponse.json({
        stores: [],
        fallback: false,
        searchMode: 'area-cluster-search',
        budgetRelaxedForBest: false,
        emptyState: {
          title: '条件に合う候補が見つかりませんでした',
          body: 'Hot Pepper の条件一致結果が0件でした。条件を見直してください。',
          cta: '条件を調整する',
        },
      })
    }

    const prefiltered = applyPricePrefilter(allShops, priceRange)

    console.log('[hotpepper/search] price prefilter:', {
      requestedPriceRange: priceRange,
      beforeCount: allShops.length,
      afterCount: prefiltered.shops.length,
      usedRelaxation: prefiltered.usedRelaxation,
    })

    console.log('[hotpepper/search] shop diagnostics:', {
      area: targetArea || '(未設定)',
      requestedPriceRange: priceRange,
      displayGenre: genreQuery.displayGenre || '(未指定)',
      primaryGenreCode: genreQuery.primaryGenreCode ?? '(なし)',
      aliases: buildAreaAliases(targetArea),
      shops: prefiltered.shops.map((s) => {
        const average = typeof s?.budget?.average === 'string' ? s.budget.average : ''
        const parsedBudget = parseBudgetAverage(average)

        return {
          name: s.name,
          station_name: s.station_name ?? '(なし)',
          budget_code: s?.budget?.code ?? '(なし)',
          budget_average: average || '(なし)',
          parsed_budget: {
            min: parsedBudget.estimatedMin,
            max: parsedBudget.estimatedMax,
            sourceType: parsedBudget.sourceType,
            confidence: parsedBudget.confidence,
          },
          genre_code: s?.genre?.code ?? '(なし)',
          areaMatch: shopMatchesArea(s, targetArea),
          priceScore: priceRangeScoreFromAverage(priceRange, average),
          genreBoost: genreSpecificBoost(s, genreQuery.primaryGenreCode),
        }
      }),
    })

    const matchCount = prefiltered.shops.filter((s) => shopMatchesArea(s, targetArea)).length
    const matchRate = prefiltered.shops.length > 0 ? matchCount / prefiltered.shops.length : 0
    console.log('[hotpepper/search] area match rate:', {
      area: targetArea,
      matchCount,
      total: prefiltered.shops.length,
      rate: `${Math.round(matchRate * 100)}%`,
    })

    const compressed = compressBeforeGemini({
      shops: prefiltered.shops,
      targetArea,
      priceRange,
      requestedPrimaryGenreCode: genreQuery.primaryGenreCode,
      limit: 12,
    })

    return NextResponse.json({
      stores: compressed.shops.map(mapShopToStore),
      fallback: false,
      searchMode: 'area-cluster-search',
      budgetRelaxedForBest: compressed.budgetRelaxedForBest,
      normalizedGenre: genreQuery.displayGenre || '',
      normalizedPriceRange: priceRange,
      normalizedArea: targetArea,
      areaAliases: buildAreaAliases(targetArea),
    })
  } catch (e: any) {
    console.error('[hotpepper/search] error:', e?.message ?? e)
    return NextResponse.json(
      { stores: [], fallback: false, error: e?.message ?? 'unknown error' },
      { status: 500 }
    )
  }
}