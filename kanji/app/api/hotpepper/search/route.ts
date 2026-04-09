import { NextRequest, NextResponse } from 'next/server'
import { buildStationSearchContext, isStationMatch } from '../../../lib/station'
import { adaptHotpepperShopsToStoreSelect } from '../../../lib/store-select-adapter'

const HOTPEPPER_API_KEY =
  process.env.HOTPEPPER_API_KEY || process.env.RECRUIT_API_KEY || ''

type RequestBody = {
  areas?: string[]
  targetStation?: string
  preferredGenres?: string[]
  priceRange?: string
  privateRoom?: string
  allYouCanDrink?: string
  nonSmoking?: boolean
  peopleCount?: number
  eventType?: string
  broadAreaMode?: boolean
  areaAliases?: string[]
}

type HotpepperGenre = {
  code?: string
  name?: string
  catch?: string
}

type HotpepperBudget = {
  code?: string
  name?: string
  average?: string
}

type HotpepperShop = {
  id: string
  name: string
  address?: string
  station_name?: string
  mobile_access?: string
  logo_image?: string
  photo?: {
    mobile?: { l?: string; s?: string }
    pc?: { l?: string; s?: string }
  }
  genre?: HotpepperGenre
  budget?: HotpepperBudget
  urls?: {
    pc?: string
  }
  capacity?: number
  private_room?: string
  free_drink?: string
  non_smoking?: string
  catch?: string
  open?: string
}

type SearchGenreConfig = {
  displayGenre: string
  searchGenreCodes: string[]
  primaryGenreCode: string
  resolvedFrom: string[]
  normalizedGenres: string[]
}

type ParsedBudget = {
  min: number | null
  max: number | null
  representative: number | null
}

type ScoredShop = HotpepperShop & {
  _debug: {
    parsedBudget: ParsedBudget
    stationMatch: boolean
    priceScore: number
    genreBoost: number
    genrePenalty: number
    totalScore: number
    genreMatched: boolean
  }
}

const GENRE_MAP: Record<string, Omit<SearchGenreConfig, 'resolvedFrom' | 'normalizedGenres'>> = {
  '和風・居酒屋': {
    displayGenre: '和風・居酒屋',
    searchGenreCodes: ['G001', 'G004'],
    primaryGenreCode: 'G001',
  },
  洋食: {
    displayGenre: '洋食',
    searchGenreCodes: ['G006'],
    primaryGenreCode: 'G006',
  },
  中華: {
    displayGenre: '中華',
    searchGenreCodes: ['G007'],
    primaryGenreCode: 'G007',
  },
  焼肉: {
    displayGenre: '焼肉',
    searchGenreCodes: ['G008'],
    primaryGenreCode: 'G008',
  },
  カフェ: {
    displayGenre: 'カフェ',
    searchGenreCodes: ['G014'],
    primaryGenreCode: 'G014',
  },
}

const GENRE_ALIAS_MAP: Record<string, keyof typeof GENRE_MAP> = {
  // 和風・居酒屋
  居酒屋: '和風・居酒屋',
  和食: '和風・居酒屋',
  和風: '和風・居酒屋',
  海鮮: '和風・居酒屋',
  鮨: '和風・居酒屋',
  寿司: '和風・居酒屋',
  焼き鳥: '和風・居酒屋',
  焼鳥: '和風・居酒屋',
  鳥料理: '和風・居酒屋',
  鍋: '和風・居酒屋',
  もつ鍋: '和風・居酒屋',
  しゃぶしゃぶ: '和風・居酒屋',
  すき焼き: '和風・居酒屋',
  郷土料理: '和風・居酒屋',
  割烹: '和風・居酒屋',
  小料理: '和風・居酒屋',
  日本料理: '和風・居酒屋',

  // 洋食
  洋食: '洋食',
  イタリアン: '洋食',
  フレンチ: '洋食',
  ビストロ: '洋食',
  バル: '洋食',
  ダイニングバー: '洋食',
  ダイニング: '洋食',
  ステーキ: '洋食',
  ハンバーグ: '洋食',
  パスタ: '洋食',
  ピザ: '洋食',
  スペイン料理: '洋食',
  欧風料理: '洋食',
  西洋料理: '洋食',

  // 中華
  中華: '中華',
  中華料理: '中華',
  台湾料理: '中華',
  四川料理: '中華',
  点心: '中華',
  飲茶: '中華',
  餃子: '中華',

  // 焼肉
  焼肉: '焼肉',
  ホルモン: '焼肉',
  韓国料理: '焼肉',

  // カフェ
  カフェ: 'カフェ',
  喫茶店: 'カフェ',
  スイーツ: 'カフェ',
}

