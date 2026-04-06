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
  '焼き鳥': 'G001', // HP に焼き鳥専用コードがないため、居酒屋で取得して後段で焼き鳥寄りを優先
  '韓国料理': 'G017',
  'カフェ・スイーツ': 'G014',
  'バー・ダイニングバー': 'G012',
  'アジア・エスニック': 'G009',
}

type HotPepperAreaMapping = {
  smallArea?: string
  middleArea?: string
}

/**
 * Minimal hand-maintained mapping to make strict search align with Hot Pepper station pages.
 * Add more stations over time as needed.
 *
 * Example:
 *   横浜駅 page => /SA12/Y135/X270/
 */
const STATION_HP_AREA_MAP: Record<string, HotPepperAreaMapping> = {
  横浜: { smallArea: 'X270' },
  '横浜駅': { smallArea: 'X270' },
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

function parseWalkMinutes(access: string): number | null {
  const m = access.match(/徒歩(\d+)分/)
  return m ? parseInt(m[1], 10) : null
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
    hasPrivateRoom: hasPrivateRoom(shop),
    // Google 評価は別 route / client 側の optional enhancement で後付けする前提
    googleRating: null,
    googleRatingCount: null,
  }
}

async function fetchHotpepper(params: URLSearchParams) {
  const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })

  if (!res.ok) {
    throw new Error(`Hot Pepper API error: HTTP ${res.status}`)
  }

  const data = await res.json()
  const shops: any[] = data?.results?.shop ?? []

  return { url, data, shops }
}

function resolveHotPepperArea(primaryArea: string): HotPepperAreaMapping | null {
  if (!primaryArea) return null
  return STATION_HP_AREA_MAP[primaryArea] ?? null
}

function buildBaseParams(args: {
  apiKey: string
  areas: string[]
  priceRange: string
  genres: string[]
  privateRoom: string
  allYouCanDrink: string
  count: number
  /** 10人以上の場合のみ party_capacity を追加する。9人以下では使わない。 */
  peopleCount?: number
}) {
  const { apiKey, areas, genres, privateRoom, allYouCanDrink, count, peopleCount } = args

  const params = new URLSearchParams({
    key: apiKey,
    format: 'json',
    count: String(Math.min(Math.max(count, 1), 15)),
    order: '4', // Hot Pepper おすすめ順
    large_service_area: 'SS10',
  })

  const primaryArea = areas[0]?.trim() ?? ''
  const hpArea = resolveHotPepperArea(primaryArea)

  // 本線: Hot Pepper の駅ページに近い母集団を作るため area code を優先する。
  // fallback: area code が未整備の駅だけ keyword 検索を使う。
  if (hpArea?.smallArea) {
    params.set('small_area', hpArea.smallArea)
  } else if (hpArea?.middleArea) {
    params.set('middle_area', hpArea.middleArea)
  } else if (primaryArea) {
    const keyword = primaryArea.endsWith('駅') ? primaryArea : `${primaryArea}駅`
    params.set('keyword', keyword)
  }

  const genreCode = genres
    .map((g) => (g.startsWith('G') && g.length <= 4 ? g : GENRE_MAP[g]))
    .find(Boolean)
  if (genreCode) {
    params.set('genre', genreCode)
  }

  // NOTE:
  // budget は strict には入れない。
  // 実測で `keyword=横浜駅 + budget=B007` が 0 件になり、
  // Hot Pepper の画面条件と API の budget code が 1:1 で一致しないことが確認できたため。
  // 価格帯は Gemini 前圧縮 / Gemini 選定で優先度として扱う。

  if (privateRoom === '個室あり') {
    params.set('private_room', '1')
  }

  if (allYouCanDrink === '希望') {
    params.set('free_drink', '1')
  }

  // 10人以上のみ party_capacity を追加。9人以下は Gemini の判断材料として渡すだけ。
  if (peopleCount && peopleCount >= 10) {
    params.set('party_capacity', String(peopleCount))
  }

  return params
}

