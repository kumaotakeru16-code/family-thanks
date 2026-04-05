import { NextRequest, NextResponse } from 'next/server'

// Hot Pepper budget codes
const BUDGET_MAP: Record<string, string> = {
  '3,000円以下': 'B005',
  '3,001〜4,000円': 'B006',
  '4,001〜5,000円': 'B007',
  '5,001〜7,000円': 'B008',
  '7,001〜10,000円': 'B009',
  '指定なし': '',
}

// Hot Pepper genre codes
const GENRE_MAP: Record<string, string> = {
  '居酒屋': 'G001',
  '和食': 'G004',
  '洋食': 'G005',
  'イタリアン・フレンチ': 'G006',
  '中華': 'G007',
  '焼肉・ホルモン': 'G008',
  '焼き鳥': 'G001', // HP に焼き鳥専用コードがないため居酒屋で取得し後段で圧縮
  '韓国料理': 'G017',
  'カフェ・スイーツ': 'G014',
  'バー・ダイニングバー': 'G012',
  'アジア・エスニック': 'G009',
}

const FALLBACK_STORE_POOL = [
  {
    id: 'fb-a1',
    name: '個室和食 紬 渋谷店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩3分',
    reason: '渋谷周辺で集まりやすく、個室ありで落ち着いて過ごせる参考候補です。',
    link: '',
    image: undefined,
    tags: ['完全個室', '和食', '駅近'],
  },
  {
    id: 'fb-a2',
    name: '美食米門 新宿店',
    area: '新宿',
    access: 'JR新宿駅 徒歩3分',
    reason: '新宿周辺で集まりやすく、多人数にも対応しやすい参考候補です。',
    link: '',
    image: undefined,
    tags: ['駅近', '居酒屋'],
  },
  {
    id: 'fb-a3',
    name: '個室 焼肉 ごぶとん 渋谷本店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩2分',
    reason: '渋谷周辺で焼肉系を楽しみたい場合の参考候補です。',
    link: '',
    image: undefined,
    tags: ['個室', '焼肉', '駅近'],
  },
  {
    id: 'fb-b1',
    name: '和食個室 いぶき 池袋店',
    area: '池袋',
    access: 'JR池袋駅 徒歩4分',
    reason: '池袋周辺で集まりやすく、落ち着いた個室で会食にも使いやすい参考候補です。',
    link: '',
    image: undefined,
    tags: ['完全個室', '和食', '会食向き'],
  },
  {
    id: 'fb-b2',
    name: '海鮮居酒屋 漁火 品川店',
    area: '品川',
    access: 'JR品川駅 徒歩5分',
    reason: '品川周辺でアクセスよく、海鮮系で外しにくい参考候補です。',
    link: '',
    image: undefined,
    tags: ['居酒屋', '海鮮', '駅近'],
  },
  {
    id: 'fb-b3',
    name: '炭火焼鳥 串蔵 恵比寿店',
    area: '恵比寿',
    access: 'JR恵比寿駅 徒歩4分',
    reason: '恵比寿周辺の焼き鳥系で、少人数から利用しやすい参考候補です。',
    link: '',
    image: undefined,
    tags: ['焼き鳥', '個室', '駅近'],
  },
  {
    id: 'fb-c1',
    name: '個室ダイニング 颯 銀座店',
    area: '銀座',
    access: '東京メトロ銀座駅 徒歩3分',
    reason: '銀座エリアで会食向きの個室ダイニング、特別な席にも使いやすい参考候補です。',
    link: '',
    image: undefined,
    tags: ['会食向き', '個室', '駅近'],
  },
  {
    id: 'fb-c2',
    name: '韓国料理 ハル 新大久保店',
    area: '新大久保',
    access: 'JR新大久保駅 徒歩2分',
    reason: '新大久保の本格韓国料理で、飲み放題も選べる参考候補です。',
    link: '',
    image: undefined,
    tags: ['韓国料理', '飲み放題', '駅近'],
  },
]

