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
  '焼き鳥': 'G001',       // 居酒屋カテゴリが最近似（HP に焼き鳥専用コードなし）
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
  /** Pre-resolved HP genre codes (e.g. 'G001') OR legacy label strings — codes take priority */
  genres: string[]
  privateRoom: string
  allYouCanDrink: string
  count: number
}) {
  const { apiKey, areas, priceRange, genres, privateRoom, allYouCanDrink, count } = args

  const params = new URLSearchParams({
    key: apiKey,
    format: 'json',
    count: String(Math.min(Math.max(count, 1), 10)),
  })

  // エリア（最優先 — 緩和しない）
  const resolvedArea = resolveAreaForSearch(areas)
  if (resolvedArea.type === 'keyword') {
    params.set('keyword', resolvedArea.value)
  } else {
    params.set('large_service_area', 'SS10')
  }

  // ジャンル（第2優先）
  const genreCode = genres
    .map(g => (g.startsWith('G') && g.length <= 4 ? g : GENRE_MAP[g]))
    .find(Boolean)
  if (genreCode) {
    params.set('genre', genreCode)
  }

  // 価格帯（第3優先）
  const budgetCode = BUDGET_MAP[priceRange] ?? ''
  if (budgetCode) {
    params.set('budget', budgetCode)
  }

  // 個室（第5優先）
  if (privateRoom === '個室あり') {
    params.set('private_room', '1')
  }

  // 飲み放題（第6優先 — 最初に緩和）
  if (allYouCanDrink === '希望') {
    params.set('free_drink', '1')
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

  const scored = shops.map(s => ({
    shop: s,
    baseScore: scoreStoreForArea(s, primaryArea),
  }))
  scored.sort((a, b) => b.baseScore - a.baseScore)

  if (scored.length <= 1) return scored.map(s => s.shop)

  // Keep the clear best at position 0; add light jitter to the rest
  // so the 2nd–5th positions vary between calls (fresh feel on re-search)
  const [top, ...rest] = scored
  const jittered = rest.map(s => ({
    shop: s.shop,
    score: s.baseScore + Math.random() * 2,
  }))
  jittered.sort((a, b) => b.score - a.score)

  return [top.shop, ...jittered.map(s => s.shop)]
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

    // body.orgPrefs でも body直下でも受けられるようにする
    const prefs = body?.orgPrefs ?? body ?? {}

    const areas = normalizeStringArray(prefs?.areas)
    // Prefer pre-resolved genreCodes (sent by client) over raw label strings (legacy)
    const genreCodes = normalizeStringArray(body?.genreCodes ?? prefs?.genreCodes)
    const genreLabels = normalizeStringArray(prefs?.genres)
    const genres = genreCodes.length > 0 ? genreCodes : genreLabels
    const priceRange =
      typeof prefs?.priceRange === 'string' ? prefs.priceRange : '指定なし'
    const privateRoom =
      typeof prefs?.privateRoom === 'string' ? prefs.privateRoom : 'こだわらない'
    const count = typeof body?.count === 'number' ? body.count : 6

    const allYouCanDrink = typeof body?.allYouCanDrink === 'string' ? body.allYouCanDrink : ''

    const strictParams = buildBaseParams({
      apiKey,
      areas,
      priceRange,
      genres,
      privateRoom,
      allYouCanDrink,
      count,
    })

    const resolvedArea = resolveAreaForSearch(areas)

    console.log('[hotpepper/search] request:', {
      areas,
      resolvedArea,
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

    // 緩和順: 飲み放題 → 個室 → 予算 → ジャンル（エリアは緩和しない）

    // 1. 飲み放題を外す（最も弱い条件）
    if (shops.length === 0 && finalParams.get('free_drink') === '1') {
      console.log('[hotpepper/search] relaxing: dropping free_drink')
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('free_drink')
      mode = 'relaxed-no-free-drink'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    // 2. 個室を外す
    if (shops.length === 0 && finalParams.get('private_room') === '1') {
      console.log('[hotpepper/search] relaxing: dropping private_room')
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('private_room')
      mode = 'relaxed-no-private-room'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    // 3. 予算を外す
    if (shops.length === 0 && finalParams.get('budget')) {
      console.log('[hotpepper/search] relaxing: dropping budget', finalParams.get('budget'))
      const relaxed = new URLSearchParams(finalParams)
      relaxed.delete('budget')
      mode = 'relaxed-no-budget'
      result = await fetchHotpepper(relaxed)
      shops = result.shops
      finalParams = relaxed
    }

    // 4. ジャンルを外す（エリアは残す）
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
        stores: pickFallbackStores(),
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
      stores: pickFallbackStores(),
      fallback: true,
      error: e?.message ?? 'unknown error',
    })
  }
}