function shopMatchesStation(shop: any, targetStation: string): boolean {
  if (!targetStation) return true

  const stationName = typeof shop?.station_name === 'string' ? shop.station_name.trim() : ''
  if (stationName) return stationName === targetStation || stationName === targetStation.replace(/駅$/, '')

  const access = String(shop?.access ?? '')
  const normalizedTarget = targetStation.endsWith('駅') ? targetStation : `${targetStation}駅`
  return access.includes(normalizedTarget)
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

  // 安すぎる方向は強めに減点
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

  // 焼き鳥は G001 取得になるため後段で補強する
  if (requestedGenreCode === 'G001') {
    if (/焼き鳥|やきとり|串焼|串揚|串|鶏料理/.test(text)) return 8
    if (/居酒屋/.test(text)) return 2
    return -3
  }

  return 0
}

function scoreStoreForSelection(
  shop: any,
  targetStation: string,
  maxWalk: number | null,
  budgetCode: string | null,
  requestedGenreCode: string | null
): number {
  let score = 0

  if (shopMatchesStation(shop, targetStation)) score += 12

  const access = String(shop?.access ?? '')
  const walkMins = parseWalkMinutes(access)
  if (maxWalk !== null && walkMins !== null) {
    if (walkMins <= maxWalk) score += 10
    else if (walkMins <= Math.min(maxWalk + 5, 20)) score += 3
    else score -= 8
  }

  const shopBudgetCode = typeof shop?.budget?.code === 'string' ? shop.budget.code : null
  score += budgetProximityScore(budgetCode, shopBudgetCode)

  const shopGenreCode = typeof shop?.genre?.code === 'string' ? shop.genre.code : null
  if (requestedGenreCode && shopGenreCode === requestedGenreCode) score += 5
  score += genreSpecificBoost(shop, requestedGenreCode)

  if (walkMins !== null) score += Math.max(0, 10 - walkMins)
  return score
}

function compressBeforeGemini(args: {
  shops: any[]
  targetStation: string
  maxWalk: number | null
  budgetCode: string | null
  requestedGenreCode: string | null
  limit?: number
}) {
  const { shops, targetStation, maxWalk, budgetCode, requestedGenreCode, limit = 8 } = args

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

    return {
      shop,
      stationMatch,
      walkTier,
      exactBudget: budgetCode ? shopBudgetCode === budgetCode : false,
      score: scoreStoreForSelection(shop, targetStation, maxWalk, budgetCode, requestedGenreCode),
    }
  })

  const stationMatched = targetStation ? scored.filter((s) => s.stationMatch) : scored
  const basePool = stationMatched.length > 0 ? stationMatched : scored

  const tierA = basePool.filter((s) => s.walkTier === 0)
  const tierB = basePool.filter((s) => s.walkTier === 1)
  const tierC = basePool.filter((s) => s.walkTier === 2)

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
    return NextResponse.json(
      {
        stores: [],
        fallback: false,
        error: 'RECRUIT_API_KEY is not set',
      },
      { status: 500 }
    )
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
    const count = typeof body?.count === 'number' ? body.count : 10
    const allYouCanDrink = typeof body?.allYouCanDrink === 'string' ? body.allYouCanDrink : ''

    const walkMinutesStr = typeof body?.walkMinutes === 'string' ? body.walkMinutes : '指定なし'
    const maxWalk: number | null =
      walkMinutesStr === '指定なし' || !walkMinutesStr
        ? null
        : parseInt(walkMinutesStr.replace('分以内', ''), 10) || null

    const budgetCode = BUDGET_MAP[priceRange] || null
    const peopleCount = typeof body?.peopleCount === 'number' ? body.peopleCount : undefined

    const strictParams = buildBaseParams({
      apiKey,
      areas,
      priceRange,
      genres,
      privateRoom,
      allYouCanDrink,
      count,
      peopleCount,
    })

    const hpArea = resolveHotPepperArea(targetStation)

    console.log('[hotpepper/search] request:', {
      areas,
      targetStation,
      hpArea,
      genreCodes,
      genreLabels,
      priceRange,
      privateRoom,
      allYouCanDrink,
      count,
      strictParams: strictParams.toString(),
    })

    const result = await fetchHotpepper(strictParams)
    const shops = result.shops
    const requestedGenreCode = strictParams.get('genre') ?? null

    console.log('[hotpepper/search] strict query:', {
      small_area: strictParams.get('small_area') ?? '(なし)',
      middle_area: strictParams.get('middle_area') ?? '(なし)',
      keyword: strictParams.get('keyword') ?? '(なし)',
      genre: strictParams.get('genre') ?? '(なし)',
      // budget は strict に送っていないが、期待値確認のため参考値としてログに残す
      requested_budget: budgetCode ?? '(指定なし)',
      private_room: strictParams.get('private_room') ?? '(なし)',
      free_drink: strictParams.get('free_drink') ?? '(なし)',
      party_capacity: strictParams.get('party_capacity') ?? '(なし)',
      count: strictParams.get('count'),
      order: strictParams.get('order'),
      url: result.url,
      resultCount: shops.length,
    })

