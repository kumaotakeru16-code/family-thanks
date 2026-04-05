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

/** Extract walk minutes from an access string like "JR横浜駅 徒歩3分" → 3 */
function parseWalkMinutes(access: string): number | null {
  const m = access.match(/徒歩(\d+)分/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Check whether `stationName + '駅'` appears in the access string as a
 * standalone station name — NOT as a suffix of a longer name.
 *
 * General rule (works for any station):
 *   The character immediately before `stationName` must NOT be a CJK
 *   ideograph (U+4E00–U+9FFF).
 *
 *   "JR渋谷駅"   → prev = 'R' (latin)  → match ✓
 *   "JR新宿駅"   → prev = 'R' (latin)  → match ✓
 *   "副都心線新宿三丁目駅" → does not contain "新宿駅" at all → no match ✓
 *   prefix-station pattern (e.g. '新' + targetStation):
 *     prev char is CJK → skipped → no match ✓
 */
function stationInAccess(access: string, stationName: string): boolean {
  const target = stationName + '駅'
  let from = 0
  while (true) {
    const idx = access.indexOf(target, from)
    if (idx < 0) return false
    if (idx === 0) return true
    const prevCode = access.charCodeAt(idx - 1)
    // CJK Unified Ideographs: 0x4E00–0x9FFF
    const isCJKBefore = prevCode >= 0x4e00 && prevCode <= 0x9fff
    if (!isCJKBefore) return true
    from = idx + 1
  }
}

/**
 * General scoring for how well a shop matches the selected station + walk limit.
 * Works identically for any station — no station-specific special cases.
 *
 * Priority order (highest → lowest impact):
 *   1. Exact station match in access string (+12) — standalone match only
 *   2. Walk within limit (+10) / slightly over (+3) / clearly over (−8)
 *   3. Area name starts with station name (+4)
 *
 * The Best candidate is determined server-side by this score.
 * Client-side Google score only re-ranks positions 2+.
 */
function scoreStoreForArea(shop: any, primaryArea: string, maxWalk: number | null): number {
  if (!primaryArea) return 0

  let score = 0

  const area = String(
    shop?.small_area?.name ??
      shop?.middle_area?.name ??
      shop?.address ??
      ''
  )
  const access = String(shop?.access ?? '')

  // Exact station match in access (standalone — prefix stations like 新〇〇 won't match 〇〇)
  if (stationInAccess(access, primaryArea)) score += 12

  // Area name starts with station name (startsWith avoids prefix-station areas matching)
  if (area.startsWith(primaryArea)) score += 4

  // Walk time — only when user specified a limit
  if (maxWalk !== null) {
    const walkMins = parseWalkMinutes(access)
    if (walkMins !== null) {
      if (walkMins <= maxWalk) {
        score += 10        // Within limit: strong bonus
      } else if (walkMins <= maxWalk + 5) {
        score += 3         // Slightly over: partial credit
      } else {
        score -= 8         // Clearly over limit: hard penalty
      }
    }
    // Walk time not parseable: neutral
  }

  return score
}

/**
 * Build the final shop list with two-tier filtering (general — any station).
 *
 * Priority pool:
 *   station match in access (standalone) AND within walk limit
 *   (when no walk limit is set, station match alone qualifies)
 *
 * Supplementary pool:
 *   everything else (nearby areas, other stations, etc.)
 *
 * Rule:
 *   If priority.length >= PRIORITY_MIN → return ONLY priority shops.
 *     The "meaning of choosing this station" holds across the whole list.
 *   If priority.length < PRIORITY_MIN  → pad with supplementary to avoid an
 *     empty list, but priority shops still come first.
 *
 * Within each pool, position 0 is kept fixed; positions 1+ get light jitter
 * for variety across re-searches.
 */
function sortShopsByPrimaryArea(shops: any[], areas: string[], maxWalk: number | null) {
  const resolvedArea = resolveAreaForSearch(areas)
  const primaryArea = resolvedArea.type === 'keyword' ? resolvedArea.value : ''

  if (!primaryArea) return shops

  // Minimum priority shops needed before we drop the supplementary pool entirely
  const PRIORITY_MIN = 3

  const scored = shops.map(s => {
    const access = String(s?.access ?? '')
    const stationMatch = stationInAccess(access, primaryArea)
    const walkMins = parseWalkMinutes(access)
    const withinWalk = maxWalk === null || walkMins === null || walkMins <= maxWalk
    return {
      shop: s,
      baseScore: scoreStoreForArea(s, primaryArea, maxWalk),
      isPriority: stationMatch && withinWalk,
    }
  })

  const priority     = scored.filter(s => s.isPriority)
  const supplementary = scored.filter(s => !s.isPriority)

  // Sort a pool: position 0 fixed, positions 1+ lightly jittered for variety
  const sortPool = (pool: typeof scored): any[] => {
    pool.sort((a, b) => b.baseScore - a.baseScore)
    if (pool.length <= 1) return pool.map(s => s.shop)
    const [top, ...rest] = pool
    const jittered = rest.map(s => ({ shop: s.shop, score: s.baseScore + Math.random() * 2 }))
    jittered.sort((a, b) => b.score - a.score)
    return [top.shop, ...jittered.map(s => s.shop)]
  }

  if (priority.length >= PRIORITY_MIN) {
    // Enough on-station + on-walk shops: drop nearby-area candidates entirely
    return sortPool(priority)
  }

  // Too few priority shops: pad with supplementary to avoid an empty list
  return [...sortPool(priority), ...sortPool(supplementary)]
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

    const walkMinutesStr = typeof body?.walkMinutes === 'string' ? body.walkMinutes : '指定なし'
    const maxWalk: number | null =
      walkMinutesStr === '指定なし' || !walkMinutesStr
        ? null
        : parseInt(walkMinutesStr.replace('分以内', ''), 10) || null

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

    const sortedShops = sortShopsByPrimaryArea(shops, areas, maxWalk)
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