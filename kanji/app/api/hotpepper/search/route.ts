import { NextRequest, NextResponse } from 'next/server'

const GENRE_MAP: Record<string, string> = {
  '居酒屋': 'G001',
  'ダイニングバー・バル': 'G002',
  '創作料理': 'G003',
  '和食': 'G004',
  '洋食': 'G005',
  'イタリアン・フレンチ': 'G006',
  '中華': 'G007',
  '焼肉・ホルモン': 'G008',
  'アジア・エスニック料理': 'G009',
  '各国料理': 'G010',
  'カラオケ・パーティ': 'G011',
  'バー・カクテル': 'G012',
  'ラーメン': 'G013',
  'カフェ・スイーツ': 'G014',
  'お好み焼き・もんじゃ': 'G016',
  '韓国料理': 'G017',
  '焼き鳥': 'G001',
}

const STATION_HP_AREA_MAP: Record<string, { middleArea?: string; smallArea?: string }> = {
  横浜: { middleArea: 'Y135', smallArea: 'X270' },
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
}

function parseWalkMinutes(access: string): number | null {
  const m = access.match(/徒歩(\d+)分/)
  return m ? parseInt(m[1], 10) : null
}

function hasPrivateRoom(shop: any): boolean {
  return shop?.private_room === 'あり' || shop?.private_room === '1'
}

function stationNameOf(shop: any): string {
  return typeof shop?.station_name === 'string' ? shop.station_name.trim() : ''
}

function normalizePriceText(text: string): string {
  return text.replace(/[【】\[\]（）()]/g, ' ').replace(/\s+/g, ' ').trim()
}

function estimateDinnerRangeFromAverage(average: string): { min: number | null; max: number | null } {
  const text = normalizePriceText(average)
  const dinnerRange =
    text.match(/ディナー[^0-9]*([0-9,]+)円[^0-9]*[～〜\-~][^0-9]*([0-9,]+)円/) ||
    text.match(/ディナー[^0-9]*([0-9,]+)円[^0-9]*([0-9,]+)円/)
  if (dinnerRange) {
    return {
      min: parseInt(dinnerRange[1].replace(/,/g, ''), 10),
      max: parseInt(dinnerRange[2].replace(/,/g, ''), 10),
    }
  }
  const genericRange = text.match(/([0-9,]+)円[^0-9]*[～〜\-~][^0-9]*([0-9,]+)円/)
  if (genericRange) {
    return {
      min: parseInt(genericRange[1].replace(/,/g, ''), 10),
      max: parseInt(genericRange[2].replace(/,/g, ''), 10),
    }
  }
  const dinnerSingle = text.match(/ディナー[^0-9]*([0-9,]+)円/)
  if (dinnerSingle) {
    const value = parseInt(dinnerSingle[1].replace(/,/g, ''), 10)
    return { min: value, max: value }
  }
  return { min: null, max: null }
}

function requestedPriceRangeToNumbers(priceRange: string): { min: number | null; max: number | null } {
  switch (priceRange) {
    case '3,000円以下': return { min: 0, max: 3000 }
    case '3,001〜4,000円': return { min: 3001, max: 4000 }
    case '4,001〜5,000円': return { min: 4001, max: 5000 }
    case '5,001〜7,000円': return { min: 5001, max: 7000 }
    case '7,001〜10,000円': return { min: 7001, max: 10000 }
    default: return { min: null, max: null }
  }
}

function priceRangeScoreFromAverage(requestedPriceRange: string, average: string): number {
  const requested = requestedPriceRangeToNumbers(requestedPriceRange)
  const actual = estimateDinnerRangeFromAverage(average)
  if (requested.min === null || requested.max === null) return 0
  if (actual.min === null || actual.max === null) return -4
  const overlaps = actual.max >= requested.min && actual.min <= requested.max
  if (overlaps) return 14
  if (actual.max < requested.min) {
    const gap = requested.min - actual.max
    if (gap <= 1000) return 6
    if (gap <= 3000) return 1
    return -8
  }
  if (actual.min > requested.max) {
    const gap = actual.min - requested.max
    if (gap <= 1000) return 5
    if (gap <= 3000) return 0
    return -6
  }
  return 0
}

