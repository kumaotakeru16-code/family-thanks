import { NextRequest, NextResponse } from 'next/server'

type StoreInput = {
  id: string
  name: string
  area?: string
}

type EnrichedStore = {
  id: string
  rating: number
  userRatingCount: number
}

/**
 * Look up a single store via Google Places Text Search API (New).
 * Returns rating + userRatingCount, or null on any failure / no match.
 */
async function lookupPlaces(
  query: string,
  apiKey: string
): Promise<{ rating: number; userRatingCount: number } | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Only fetch what we need — avoids billable SKU bloat
        'X-Goog-FieldMask': 'places.rating,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        languageCode: 'ja',
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) return null

    const data = await res.json()
    const place = data?.places?.[0]

    // Require a meaningful rating (>= 5 reviews) to avoid noise
    if (!place?.rating || !place?.userRatingCount || place.userRatingCount < 5) return null

    return {
      rating: place.rating as number,
      userRatingCount: place.userRatingCount as number,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY

  // No key → return empty enrichment (callers treat missing ratings as neutral)
  if (!apiKey) {
    return NextResponse.json({ enriched: [] })
  }

  let stores: StoreInput[] = []
  try {
    const body = await req.json()
    stores = Array.isArray(body.stores) ? body.stores : []
  } catch {
    return NextResponse.json({ enriched: [] })
  }

  // Parallel lookup — all failures are handled gracefully via allSettled
  const results = await Promise.allSettled(
    stores.map(async (s): Promise<EnrichedStore | null> => {
      // "個室和食 紬 渋谷店 渋谷" — name + area gives best match precision
      const query = [s.name, s.area].filter(Boolean).join(' ')
      const result = await lookupPlaces(query, apiKey)
      if (!result) return null
      return { id: s.id, ...result }
    })
  )

  const enriched: EnrichedStore[] = results
    .filter(
      (r): r is PromiseFulfilledResult<EnrichedStore> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value)

  return NextResponse.json({ enriched })
}
