import { NextRequest, NextResponse } from 'next/server'
import { resolveAreaForSearch } from '@/app/lib/area-resolver'

// Hot Pepper budget codes
const BUDGET_MAP: Record<string, string> = {
  '3,000円以下': 'B005',        // 2001〜3000円
  '3,001〜4,000円': 'B006',    // 3001〜4000円
  '4,001〜5,000円': 'B007',    // 4001〜5000円
  '5,001〜7,000円': 'B008',    // 5001〜7000円
  '7,001〜10,000円': 'B009',   // 7001〜10000円
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
  '韓国料理': 'G017',
  'カフェ・スイーツ': 'G014',
  'バー・ダイニングバー': 'G012',
  'アジア・エスニック': 'G009',
}

const FALLBACK_STORES = [
  {
    id: 'fallback-1',
    name: '個室和食 紬 渋谷店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩3分',
    reason: '渋谷に集まりやすく、会食向きで外しにくい参考候補です。',
    link: '',
    image: undefined,
    tags: ['完全個室', '会食向き', '駅近'],
  },
  {
    id: 'fallback-2',
    name: '美食米門 新宿店',
    area: '新宿',
    access: 'JR新宿駅 徒歩3分',
    reason: '別エリア候補として比較しやすい参考候補です。',
    link: '',
    image: undefined,
    tags: ['駅近', '会食向き'],
  },
  {
    id: 'fallback-3',
    name: '個室 焼肉 ごぶとん 渋谷本店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩2分',
    reason: '渋谷寄りでジャンル違いの保険候補です。',
    link: '',
    image: undefined,
    tags: ['個室', '駅近'],
  },
]

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
      shop.budget?.average ? `予算${shop.budget.average}` : undefined,
      hasPrivateRoom(shop) ? '個室あり' : undefined,
      shop.wifi === 'あり' ? 'WiFiあり' : undefined,
    ]
      .filter((t): t is string => Boolean(t))
      .slice(0, 4),
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
  count: number
}) {
  const { apiKey, areas, priceRange, genres, privateRoom, count } = args

  const params = new URLSearchParams({
    key: apiKey,
    format: 'json',
    count: String(Math.min(Math.max(count, 1), 10)),
  })

  const resolvedArea = resolveAreaForSearch(areas)

  if (resolvedArea.type === 'keyword') {
    params.set('keyword', resolvedArea.value)
  } else {
    params.set('large_service_area', 'SS10')
  }

  const budgetCode = BUDGET_MAP[priceRange] ?? ''
  if (budgetCode) {
    params.set('budget', budgetCode)
  }

  const genreCode = genres.map((g) => GENRE_MAP[g]).find(Boolean)
  if (genreCode) {
    params.set('genre', genreCode)
  }

  if (privateRoom === '個室あり') {
    params.set('private_room', '1')
  }

  return params
}

/**
 * Sort stores so the selected station feels more "station-near" in the UI.
 *
 * Why:
 * Hot Pepper keyword search is broad, so "横浜" can return 関内 etc.
 * This scorer boosts stores that look closer to the chosen station.
 */
function scoreStoreForArea(shop: any, primaryArea: string): number {
  if (!primaryArea) return 0

  let score = 0

  const area = String(
    shop?.small_area?.name ??
      shop?.middle_area?.name ??
      shop?.address ??
      ''
  )
  const access = String(shop?.access ?? '')
  const name = String(shop?.name ?? '')

  // Strongest: exact station mention in access
  if (access.includes(`${primaryArea}駅`)) score += 8

  // General station/area mention in access
  if (access.includes(primaryArea)) score += 6

  // Area label match
  if (area.includes(primaryArea)) score += 4

  // Store name match
  if (name.includes(primaryArea)) score += 2

  return score
}

function sortShopsByPrimaryArea(shops: any[], areas: string[]) {
  const resolvedArea = resolveAreaForSearch(areas)
  const primaryArea = resolvedArea.type === 'keyword' ? resolvedArea.value : ''

  if (!primaryArea) return shops

  return [...shops].sort((a, b) => {
    const scoreDiff =
      scoreStoreForArea(b, primaryArea) - scoreStoreForArea(a, primaryArea)

    if (scoreDiff !== 0) return scoreDiff

    // Stable-ish tie breaker: keep original API order as much as possible
    return 0
  })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RECRUIT_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      stores: FALLBACK_STORES,
      fallback: true,
      error: 'RECRUIT_API_KEY is not set',
    })
  }

  try {
    const body = await req.json()

    // body.orgPrefs でも body直下でも受けられるようにする
    const prefs = body?.orgPrefs ?? body ?? {}

    const areas = normalizeStringArray(prefs?.areas)
    const genres = normalizeStringArray(prefs?.genres)
    const priceRange =
      typeof prefs?.priceRange === 'string' ? prefs.priceRange : '指定なし'
    const privateRoom =
      typeof prefs?.privateRoom === 'string' ? prefs.privateRoom : 'こだわらない'
    const count = typeof body?.count === 'number' ? body.count : 6

    const strictParams = buildBaseParams({
      apiKey,
      areas,
      priceRange,
      genres,
      privateRoom,
      count,
    })

    const resolvedArea = resolveAreaForSearch(areas)

    console.log('[hotpepper/search] request:', {
      areas,
      resolvedArea,
      genres,
      priceRange,
      privateRoom,
      count,
      strictParams: strictParams.toString(),
    })

    let mode = 'strict'
    let result = await fetchHotpepper(strictParams)
    let shops = result.shops
    let finalParams = strictParams

    // 1. 個室条件を外す
    if (shops.length === 0 && finalParams.get('private_room') === '1') {
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('private_room')

      mode = 'relaxed-no-private-room'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    // 2. ジャンル条件を外す
    if (shops.length === 0 && finalParams.get('genre')) {
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('genre')

      mode = 'relaxed-no-genre'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    // 3. 予算条件を外す
    if (shops.length === 0 && finalParams.get('budget')) {
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('budget')

      mode = 'relaxed-no-budget'
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
        stores: FALLBACK_STORES,
        fallback: true,
        error: '条件にぴったり一致する店が少なかったため、参考候補を表示しています',
        searchMode: mode,
      })
    }

    const sortedShops = sortShopsByPrimaryArea(shops, areas)
    const stores = sortedShops.map(mapShopToStore)

    return NextResponse.json({
      stores,
      fallback: false,
      searchMode: mode,
    })
  } catch (e: any) {
    console.error('[hotpepper/search] error:', e?.message ?? e)

    return NextResponse.json({
      stores: FALLBACK_STORES,
      fallback: true,
      error: e?.message ?? 'unknown error',
    })
  }
}