function buildShopTags(shop: any): string[] {
  const raw = [shop?.genre?.name, shop?.sub_genre?.name, shop?.catch, shop?.name].filter(Boolean).join(' ')
  const tags = new Set<string>()
  if (/焼き鳥|やきとり|串焼|串揚|串|鶏料理/.test(raw)) tags.add('焼き鳥系')
  if (/焼肉|ホルモン/.test(raw)) tags.add('焼肉系')
  if (/海鮮|魚|寿司|刺身/.test(raw)) tags.add('海鮮系')
  if (/個室/.test(raw)) tags.add('個室あり')
  return Array.from(tags)
}

function buildReason(shop: any): string {
  const parts: string[] = []
  const walkMins = parseWalkMinutes(String(shop?.access ?? ''))
  if (walkMins !== null) parts.push(`徒歩${walkMins}分`)
  if (shop?.genre?.name) parts.push(shop.genre.name)
  if (typeof shop?.budget?.average === 'string' && shop.budget.average) parts.push(shop.budget.average)
  if (hasPrivateRoom(shop)) parts.push('個室あり')
  if (shop?.catch) return shop.catch
  return parts.length > 0 ? parts.join('・') : '条件に合う候補です'
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

function baseAreaParams(apiKey: string, targetStation: string) {
  const params = new URLSearchParams({
    key: apiKey,
    format: 'json',
    count: '50',
    order: '4',
    large_service_area: 'SS10',
  })
  const hpArea = STATION_HP_AREA_MAP[targetStation]
  if (hpArea?.middleArea) params.set('middle_area', hpArea.middleArea)
  else if (hpArea?.smallArea) params.set('small_area', hpArea.smallArea)
  else if (targetStation) params.set('keyword', targetStation.endsWith('駅') ? targetStation : `${targetStation}駅`)
  return params
}

function withOptionalCommonFilters(params: URLSearchParams, args: { privateRoom: string; allYouCanDrink: string; peopleCount?: number }) {
  const next = new URLSearchParams(params)
  if (args.privateRoom === '個室あり') next.set('private_room', '1')
  if (args.allYouCanDrink === '希望') next.set('free_drink', '1')
  if (args.peopleCount && args.peopleCount >= 10) next.set('party_capacity', String(args.peopleCount))
  return next
}

function makeGenreParams(base: URLSearchParams, genres: string[]) {
  const next = new URLSearchParams(base)
  const genreCode = genres.map((g) => (g.startsWith('G') && g.length <= 4 ? g : GENRE_MAP[g])).find(Boolean)
  if (genreCode) next.set('genre', genreCode)
  return next
}

function dedupeShops(shops: any[]): any[] {
  const seen = new Set<string>()
  const result: any[] = []
  for (const shop of shops) {
    const id = String(shop?.id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(shop)
  }
  return result
}

function shopMatchesStation(shop: any, targetStation: string): boolean {
  if (!targetStation) return true
  const stationName = stationNameOf(shop)
  if (stationName) return stationName === targetStation
  const access = String(shop?.access ?? '')
  return access.includes(`${targetStation}駅`)
}

function isClearlyOtherStation(shop: any, targetStation: string): boolean {
  if (!targetStation) return false
  const stationName = stationNameOf(shop)
  if (!stationName) return false
  return stationName !== targetStation
}

function genreSpecificBoost(shop: any, requestedGenreCode: string | null): number {
  if (!requestedGenreCode) return 0
  const text = [String(shop?.genre?.name ?? ''), String(shop?.sub_genre?.name ?? ''), String(shop?.name ?? ''), String(shop?.catch ?? '')].join(' ')
  if (requestedGenreCode === 'G001') {
    if (/焼き鳥|やきとり|串焼|串揚|串|鶏料理/.test(text)) return 8
    if (/居酒屋/.test(text)) return 2
    return -3
  }
  return 0
}

function scoreStoreForSelection(shop: any, targetStation: string, maxWalk: number | null, priceRange: string, requestedGenreCode: string | null): number {
  let score = 0
  if (shopMatchesStation(shop, targetStation)) score += 18
  if (isClearlyOtherStation(shop, targetStation)) score -= 18
  const walkMins = parseWalkMinutes(String(shop?.access ?? ''))
  if (maxWalk !== null && walkMins !== null) {
    if (walkMins <= maxWalk) score += 10
    else if (walkMins <= Math.min(maxWalk + 5, 20)) score += 3
    else score -= 10
  }
  score += priceRangeScoreFromAverage(priceRange, typeof shop?.budget?.average === 'string' ? shop.budget.average : '')
  const shopGenreCode = typeof shop?.genre?.code === 'string' ? shop.genre.code : null
  if (requestedGenreCode && shopGenreCode === requestedGenreCode) score += 6
  score += genreSpecificBoost(shop, requestedGenreCode)
  if (walkMins !== null) score += Math.max(0, 10 - walkMins)
  return score
}

function compressBeforeGemini(args: { shops: any[]; targetStation: string; maxWalk: number | null; priceRange: string; requestedGenreCode: string | null; limit?: number }) {
  const { shops, targetStation, maxWalk, priceRange, requestedGenreCode, limit = 12 } = args
  const scored = shops.map((shop) => {
    const walkMins = parseWalkMinutes(String(shop?.access ?? ''))
    const stationMatch = shopMatchesStation(shop, targetStation)
    const clearlyOtherStation = isClearlyOtherStation(shop, targetStation)
    const walkTier = maxWalk === null ? 0 : walkMins === null ? 1 : walkMins <= maxWalk ? 0 : walkMins <= 20 ? 2 : 3
    const priceScore = priceRangeScoreFromAverage(priceRange, typeof shop?.budget?.average === 'string' ? shop.budget.average : '')
    return {
      shop,
      stationMatch,
      clearlyOtherStation,
      walkTier,
      priceScore,
      score: scoreStoreForSelection(shop, targetStation, maxWalk, priceRange, requestedGenreCode),
    }
  })
  const notOtherStation = scored.filter((s) => !s.clearlyOtherStation)
  const basePool = notOtherStation.length > 0 ? notOtherStation : scored
  const tierA = basePool.filter((s) => s.walkTier === 0)
  const tierB = basePool.filter((s) => s.walkTier === 1)
  const tierC = basePool.filter((s) => s.walkTier === 2)
  const sortDesc = (pool: typeof scored) => [...pool].sort((a, b) => b.score - a.score)
  const merged = [...sortDesc(tierA), ...sortDesc(tierB), ...sortDesc(tierC)].slice(0, limit)
  const hasOverlappingPrice = merged.some((s) => s.priceScore >= 14)
  return {
    shops: merged.map((s) => s.shop),
    budgetRelaxedForBest: priceRange !== '指定なし' && !hasOverlappingPrice,
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RECRUIT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ stores: [], fallback: false, error: 'RECRUIT_API_KEY is not set' }, { status: 500 })
  }
  try {
    const body = await req.json()
    const prefs = body?.orgPrefs ?? body ?? {}

    const areas = normalizeStringArray(prefs?.areas)
    const targetStation = areas[0]?.trim() ?? ''
    const hpArea = STATION_HP_AREA_MAP[targetStation] ?? null
    const genreCodes = normalizeStringArray(body?.genreCodes ?? prefs?.genreCodes)
    const genreLabels = normalizeStringArray(prefs?.genres)
    const genres = genreCodes.length > 0 ? genreCodes : genreLabels
    const priceRange = typeof prefs?.priceRange === 'string' ? prefs.priceRange : '指定なし'
    const privateRoom = typeof prefs?.privateRoom === 'string' ? prefs.privateRoom : 'こだわらない'
    const allYouCanDrink = typeof body?.allYouCanDrink === 'string' ? body.allYouCanDrink : ''
    const peopleCount = typeof body?.peopleCount === 'number' ? body.peopleCount : undefined
    const walkMinutesStr = typeof body?.walkMinutes === 'string' ? body.walkMinutes : '指定なし'
    const maxWalk: number | null = walkMinutesStr === '指定なし' || !walkMinutesStr ? null : parseInt(walkMinutesStr.replace('分以内', ''), 10) || null

    const areaBase = baseAreaParams(apiKey, targetStation)
    const commonBase = withOptionalCommonFilters(areaBase, { privateRoom, allYouCanDrink, peopleCount })
    const areaGenreParams = makeGenreParams(commonBase, genres)

    console.log('[hotpepper/search] request:', {
      areas,
      targetStation,
      hpArea,
      genreCodes,
      genreLabels,
      priceRange,
      privateRoom,
      allYouCanDrink,
      peopleCount,
      areaGenreParams: areaGenreParams.toString(),
    })

    const genreResult = await fetchHotpepper(areaGenreParams)
    const requestedGenreCode = areaGenreParams.get('genre') ?? null

    console.log('[hotpepper/search] strict genre query:', {
      small_area: areaGenreParams.get('small_area') ?? '(なし)',
      middle_area: areaGenreParams.get('middle_area') ?? '(なし)',
      keyword: areaGenreParams.get('keyword') ?? '(なし)',
      genre: areaGenreParams.get('genre') ?? '(なし)',
      requested_price_range: priceRange,
      private_room: areaGenreParams.get('private_room') ?? '(なし)',
      free_drink: areaGenreParams.get('free_drink') ?? '(なし)',
      party_capacity: areaGenreParams.get('party_capacity') ?? '(なし)',
      count: areaGenreParams.get('count'),
      order: areaGenreParams.get('order'),
      url: genreResult.url,
      resultCount: genreResult.shops.length,
    })

    console.log('[hotpepper/search] strict genre totals:', {
      results_available: genreResult.data?.results?.results_available ?? null,
      results_returned: genreResult.data?.results?.results_returned ?? null,
      results_start: genreResult.data?.results?.results_start ?? null,
      shopsLength: genreResult.shops.length,
    })

    const unionShops = dedupeShops(genreResult.shops)
    if (unionShops.length === 0) {
      return NextResponse.json({
        stores: [],
        fallback: false,
        searchMode: 'strict-genre-only',
        budgetRelaxedForBest: false,
        emptyState: {
          title: '条件に合う候補が見つかりませんでした',
          body: 'Hot Pepper の条件一致結果が0件でした。条件を見直してください。',
          cta: '条件を調整する',
        },
      })
    }

    console.log('[hotpepper/search] shop diagnostics:', {
      station: targetStation || '(未設定)',
      maxWalk,
      requestedPriceRange: priceRange,
      requestedGenreCode: requestedGenreCode ?? '(指定なし)',
      shops: unionShops.map((s) => ({
        name: s.name,
        station_name: s.station_name ?? '(なし)',
        budget_code: s?.budget?.code ?? '(なし)',
        budget_average: s?.budget?.average ?? '(なし)',
        genre_code: s?.genre?.code ?? '(なし)',
        walkMins: parseWalkMinutes(String(s?.access ?? '')) ?? '不明',
        stationMatch: shopMatchesStation(s, targetStation),
        withinWalk: maxWalk === null || parseWalkMinutes(String(s?.access ?? '')) === null || (parseWalkMinutes(String(s?.access ?? '')) ?? 999) <= maxWalk,
        priceScore: priceRangeScoreFromAverage(priceRange, typeof s?.budget?.average === 'string' ? s.budget.average : ''),
        genreBoost: genreSpecificBoost(s, requestedGenreCode),
      })),
    })

    const matchCount = unionShops.filter((s) => shopMatchesStation(s, targetStation)).length
    const matchRate = unionShops.length > 0 ? matchCount / unionShops.length : 0
    console.log('[hotpepper/search] station match rate:', {
      station: targetStation,
      matchCount,
      total: unionShops.length,
      rate: `${Math.round(matchRate * 100)}%`,
    })

    const compressed = compressBeforeGemini({
      shops: unionShops,
      targetStation,
      maxWalk,
      priceRange,
      requestedGenreCode,
      limit: 12,
    })

    return NextResponse.json({
      stores: compressed.shops.map(mapShopToStore),
      fallback: false,
      searchMode: 'strict-genre-only',
      budgetRelaxedForBest: compressed.budgetRelaxedForBest,
    })
  } catch (e: any) {
    console.error('[hotpepper/search] error:', e?.message ?? e)
    return NextResponse.json({ stores: [], fallback: false, error: e?.message ?? 'unknown error' }, { status: 500 })
  }
}
