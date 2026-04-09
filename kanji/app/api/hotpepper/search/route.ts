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
    totalScore: number
  }
}

const GENRE_MAP: Record<string, SearchGenreConfig> = {
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
  const first = preferredGenres?.[0] ?? '和風・居酒屋'
  return GENRE_MAP[first] ?? GENRE_MAP['和風・居酒屋']
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

function computeGenreBoost(
  shop: HotpepperShop,
  primaryGenreCode: string,
  displayGenre: string
): number {
  const code = shop.genre?.code ?? ''

  if (code === primaryGenreCode) return 18

  if (displayGenre === '和風・居酒屋') {
    if (code === 'G004') return 10
    return 8
  }

  return 10
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

function scoreShop(args: {
  shop: HotpepperShop
  targetStation: string
  requestedPriceRange: string
  primaryGenreCode: string
  displayGenre: string
}): ScoredShop {
  const parsedBudget = parseBudgetAverage(args.shop.budget?.average)
  const stationMatch = isStationMatch(args.targetStation, args.shop.station_name)
  const priceScore = computePriceScore(parsedBudget, args.requestedPriceRange)
  const genreBoost = computeGenreBoost(args.shop, args.primaryGenreCode, args.displayGenre)

  const stationScore = stationMatch ? 35 : 0
  const totalScore = stationScore + priceScore + genreBoost

  return {
    ...args.shop,
    _debug: {
      parsedBudget,
      stationMatch,
      priceScore,
      genreBoost,
      totalScore,
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

    const scored = afterPrice
      .map((shop) =>
        scoreShop({
          shop,
          targetStation: stationContext.canonical,
          requestedPriceRange: priceRange,
          primaryGenreCode: genreConfig.primaryGenreCode,
          displayGenre: genreConfig.displayGenre,
        })
      )
      .sort((a, b) => b._debug.totalScore - a._debug.totalScore)

    const stationMatchCount = scored.filter((shop) => shop._debug.stationMatch).length
    const stationMatchRate =
      scored.length > 0 ? `${Math.round((stationMatchCount / scored.length) * 100)}%` : '0%'

    console.log('[hotpepper/search] shop diagnostics:', {
      station: stationContext.canonical,
      aliases: stationContext.aliases,
      requestedPriceRange: priceRange,
      displayGenre: genreConfig.displayGenre,
      primaryGenreCode: genreConfig.primaryGenreCode,
      shops: scored.slice(0, 30).map((shop) => ({
        name: shop.name,
        station_name: shop.station_name,
        budget_code: shop.budget?.code,
        budget_average: shop.budget?.average,
        parsed_budget: shop._debug.parsedBudget,
        genre_code: shop.genre?.code,
        stationMatch: shop._debug.stationMatch,
        priceScore: shop._debug.priceScore,
        genreBoost: shop._debug.genreBoost,
      })),
    })

    console.log('[hotpepper/search] station match rate:', {
      station: stationContext.canonical,
      aliases: stationContext.aliases,
      matchCount: stationMatchCount,
      total: scored.length,
      rate: stationMatchRate,
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