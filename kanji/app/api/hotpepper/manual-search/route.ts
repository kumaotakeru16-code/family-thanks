import { NextRequest, NextResponse } from 'next/server'

const HOTPEPPER_API_KEY =
  process.env.HOTPEPPER_API_KEY || process.env.RECRUIT_API_KEY || ''

export type ManualSearchResult = {
  id: string
  name: string
  area: string
  access: string
  genre: string
  link: string
  image: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const query: string = (body.query ?? '').trim()
    const station: string = (body.station ?? '').trim()

    if (!query) {
      return NextResponse.json({ results: [] })
    }

    if (!HOTPEPPER_API_KEY) {
      return NextResponse.json({ error: 'API key not configured', results: [] }, { status: 500 })
    }

    const params = new URLSearchParams({
      key: HOTPEPPER_API_KEY,
      keyword: query,
      count: '8',
      format: 'json',
    })

    if (station) {
      params.set('keyword', `${query} ${station}`)
    }

    const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params}`
    const res = await fetch(url, { next: { revalidate: 0 } })

    if (!res.ok) {
      return NextResponse.json({ error: `HotPepper error: ${res.status}`, results: [] }, { status: 502 })
    }

    const data = await res.json()
    const shops = data?.results?.shop ?? []

    const results: ManualSearchResult[] = shops.map((s: any) => ({
      id: s.id ?? '',
      name: s.name ?? '',
      area: s.station_name ? `${s.station_name}駅` : (s.address ?? ''),
      access: s.mobile_access ?? s.access ?? '',
      genre: s.genre?.name ?? '',
      link: s.urls?.pc ?? '',
      image: s.photo?.mobile?.l ?? s.photo?.pc?.l ?? '',
    }))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'unknown', results: [] }, { status: 500 })
  }
}