const GENRE_CODE_TO_GROUP: Record<string, keyof typeof GENRE_MAP> = {
  G001: '和風・居酒屋',
  G004: '和風・居酒屋',
  G006: '洋食',
  G007: '中華',
  G008: '焼肉',
  G014: 'カフェ',
}

function uniqBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []

  for (const item of items) {
    const key = getKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
}

function normalizeGenreLabel(label: string): string {
  return label.replace(/\s+/g, '').replace(/[・/／]/g, '').trim()
}

function canonicalizeGenre(raw: string): keyof typeof GENRE_MAP | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed in GENRE_MAP) {
    return trimmed as keyof typeof GENRE_MAP
  }

  if (trimmed in GENRE_ALIAS_MAP) {
    return GENRE_ALIAS_MAP[trimmed]
  }

  const normalized = normalizeGenreLabel(trimmed)

  for (const key of Object.keys(GENRE_MAP) as Array<keyof typeof GENRE_MAP>) {
    if (normalizeGenreLabel(key) === normalized) return key
  }

  for (const [alias, canonical] of Object.entries(GENRE_ALIAS_MAP)) {
    if (normalizeGenreLabel(alias) === normalized) return canonical
  }

  if (normalized.includes('イタリアン')) return '洋食'
  if (normalized.includes('フレンチ')) return '洋食'
  if (normalized.includes('バル')) return '洋食'
  if (normalized.includes('ビストロ')) return '洋食'
  if (normalized.includes('ダイニング')) return '洋食'
  if (normalized.includes('洋食')) return '洋食'

  if (normalized.includes('中華')) return '中華'
  if (normalized.includes('四川')) return '中華'
  if (normalized.includes('台湾')) return '中華'
  if (normalized.includes('点心')) return '中華'
  if (normalized.includes('飲茶')) return '中華'

  if (normalized.includes('焼肉')) return '焼肉'
  if (normalized.includes('ホルモン')) return '焼肉'
  if (normalized.includes('韓国')) return '焼肉'

  if (normalized.includes('カフェ')) return 'カフェ'
  if (normalized.includes('喫茶')) return 'カフェ'
  if (normalized.includes('スイーツ')) return 'カフェ'

  if (
    normalized.includes('居酒屋') ||
    normalized.includes('和食') ||
    normalized.includes('海鮮') ||
    normalized.includes('寿司') ||
    normalized.includes('鮨') ||
    normalized.includes('焼鳥') ||
    normalized.includes('焼き鳥') ||
    normalized.includes('鍋')
  ) {
    return '和風・居酒屋'
  }

  return null
}

function parseBudgetAverage(text?: string): ParsedBudget {
  if (!text) {
    return { min: null, max: null, representative: null }
  }

  const normalized = text
    .replace(/税込/g, '')
    .replace(/円/g, '')
    .replace(/,/g, '')
    .replace(/～/g, '-')
    .replace(/〜/g, '-')
    .replace(/~+/g, '-')

  const rangeMatch = normalized.match(/(\d{3,5})\s*-\s*(\d{3,5})/)
  if (rangeMatch) {
    const min = Number(rangeMatch[1])
    const max = Number(rangeMatch[2])
    return {
      min,
      max,
      representative: Math.round((min + max) / 2),
    }
  }

  const singleNumbers = normalized.match(/\d{3,5}/g)
  if (singleNumbers && singleNumbers.length > 0) {
    const nums = singleNumbers.map(Number).filter((n) => !Number.isNaN(n))
    const representative = nums.length > 0 ? Math.max(...nums) : null
    return {
      min: representative,
      max: representative,
      representative,
    }
  }

  return { min: null, max: null, representative: null }
}