function pickFallbackStores(n = 3) {
  const pool = [...FALLBACK_STORE_POOL]
  const picked = []
  while (picked.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
}

function hasPrivateRoom(shop: any): boolean {
  return shop?.private_room === 'あり' || shop?.private_room === '1'
}

function buildReason(shop: any): string {
  const parts: string[] = []

  if (shop?.genre?.name) parts.push(shop.genre.name)
  if (shop?.budget?.average) parts.push(`予算${shop.budget.average}`)
  if (hasPrivateRoom(shop)) parts.push('個室あり')
  if (shop?.access) parts.push('アクセス良好')

  if (shop?.catch) return shop.catch
  if (parts.length > 0) return parts.join('・')
  return '条件に合う候補です'
}

function buildShopTags(shop: any): string[] {
  const raw = [
    shop?.genre?.name,
    shop?.sub_genre?.name,
    shop?.catch,
    shop?.budget?.average ? `予算${shop.budget.average}` : undefined,
    hasPrivateRoom(shop) ? '個室あり' : undefined,
    shop?.wifi === 'あり' ? 'WiFiあり' : undefined,
    shop?.name,
  ]
    .filter((v): v is string => Boolean(v))
    .join(' ')

  const tags = new Set<string>()
  if (/焼き鳥|やきとり|串焼|串揚|串|鶏料理/.test(raw)) tags.add('焼き鳥系')
  if (/焼肉|ホルモン/.test(raw)) tags.add('焼肉系')
  if (/海鮮|魚|寿司|刺身/.test(raw)) tags.add('海鮮系')
  if (/個室/.test(raw)) tags.add('個室あり')
  return Array.from(tags)
}

function mapShopToStore(shop: any) {
  const derivedTags = buildShopTags(shop)
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
      shop.budget?.average ? `予算${shop.budget.average}` : undefined,
      hasPrivateRoom(shop) ? '個室あり' : undefined,
      shop.wifi === 'あり' ? 'WiFiあり' : undefined,
      ...derivedTags,
    ]
      .filter((t): t is string => Boolean(t))
      .slice(0, 6),
    stationName: typeof shop.station_name === 'string' ? shop.station_name : '',
    budgetCode: typeof shop.budget?.code === 'string' ? shop.budget.code : '',
    genre: shop.genre?.name ?? '',
    walkMinutes: parseWalkMinutes(shop.access ?? ''),
  }
}

async function fetchHotpepper(params: URLSearchParams) {
  const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`

  const res = await fetch(url, {
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Hot Pepper API error: HTTP ${res.status}`)
  }

  const data = await res.json()
  const shops: any[] = data?.results?.shop ?? []

  return {
    url,
    data,
    shops,
  }
}

function buildBaseParams(args: {
  apiKey: string
  areas: string[]
  priceRange: string
  genres: string[]
  privateRoom: string
  allYouCanDrink: string
  count: number
}) {
  const { apiKey, areas, priceRange, genres, privateRoom, allYouCanDrink, count } = args

  const params = new URLSearchParams({
    key: apiKey,
    format: 'json',
    count: String(Math.min(Math.max(count, 1), 30)),
  })

  // Hot Pepper では広めに取得し、横浜駅徒歩圏などの厳格判定は後段で行う
  const primaryArea = areas[0]?.trim() ?? ''
  params.set('large_service_area', 'SS10')
  if (primaryArea) {
    params.set('keyword', primaryArea)
  }

  const genreCode = genres
    .map((g) => (g.startsWith('G') && g.length <= 4 ? g : GENRE_MAP[g]))
    .find(Boolean)
  if (genreCode) {
    params.set('genre', genreCode)
  }

  const budgetCode = BUDGET_MAP[priceRange] ?? ''
  if (budgetCode) {
    params.set('budget', budgetCode)
  }

  if (privateRoom === '個室あり') {
    params.set('private_room', '1')
  }

  if (allYouCanDrink === '希望') {
    params.set('free_drink', '1')
  }

  return params
}

function parseWalkMinutes(access: string): number | null {
  const m = access.match(/徒歩(\d+)分/)
  return m ? parseInt(m[1], 10) : null
}

function shopMatchesStation(shop: any, primaryArea: string): boolean {
  const stationName = typeof shop?.station_name === 'string' ? shop.station_name.trim() : ''
  if (stationName) return stationName === primaryArea

  const access = String(shop?.access ?? '')
  const target = primaryArea + '駅'
  let from = 0
  while (true) {
    const idx = access.indexOf(target, from)
    if (idx < 0) return false
    if (idx === 0) return true
    const prevCode = access.charCodeAt(idx - 1)
    const isCJKBefore = prevCode >= 0x4e00 && prevCode <= 0x9fff
    if (!isCJKBefore) return true
    from = idx + 1
  }
}

