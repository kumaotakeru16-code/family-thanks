import { NextRequest, NextResponse } from 'next/server'

// Hot Pepper dinner budget codes — ラベルは HP_BUDGET_OPTIONS と1対1
const BUDGET_MAP: Record<string, string> = {
  '3,000円以下': 'B005',
  '3,001〜4,000円': 'B006',
  '4,001〜5,000円': 'B007',
  '5,001〜7,000円': 'B008',
  '7,001〜10,000円': 'B009',
  '指定なし': '',
}

// Hot Pepper genre codes — ラベルは HP_GENRE_OPTIONS と1対1（後方互換エントリも含む）
const GENRE_MAP: Record<string, string> = {
  '居酒屋': 'G001',
  'バー・ダイニングバー': 'G002',
  '和食': 'G004',
  '洋食': 'G005',
  'イタリアン・フレンチ': 'G006',
  'イタリアン': 'G006',   // 後方互換
  'フレンチ': 'G006',     // 後方互換
  '中華': 'G007',
  '焼肉・ホルモン': 'G008',
  '焼肉': 'G008',         // 後方互換
  'アジア・エスニック': 'G009',
  'アジアン': 'G009',     // 後方互換
  'カフェ・スイーツ': 'G014',
  'カフェ': 'G014',       // 後方互換
  'カフェ・バル': 'G014', // 後方互換
  'お好み焼き': 'G016',
  '韓国料理': 'G017',
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

function normalizeAreas(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
}

function normalizeGenres(input: unknown): string[] {
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

    const areas = normalizeAreas(body?.areas)
    const genres = normalizeGenres(body?.genres)
    const priceRange = typeof body?.priceRange === 'string' ? body.priceRange : ''
    const privateRoom = typeof body?.privateRoom === 'string' ? body.privateRoom : ''
    const count =
      typeof body?.count === 'number'
        ? Math.min(Math.max(body.count, 1), 10)
        : 6

    const params = new URLSearchParams({
      key: apiKey,
      format: 'json',
      count: String(count),
    })

    // エリア未指定なら関東圏で絞る
    if (areas.length === 0) {
      params.set('large_service_area', 'SS10')
    } else {
      params.set('keyword', areas.join(' '))
    }

    // 予算
    const budgetCode = priceRange ? BUDGET_MAP[priceRange] : ''
    if (budgetCode) {
      params.set('budget', budgetCode)
    }

    // ジャンル（最初に一致したものを採用）
    const genreCode = genres.map((g) => GENRE_MAP[g]).find(Boolean)
    if (genreCode) {
      params.set('genre', genreCode)
    }

    // 個室
    if (privateRoom === '個室あり') {
      params.set('private_room', '1')
    }

    const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`

    console.log('[hotpepper/search] request:', {
      areas,
      genres,
      priceRange,
      privateRoom,
      count,
      url,
    })

    const res = await fetch(url, {
      cache: 'no-store',
    })

    if (!res.ok) {
      throw new Error(`Hot Pepper API error: HTTP ${res.status}`)
    }

    const data = await res.json()
    const shops: any[] = data?.results?.shop ?? []

    console.log('[hotpepper/search] response:', {
      available: data?.results?.available,
      returned: shops.length,
      sampleShop: shops[0]
        ? {
            id: shops[0].id,
            name: shops[0].name,
            url: shops[0]?.urls?.pc,
          }
        : null,
    })

    if (shops.length === 0) {
      return NextResponse.json({
        stores: FALLBACK_STORES,
        fallback: true,
        error: '条件に合う店が見つかりませんでした',
      })
    }

    const stores = shops.map(mapShopToStore)

    return NextResponse.json({
      stores,
      fallback: false,
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