function resolveGenre(preferredGenres?: string[]): SearchGenreConfig {
  const rawGenres = (preferredGenres ?? []).map((v) => v.trim()).filter(Boolean)

  const normalizedGenres = rawGenres
    .map(canonicalizeGenre)
    .filter((v): v is keyof typeof GENRE_MAP => !!v)

  const uniqueNormalizedGenres = Array.from(new Set(normalizedGenres))

  const primary = uniqueNormalizedGenres[0] ?? '和風・居酒屋'
  const baseConfig = GENRE_MAP[primary]

  const mergedSearchGenreCodes = Array.from(
    new Set(
      uniqueNormalizedGenres.flatMap((genre) => GENRE_MAP[genre].searchGenreCodes)
    )
  )

  return {
    displayGenre: uniqueNormalizedGenres.length > 0 ? uniqueNormalizedGenres.join('・') : baseConfig.displayGenre,
    searchGenreCodes:
      mergedSearchGenreCodes.length > 0 ? mergedSearchGenreCodes : baseConfig.searchGenreCodes,
    primaryGenreCode: baseConfig.primaryGenreCode,
    resolvedFrom: rawGenres,
    normalizedGenres: uniqueNormalizedGenres,
  }
}

function buildHotpepperUrl(args: {
  genreCode: string
  stationContext: ReturnType<typeof buildStationSearchContext>
  privateRoom?: string
  allYouCanDrink?: string
  nonSmoking?: boolean
  peopleCount?: number
}): string {
  const params = new URLSearchParams()
  params.set('key', HOTPEPPER_API_KEY)
  params.set('format', 'json')
  params.set('count', '120')
  params.set('order', '4')
  params.set('genre', args.genreCode)

  if (args.stationContext.searchMode === 'area' && args.stationContext.hpArea?.middleArea) {
    params.set('middle_area', args.stationContext.hpArea.middleArea)
  } else {
    params.set('large_service_area', 'SS10')
    params.set('keyword', args.stationContext.keyword)
  }

  if (args.privateRoom) {
    params.set('private_room', args.privateRoom)
  }

  if (args.allYouCanDrink) {
    params.set('free_drink', args.allYouCanDrink)
  }

  if (args.nonSmoking) {
    params.set('non_smoking', '1')
  }

  if (args.peopleCount && args.peopleCount > 0) {
    params.set('party_capacity', String(args.peopleCount))
  }

  return `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`
}