const BUDGET_ORDER = ['B005', 'B006', 'B007', 'B008', 'B009'] as const

function getBudgetIndex(code?: string | null): number {
  if (!code) return -1
  return BUDGET_ORDER.indexOf(code as (typeof BUDGET_ORDER)[number])
}

function budgetProximityScore(requestedBudget: string | null, actualBudget?: string | null): number {
  if (!requestedBudget) return 0

  const reqIdx = getBudgetIndex(requestedBudget)
  const actIdx = getBudgetIndex(actualBudget)

  if (reqIdx === -1 || actIdx === -1) return -4
  if (reqIdx === actIdx) return 12

  const dist = Math.abs(reqIdx - actIdx)
  let score = 0
  if (dist === 1) score = 7
  else if (dist === 2) score = 3
  else if (dist === 3) score = -2
  else score = -6

  if (actIdx < reqIdx) {
    score -= (reqIdx - actIdx) * 2
  }

  return score
}

function genreSpecificBoost(shop: any, requestedGenreCode: string | null): number {
  if (!requestedGenreCode) return 0

  const genreName = String(shop?.genre?.name ?? '')
  const subGenreName = String(shop?.sub_genre?.name ?? '')
  const name = String(shop?.name ?? '')
  const catchText = String(shop?.catch ?? '')
  const text = [genreName, subGenreName, name, catchText].join(' ')

  if (requestedGenreCode === 'G001') {
    if (/焼き鳥|やきとり|串焼|串揚|串|鶏料理/.test(text)) return 8
    if (/居酒屋/.test(text)) return 2
    return -3
  }

  return 0
}

function scoreStoreForArea(
  shop: any,
  primaryArea: string,
  maxWalk: number | null,
  budgetCode: string | null,
  requestedGenreCode: string | null = null
): number {
  if (!primaryArea) return 0

  let score = 0

  const area = String(shop?.small_area?.name ?? shop?.middle_area?.name ?? shop?.address ?? '')
  const access = String(shop?.access ?? '')

  if (shopMatchesStation(shop, primaryArea)) score += 12
  if (area.startsWith(primaryArea)) score += 4

  if (maxWalk !== null) {
    const walkMins = parseWalkMinutes(access)
    if (walkMins !== null) {
      if (walkMins <= maxWalk) score += 10
      else if (walkMins <= Math.min(maxWalk + 5, 20)) score += 3
      else score -= 8
    }
  }

  const shopBudgetCode = typeof shop?.budget?.code === 'string' ? shop.budget.code : null
  score += budgetProximityScore(budgetCode, shopBudgetCode)
  score += genreSpecificBoost(shop, requestedGenreCode)

  return score
}

