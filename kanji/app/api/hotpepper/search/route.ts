import { NextRequest, NextResponse } from 'next/server'

// Hot Pepper dinner budget codes
const BUDGET_MAP: Record<string, string> = {
  '〜3,000円': 'B005', // 2001〜3000円
  '〜4,000円': 'B006', // 3001〜4000円
  '〜5,000円': 'B007', // 4001〜5000円
  '〜6,000円': 'B008', // 5001〜7000円
  '〜7,000円': 'B008', // 5001〜7000円
  '〜8,000円': 'B009', // 7001〜10000円
}

// Hot Pepper genre codes
const GENRE_MAP: Record<string, string> = {
  '居酒屋': 'G001',
  '焼肉': 'G008',
  'イタリアン': 'G006',
  'フレンチ': 'G006',
  'カフェ': 'G014',
  '中華': 'G007',
  '和食': 'G004',
  '洋食': 'G005',
  'アジアン': 'G009',
  'バー': 'G012',
  'お好み焼き': 'G016',
  '韓国料理': 'G017',
}

const FALLBACK_STORES = [
  {
    id: 'fallback-1',
    name: '個室和食 紬 渋谷店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩3分',
    reason: '渋谷に集まりやすく、会食向きで外しにくい候補です。',
    link: 'https://www.hotpepper.jp/',
    tags: ['完全個室', '会食向き', '駅近'],
  },
  {
    id: 'fallback-2',
    name: '美食米門 新宿店',
    area: '新宿',
    access: 'JR新宿駅 徒歩3分',
    reason: '別エリア候補として比較しやすい店です。',
    link: 'https://www.hotpepper.jp/',
    tags: ['駅近', '会食向き'],
  },
  {
    id: 'fallback-3',
    name: '個室 焼肉 ごぶとん 渋谷本店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩2分',
    reason: '渋谷寄りでジャンル違いの保険候補です。',
    link: 'https://www.hotpepper.jp/',
    tags: ['個室', '駅近'],
  },
]

function buildReason(shop: any, priceRange?: string, privateRoom?: string): string {
  const parts: string[] = []
  if (shop.genre?.name) parts.push(shop.genre.name)
  if (shop.budget?.average) parts.push(`予算${shop.budget.average}`)
  if (shop.private_room === 'あり' || shop.private_room === '1') parts.push('個室あり')
  if (shop.catch) return shop.catch
  return parts.length > 0 ? parts.join('・') : '条件に合う候補です'
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RECRUIT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ stores: FALLBACK_STORES, fallback: true, error: 'RECRUIT_API_KEY is not set' })
  }

  try {
    const body = await req.json()
    const { areas = [], priceRange, genres = [], privateRoom, count = 6 } = body

    const params = new URLSearchParams({
      key: apiKey,
      format: 'json',
      count: String(Math.min(count, 10)),
      // Default to Kanto if no area given so results stay Tokyo-metro relevant
      ...(areas.length === 0 ? { large_service_area: 'SS10' } : {}),
    })

    // Area: join multiple areas as a space-separated keyword query
    if (areas.length > 0) {
      params.set('keyword', areas.join(' '))
    }

    // Budget: map from yen label to Hot Pepper code
    const budgetCode = priceRange ? BUDGET_MAP[priceRange] : undefined
    if (budgetCode) params.set('budget', budgetCode)

    // Genre: use first matching genre
    const genreCode = genres.map((g: string) => GENRE_MAP[g]).find(Boolean)
    if (genreCode) params.set('genre', genreCode)

    // Private room
    if (privateRoom === '必要') params.set('private_room', '1')

    const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params}`

    const res = await fetch(url, {
      next: { revalidate: 0 }, // always fresh
    })

    if (!res.ok) {
      throw new Error(`Hot Pepper API error: HTTP ${res.status}`)
    }

    const data = await res.json()
    const shops: any[] = data?.results?.shop ?? []

    if (shops.length === 0) {
      return NextResponse.json({
        stores: FALLBACK_STORES,
        fallback: true,
        error: '条件に合う店が見つかりませんでした',
      })
    }

    const stores = shops.map((shop) => ({
      id: shop.id,
      name: shop.name,
      area: shop.small_area?.name ?? shop.middle_area?.name ?? shop.address ?? '',
      access: shop.access ?? '',
      image: shop.photo?.pc?.l ?? shop.photo?.pc?.m ?? undefined,
      link: shop.urls?.pc ?? 'https://www.hotpepper.jp/',
      reason: buildReason(shop, priceRange, privateRoom),
      tags: [
        shop.genre?.name,
        shop.budget?.average ? `予算${shop.budget.average}` : undefined,
        (shop.private_room === 'あり' || shop.private_room === '1') ? '個室あり' : undefined,
        shop.wifi === 'あり' ? 'WiFiあり' : undefined,
      ].filter((t): t is string => Boolean(t)).slice(0, 4),
    }))

    return NextResponse.json({ stores, fallback: false })
  } catch (e: any) {
    console.error('[hotpepper/search]', e?.message)
    return NextResponse.json({
      stores: FALLBACK_STORES,
      fallback: true,
      error: e?.message ?? 'unknown error',
    })
  }
}