console.log('[hotpepper/search] strict totals:', {
  results_available: result.data?.results?.results_available ?? null,
  results_returned: result.data?.results?.results_returned ?? null,
  results_start: result.data?.results?.results_start ?? null,
  shopsLength: shops.length,
})

    if (shops.length === 0) {
      return NextResponse.json({
        stores: [],
        fallback: false,
        searchMode: 'strict',
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
      requestedBudgetCode: budgetCode ?? '(指定なし)',
      requestedGenreCode: requestedGenreCode ?? '(指定なし)',
      shops: shops.map((s) => {
        const access = String(s?.access ?? '')
        const stationMatch = shopMatchesStation(s, targetStation)
        const walkMins = parseWalkMinutes(access)
        const withinWalk = maxWalk === null || walkMins === null || walkMins <= maxWalk
        const shopBudgetCode = typeof s?.budget?.code === 'string' ? s.budget.code : ''
        const shopGenreCode = typeof s?.genre?.code === 'string' ? s.genre.code : ''
        return {
          name: s.name,
          station_name: s.station_name ?? '(なし)',
          budget_code: shopBudgetCode || '(なし)',
          genre_code: shopGenreCode || '(なし)',
          walkMins: walkMins ?? '不明',
          stationMatch,
          withinWalk,
          genreBoost: genreSpecificBoost(s, requestedGenreCode),
        }
      }),
    })

    if (targetStation) {
      const matchCount = shops.filter((s) => shopMatchesStation(s, targetStation)).length
      const matchRate = shops.length > 0 ? matchCount / shops.length : 0
      console.log('[hotpepper/search] station match rate:', {
        station: targetStation,
        matchCount,
        total: shops.length,
        rate: `${Math.round(matchRate * 100)}%`,
      })

      if (matchCount === 0) {
        return NextResponse.json({
          stores: [],
          fallback: false,
          searchMode: 'strict',
          budgetRelaxedForBest: false,
          emptyState: {
            title: `「${targetStation}駅」周辺の候補が見つかりませんでした`,
            body: 'Hot Pepper の条件一致結果には別駅候補しかありませんでした。条件を見直してください。',
            cta: '条件を調整する',
          },
        })
      }
    }

    const compressed = compressBeforeGemini({
      shops,
      targetStation,
      maxWalk,
      budgetCode,
      requestedGenreCode,
      limit: 8,
    })

    return NextResponse.json({
      stores: compressed.shops.map(mapShopToStore),
      fallback: false,
      searchMode: 'strict',
      budgetRelaxedForBest: compressed.budgetRelaxedForBest,
    })
  } catch (e: any) {
    console.error('[hotpepper/search] error:', e?.message ?? e)

    return NextResponse.json(
      {
        stores: [],
        fallback: false,
        error: e?.message ?? 'unknown error',
      },
      { status: 500 }
    )
  }
}