async function fetchGenreShops(url: string): Promise<HotpepperShop[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Hot Pepper API request failed: ${res.status}`)
  }

  const json = await res.json()
  return json?.results?.shop ?? []
}

function computeGenreScore(args: {
  shop: HotpepperShop
  primaryGenreCode: string
  searchGenreCodes: string[]
}): { genreBoost: number; genrePenalty: number; genreMatched: boolean } {
  const code = args.shop.genre?.code ?? ''
  const matched = args.searchGenreCodes.includes(code)

  if (code === args.primaryGenreCode) {
    return {
      genreBoost: 34,
      genrePenalty: 0,
      genreMatched: true,
    }
  }

  if (matched) {
    return {
      genreBoost: 22,
      genrePenalty: 0,
      genreMatched: true,
    }
  }

  const group = GENRE_CODE_TO_GROUP[code]
  const primaryGroup = GENRE_CODE_TO_GROUP[args.primaryGenreCode]

  if (group && primaryGroup && group === primaryGroup) {
    return {
      genreBoost: 16,
      genrePenalty: 0,
      genreMatched: true,
    }
  }

  return {
    genreBoost: 0,
    genrePenalty: -16,
    genreMatched: false,
  }
}

function computePriceScore(parsed: ParsedBudget, requestedPriceRange: string): number {
  const value = parsed.representative

  if (value == null) return 8

  if (requestedPriceRange === '4,001〜5,000円') {
    if (value >= 4001 && value <= 5000) return 40
    if (value >= 3500 && value <= 5500) return 26
    return 8
  }

  if (requestedPriceRange === '5,001〜7,000円') {
    if (value >= 5001 && value <= 7000) return 40
    if (value >= 4500 && value <= 7500) return 26
    return 8
  }

  if (requestedPriceRange === '3,001〜4,000円') {
    if (value >= 3001 && value <= 4000) return 40
    if (value >= 2500 && value <= 4500) return 26
    return 8
  }

  // 指定なし
  if (value >= 4000 && value <= 7000) return 28
  if (value >= 3500 && value < 4000) return 20
  if (value > 7000 && value <= 8000) return 16
  if (value >= 2500 && value < 3500) return 12
  return 6
}

function shouldKeepByPrice(parsed: ParsedBudget, requestedPriceRange: string): boolean {
  const value = parsed.representative
  if (value == null) return true

  if (requestedPriceRange === '4,001〜5,000円') {
    return value >= 3200 && value <= 5800
  }

  if (requestedPriceRange === '5,001〜7,000円') {
    return value >= 4300 && value <= 7800
  }

  if (requestedPriceRange === '3,001〜4,000円') {
    return value >= 2500 && value <= 4800
  }

  // 指定なし
  return value >= 3500 && value <= 8000
}

function prefilterByPrice(shops: HotpepperShop[], requestedPriceRange: string) {
  const filtered = shops.filter((shop) => {
    const parsed = parseBudgetAverage(shop.budget?.average)
    return shouldKeepByPrice(parsed, requestedPriceRange)
  })

  return {
    shops: filtered,
    usedRelaxation: false,
  }
}

function maybePrefilterByGenre(shops: HotpepperShop[], searchGenreCodes: string[]) {
  if (searchGenreCodes.length === 0) {
    return {
      shops,
      applied: false,
      beforeCount: shops.length,
      afterCount: shops.length,
    }
  }

  const genreMatched = shops.filter((shop) => {
    const code = shop.genre?.code ?? ''
    return searchGenreCodes.includes(code)
  })

  // 一致店が十分あるときだけ事前に絞る
  if (genreMatched.length >= 12) {
    return {
      shops: genreMatched,
      applied: true,
      beforeCount: shops.length,
      afterCount: genreMatched.length,
    }
  }

  return {
    shops,
    applied: false,
    beforeCount: shops.length,
    afterCount: shops.length,
  }
}

function scoreShop(args: {
  shop: HotpepperShop
  targetStation: string
  requestedPriceRange: string
  primaryGenreCode: string
  searchGenreCodes: string[]
}): ScoredShop {
  const parsedBudget = parseBudgetAverage(args.shop.budget?.average)
  const stationMatch = isStationMatch(args.targetStation, args.shop.station_name)
  const priceScore = computePriceScore(parsedBudget, args.requestedPriceRange)
  const { genreBoost, genrePenalty, genreMatched } = computeGenreScore({
    shop: args.shop,
    primaryGenreCode: args.primaryGenreCode,
    searchGenreCodes: args.searchGenreCodes,
  })

  const stationScore = stationMatch ? 35 : 0
  const totalScore = stationScore + priceScore + genreBoost + genrePenalty

  return {
    ...args.shop,
    _debug: {
      parsedBudget,
      stationMatch,
      priceScore,
      genreBoost,
      genrePenalty,
      totalScore,
      genreMatched,
    },
  }
}

function compactShop(shop: ScoredShop) {
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address ?? '',
    station_name: shop.station_name ?? '',
    access: shop.mobile_access ?? shop.address ?? '',
    image_url:
      shop.photo?.mobile?.l ??
      shop.photo?.pc?.l ??
      shop.logo_image ??
      '',
    genre_code: shop.genre?.code ?? '',
    genre_name: shop.genre?.name ?? '',
    budget_code: shop.budget?.code ?? '',
    budget_average: shop.budget?.average ?? '',
    private_room: shop.private_room ?? '',
    free_drink: shop.free_drink ?? '',
    non_smoking: shop.non_smoking ?? '',
    catch: shop.catch ?? '',
    open: shop.open ?? '',
    url: shop.urls?.pc ?? '',
    tags: [
      shop.genre?.name ?? '',
      shop.catch ?? '',
      shop.open ?? '',
      shop.budget?.average ?? '',
      shop.private_room ? `個室:${shop.private_room}` : '',
      shop.free_drink ? `飲み放題:${shop.free_drink}` : '',
      shop.non_smoking ? `禁煙:${shop.non_smoking}` : '',
    ].filter(Boolean),
    _debug: shop._debug,
  }
}

async function callStoreSelect(args: {
  shops: ReturnType<typeof compactShop>[]
  conditions: {
    targetStation: string
    budgetCode?: string
    budgetLabel?: string
    priceRange?: string
    genre?: string
    peopleCount?: number
    eventType?: string
    broadAreaMode?: boolean
    areaAliases?: string[]
  }
}) {
  const stores = adaptHotpepperShopsToStoreSelect(args.shops)

  const baseUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/store-select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stores,
      conditions: args.conditions,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`store-select failed: ${res.status} ${text.slice(0, 200)}`)
  }

  return await res.json()
}

export async function POST(req: NextRequest) {
  try {
    if (!HOTPEPPER_API_KEY) {
      return NextResponse.json(
        { error: 'HOTPEPPER_API_KEY が設定されていません。' },
        { status: 500 }
      )
    }

    const body = (await req.json()) as RequestBody

    const areas = body.areas ?? []
    const rawTargetStation = body.targetStation || areas[0] || ''
    const stationContext = buildStationSearchContext(rawTargetStation)

    const genreConfig = resolveGenre(body.preferredGenres)
    const priceRange = body.priceRange ?? '指定なし'
    const privateRoom = body.privateRoom ?? ''
    const allYouCanDrink = body.allYouCanDrink ?? ''
    const nonSmoking = !!body.nonSmoking
    const peopleCount = body.peopleCount ?? 0
    const eventType = body.eventType ?? '飲み会'
    const broadAreaMode = !!body.broadAreaMode

    console.log('[hotpepper/search] request:', {
      areas,
      targetStation: rawTargetStation,
      canonicalStation: stationContext.canonical,
      hpArea: stationContext.hpArea,
      aliases: stationContext.aliases,
      matchedBy: stationContext.matchedBy,
      searchMode: stationContext.searchMode,
      preferredGenres: body.preferredGenres ?? [],
      resolvedGenreInput: genreConfig.resolvedFrom,
      normalizedGenres: genreConfig.normalizedGenres,
      searchGenreCodes: genreConfig.searchGenreCodes,
      displayGenre: genreConfig.displayGenre,
      primaryGenreCode: genreConfig.primaryGenreCode,
      priceRange,
      privateRoom,
      allYouCanDrink,
      nonSmoking,
      peopleCount,
      eventType,
      broadAreaMode,
    })

    const genreLogs: Array<{
      genre: string
      url: string
      resultCount: number
    }> = []

    const allGenreResults: HotpepperShop[] = []

    for (const genreCode of genreConfig.searchGenreCodes) {
      const url = buildHotpepperUrl({
        genreCode,
        stationContext,
        privateRoom,
        allYouCanDrink,
        nonSmoking,
        peopleCount,
      })

      const shops = await fetchGenreShops(url)
      allGenreResults.push(...shops)

      genreLogs.push({
        genre: genreCode,
        url,
        resultCount: shops.length,
      })
    }

    console.log('[hotpepper/search] multi-genre query logs:', genreLogs)

    const deduped = uniqBy(allGenreResults, (shop) => shop.id)

    const pricePrefilter = prefilterByPrice(deduped, priceRange)
    const afterPrice = pricePrefilter.shops

    console.log('[hotpepper/search] price prefilter:', {
      requestedPriceRange: priceRange,
      beforeCount: deduped.length,
      afterCount: afterPrice.length,
      usedRelaxation: pricePrefilter.usedRelaxation,
    })

    const genrePrefilter = maybePrefilterByGenre(afterPrice, genreConfig.searchGenreCodes)
    const afterGenre = genrePrefilter.shops

    console.log('[hotpepper/search] genre prefilter:', {
      searchGenreCodes: genreConfig.searchGenreCodes,
      applied: genrePrefilter.applied,
      beforeCount: genrePrefilter.beforeCount,
      afterCount: genrePrefilter.afterCount,
    })

    const scored = afterGenre
      .map((shop) =>
        scoreShop({
          shop,
          targetStation: stationContext.canonical,
          requestedPriceRange: priceRange,
          primaryGenreCode: genreConfig.primaryGenreCode,
          searchGenreCodes: genreConfig.searchGenreCodes,
        })
      )
      .sort((a, b) => b._debug.totalScore - a._debug.totalScore)

    const stationMatchCount = scored.filter((shop) => shop._debug.stationMatch).length
    const stationMatchRate =
      scored.length > 0 ? `${Math.round((stationMatchCount / scored.length) * 100)}%` : '0%'

    const genreMatchCount = scored.filter((shop) => shop._debug.genreMatched).length
    const genreMatchRate =
      scored.length > 0 ? `${Math.round((genreMatchCount / scored.length) * 100)}%` : '0%'

    console.log('[hotpepper/search] shop diagnostics:', {
      station: stationContext.canonical,
      aliases: stationContext.aliases,
      requestedPriceRange: priceRange,
      displayGenre: genreConfig.displayGenre,
      normalizedGenres: genreConfig.normalizedGenres,
      primaryGenreCode: genreConfig.primaryGenreCode,
      searchGenreCodes: genreConfig.searchGenreCodes,
      shops: scored.slice(0, 30).map((shop) => ({
        name: shop.name,
        station_name: shop.station_name,
        budget_code: shop.budget?.code,
        budget_average: shop.budget?.average,
        parsed_budget: shop._debug.parsedBudget,
        genre_code: shop.genre?.code,
        genre_name: shop.genre?.name,
        stationMatch: shop._debug.stationMatch,
        genreMatched: shop._debug.genreMatched,
        priceScore: shop._debug.priceScore,
        genreBoost: shop._debug.genreBoost,
        genrePenalty: shop._debug.genrePenalty,
        totalScore: shop._debug.totalScore,
      })),
    })

    console.log('[hotpepper/search] station match rate:', {
      station: stationContext.canonical,
      aliases: stationContext.aliases,
      matchCount: stationMatchCount,
      total: scored.length,
      rate: stationMatchRate,
    })

    console.log('[hotpepper/search] genre match rate:', {
      searchGenreCodes: genreConfig.searchGenreCodes,
      matchCount: genreMatchCount,
      total: scored.length,
      rate: genreMatchRate,
    })

    const shops = scored.map(compactShop)

    let selection: unknown = null
    let selectionUsedFallback = true
    let selectionError: string | null = null

    try {
      const selectionResult = await callStoreSelect({
        shops,
        conditions: {
          targetStation: stationContext.canonical,
          priceRange,
          genre: genreConfig.displayGenre,
          peopleCount,
          eventType,
          broadAreaMode,
          areaAliases: broadAreaMode
            ? Array.from(
                new Set([
                  ...stationContext.aliases,
                  ...(body.areaAliases ?? []),
                ])
              )
            : stationContext.aliases,
        },
      })

      selection = selectionResult?.selection ?? null
      selectionUsedFallback = !!selectionResult?.usedFallback
    } catch (e) {
      const message = e instanceof Error ? e.message : 'store_select_failed'
      selectionError = message
      console.error('[hotpepper/search] store-select error:', message)
    }

    return NextResponse.json({
      station: stationContext.canonical,
      aliases: stationContext.aliases,
      hpArea: stationContext.hpArea,
      displayGenre: genreConfig.displayGenre,
      normalizedGenres: genreConfig.normalizedGenres,
      primaryGenreCode: genreConfig.primaryGenreCode,
      requestedPriceRange: priceRange,
      count: shops.length,
      shops,
      selection,
      selectionUsedFallback,
      selectionError,
    })
  } catch (error) {
    console.error('[hotpepper/search] error:', error)

    return NextResponse.json(
      {
        error: '店検索に失敗しました。',
        detail: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 }
    )
  }
}