function compressBeforeGemini(args: {
  shops: any[]
  targetStation: string
  maxWalk: number | null
  budgetCode: string | null
  requestedGenreCode: string | null
  limit?: number
}): { shops: any[]; budgetRelaxedForBest: boolean } {
  const { shops, targetStation, maxWalk, budgetCode, requestedGenreCode, limit = 8 } = args

  if (!targetStation) {
    return { shops: shops.slice(0, limit), budgetRelaxedForBest: false }
  }

  const scored = shops.map((shop) => {
    const access = String(shop?.access ?? '')
    const walkMins = parseWalkMinutes(access)
    const stationMatch = shopMatchesStation(shop, targetStation)

    const walkTier =
      maxWalk === null
        ? 0
        : walkMins === null
          ? 1
          : walkMins <= maxWalk
            ? 0
            : walkMins <= 20
              ? 2
              : 3

    const shopBudgetCode = typeof shop?.budget?.code === 'string' ? shop.budget.code : null
    const shopGenreCode = typeof shop?.genre?.code === 'string' ? shop.genre.code : null
    const genreMatch = !requestedGenreCode || shopGenreCode === requestedGenreCode || genreSpecificBoost(shop, requestedGenreCode) > 0

    let score = scoreStoreForArea(shop, targetStation, maxWalk, budgetCode, requestedGenreCode)
    if (genreMatch) score += 5
    if (walkMins !== null) score += Math.max(0, 10 - walkMins)

    return {
      shop,
      stationMatch,
      walkTier,
      genreMatch,
      score,
      exactBudget: budgetCode ? shopBudgetCode === budgetCode : false,
    }
  })

  const stationMatched = scored.filter((s) => s.stationMatch)
  const stationFallback = stationMatched.length > 0 ? stationMatched : scored

  const tierA = stationFallback.filter((s) => s.walkTier === 0)
  const tierB = stationFallback.filter((s) => s.walkTier === 1)
  const tierC = stationFallback.filter((s) => s.walkTier === 2)

  const sortDesc = (pool: typeof scored) => [...pool].sort((a, b) => b.score - a.score)

  const merged = [...sortDesc(tierA), ...sortDesc(tierB), ...sortDesc(tierC)].slice(0, limit)
  const hasExactBudget = merged.some((s) => s.exactBudget)

  return {
    shops: merged.map((s) => s.shop),
    budgetRelaxedForBest: !!budgetCode && !hasExactBudget,
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RECRUIT_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      stores: pickFallbackStores(),
      fallback: true,
      error: 'RECRUIT_API_KEY is not set',
    })
  }

  try {
    const body = await req.json()
    const prefs = body?.orgPrefs ?? body ?? {}

    const areas = normalizeStringArray(prefs?.areas)
    const targetStation = areas[0]?.trim() ?? ''
    const genreCodes = normalizeStringArray(body?.genreCodes ?? prefs?.genreCodes)
    const genreLabels = normalizeStringArray(prefs?.genres)
    const genres = genreCodes.length > 0 ? genreCodes : genreLabels
    const priceRange = typeof prefs?.priceRange === 'string' ? prefs.priceRange : '指定なし'
    const privateRoom = typeof prefs?.privateRoom === 'string' ? prefs.privateRoom : 'こだわらない'
    const count = typeof body?.count === 'number' ? body.count : 6
    const allYouCanDrink = typeof body?.allYouCanDrink === 'string' ? body.allYouCanDrink : ''

    const walkMinutesStr = typeof body?.walkMinutes === 'string' ? body.walkMinutes : '指定なし'
    const maxWalk: number | null =
      walkMinutesStr === '指定なし' || !walkMinutesStr
        ? null
        : parseInt(walkMinutesStr.replace('分以内', ''), 10) || null

    const budgetCode = BUDGET_MAP[priceRange] || null

    const strictParams = buildBaseParams({
      apiKey,
      areas,
      priceRange,
      genres,
      privateRoom,
      allYouCanDrink,
      count,
    })

    console.log('[hotpepper/search] request:', {
      areas,
      targetStation,
      genreCodes,
      genreLabels,
      resolvedGenre: strictParams.get('genre') ?? '(なし)',
      priceRange,
      privateRoom,
      count,
      strictParams: strictParams.toString(),
    })

    let mode = 'strict'
    let result = await fetchHotpepper(strictParams)
    let shops = result.shops
    let finalParams = strictParams

    console.log('[hotpepper/search] strict query:', {
      service_area: strictParams.get('service_area') ?? '(なし)',
      keyword: strictParams.get('keyword') ?? '(なし)',
      genre: strictParams.get('genre') ?? '(なし)',
      budget: strictParams.get('budget') ?? '(なし)',
      private_room: strictParams.get('private_room') ?? '(なし)',
      free_drink: strictParams.get('free_drink') ?? '(なし)',
      count: strictParams.get('count'),
      url: result.url,
      resultCount: shops.length,
    })

    if (shops.length === 0 && finalParams.get('free_drink') === '1') {
      console.log('[hotpepper/search] relaxing: dropping free_drink')
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('free_drink')
      mode = 'relaxed-no-free-drink'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    if (shops.length === 0 && finalParams.get('private_room') === '1') {
      console.log('[hotpepper/search] relaxing: dropping private_room')
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('private_room')
      mode = 'relaxed-no-private-room'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    if (shops.length === 0 && finalParams.get('budget')) {
      console.log('[hotpepper/search] relaxing: dropping budget', finalParams.get('budget'))
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('budget')
      mode = 'relaxed-no-budget'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    if (shops.length === 0 && finalParams.get('genre')) {
      const droppedGenre = finalParams.get('genre')
      console.log('[hotpepper/search] relaxing: dropping genre', droppedGenre)
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('genre')
      mode = 'relaxed-no-genre'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    console.log('[hotpepper/search] response:', {
      mode,
      url: result.url,
      returned: shops.length,
      sampleShop: shops[0]
        ? {
            id: shops[0].id,
            name: shops[0].name,
            access: shops[0].access,
            area: shops[0]?.small_area?.name ?? shops[0]?.middle_area?.name,
            url: shops[0]?.urls?.pc,
          }
        : null,
    })

    if (shops.length === 0) {
      return NextResponse.json({
        stores: [],
        fallback: false,
        searchMode: mode,
        budgetRelaxedForBest: mode === 'relaxed-no-budget',
        emptyState: {
          title: '条件に合う候補が見つかりませんでした',
          body: '徒歩条件や価格帯を少し広げると見つかる可能性があります。',
          cta: '条件を調整する',
        },
      })
    }

    {
      const requestedGenreCode = finalParams.get('genre') ?? null
      console.log('[hotpepper/search] shop diagnostics:', {
        station: targetStation || '(未設定)',
        maxWalk,
        budgetCode: budgetCode ?? '(指定なし)',
        requestedGenreCode: requestedGenreCode ?? '(指定なし)',
        shops: shops.map((s) => {
          const access = String(s?.access ?? '')
          const stationMatch = shopMatchesStation(s, targetStation)
          const walkMins = parseWalkMinutes(access)
          const withinWalk = maxWalk === null || walkMins === null || walkMins <= maxWalk
          const shopBudgetCode = typeof s?.budget?.code === 'string' ? s.budget.code : ''
          const priceMatch = !budgetCode ? true : shopBudgetCode === budgetCode
          const shopGenreCode = typeof s?.genre?.code === 'string' ? s.genre.code : ''
          const genreMatch = !requestedGenreCode || shopGenreCode === requestedGenreCode || genreSpecificBoost(s, requestedGenreCode) > 0
          return {
            name: s.name,
            station_name: s.station_name ?? '(なし)',
            budget_code: shopBudgetCode || '(なし)',
            genre_code: shopGenreCode || '(なし)',
            walkMins: walkMins ?? '不明',
            stationMatch,
            withinWalk,
            priceMatch,
            genreMatch,
            genreBoost: genreSpecificBoost(s, requestedGenreCode),
          }
        }),
      })
    }

    if (targetStation) {
      const matchCount = shops.filter((s) => shopMatchesStation(s, targetStation)).length
      const matchRate = shops.length > 0 ? matchCount / shops.length : 0
      console.log('[hotpepper/search] station match rate:', {
        station: targetStation,
        matchCount,
        total: shops.length,
        rate: `${Math.round(matchRate * 100)}%`,
      })

      if (matchCount === 0 && shops.length > 0) {
        return NextResponse.json({
          stores: [],
          fallback: false,
          searchMode: mode,
          budgetRelaxedForBest: mode === 'relaxed-no-budget',
          emptyState: {
            title: `「${targetStation}駅」周辺の候補が見つかりませんでした`,
            body: '条件を少し変えて再検索してください。',
            cta: '条件を調整する',
          },
        })
      }
    }

    const requestedGenreCode = finalParams.get('genre') ?? null
    const compressed = compressBeforeGemini({
      shops,
      targetStation,
      maxWalk,
      budgetCode,
      requestedGenreCode,
      limit: 8,
    })

    const budgetRelaxedForBest = compressed.budgetRelaxedForBest || mode === 'relaxed-no-budget'
    const stores = compressed.shops.map(mapShopToStore)

    return NextResponse.json({
      stores,
      fallback: false,
      searchMode: mode,
      budgetRelaxedForBest,
    })
  } catch (e: any) {
    console.error('[hotpepper/search] error:', e?.message ?? e)

    return NextResponse.json({
      stores: pickFallbackStores(),
      fallback: true,
      error: e?.message ?? 'unknown error',
    })
  }
}
