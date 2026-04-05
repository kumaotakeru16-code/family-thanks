import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/places/enrich
 *
 * Supplementary enrichment: fetches Google rating + userRatingCount for
 * a small list of Hot Pepper candidate stores. Used only after the final
 * display set has been determined (Gemini-ranked top N stores).
 *
 * Design principles:
 * - Non-blocking: any failure returns { enriched: [], fallback: true }
 *   so the caller can display Hot Pepper / Gemini results without ratings.
 * - No retry: if the API is unavailable in one generation flow, the caller
 *   completes with fallback and retries only when the user re-searches.
 * - placeId in response: stored for future Place Details / placeId re-use
 *   without re-querying Text Search (forward-compatible; not yet cached).
 */

// ── Types ──────────────────────────────────────────────────────────────────

type StoreInput = {
  id: string
  name: string
  area?: string
  access?: string
}

type EnrichedStore = {
  id: string
  rating: number
  userRatingCount: number
  /**
   * Google Places resource ID.
   * Included now so future migrations to Place Details (cheaper SKU)
   * can reuse it without re-running Text Search per visit.
   */
  placeId: string
}

type LookupOutcome =
  | { ok: true; rating: number; userRatingCount: number; placeId: string }
  | { ok: false; quotaOrUnavailable: boolean }

// ── Core lookup ────────────────────────────────────────────────────────────

async function lookupPlaces(
  query: string,
  apiKey: string
): Promise<LookupOutcome> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // id added to support future placeId re-use; Basic field — no extra billing
        'X-Goog-FieldMask': 'places.id,places.rating,places.userRatingCount',
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

    if (!res.ok) {
      // 429 = quota exceeded / rate limit, 403 = billing or key issue
      const quotaOrUnavailable = res.status === 429 || res.status === 403
      console.warn('[places/enrich] API error:', res.status, quotaOrUnavailable ? '(quota/billing)' : '')
      return { ok: false, quotaOrUnavailable }
    }

    const data = await res.json()
    const place = data?.places?.[0]

    // Require at least 3 reviews to filter obvious noise
    if (!place?.rating || !place?.userRatingCount || place.userRatingCount < 3) {
      return { ok: false, quotaOrUnavailable: false }
    }

    return {
      ok: true,
      rating: place.rating as number,
      userRatingCount: place.userRatingCount as number,
      placeId: place.id ?? '',
    }
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError'
    if (isTimeout) console.warn('[places/enrich] request timeout:', query.slice(0, 40))
    return { ok: false, quotaOrUnavailable: false }
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    // No key configured — silently return fallback so callers don't need to special-case
    return NextResponse.json({ enriched: [], fallback: true, reason: 'no_api_key' })
  }

  let stores: StoreInput[] = []
  try {
    const body = await req.json()
    stores = Array.isArray(body.stores) ? body.stores : []
  } catch {
    return NextResponse.json({ enriched: [], fallback: true, reason: 'invalid_body' })
  }

  if (stores.length === 0) {
    return NextResponse.json({ enriched: [], fallback: false })
  }

  // Parallel lookup — Promise.allSettled ensures one failure never blocks others
  const results = await Promise.allSettled(
    stores.map(async (s) => {
      // "店名 エリア JR横浜駅" — name + area + station hint gives best Text Search precision
      const stationHint = s.access?.match(/[^\s]+駅/)?.[0] ?? ''
      const query = [s.name, s.area, stationHint].filter(Boolean).join(' ')
      const outcome = await lookupPlaces(query, apiKey)
      return { storeId: s.id, outcome }
    })
  )

  let quotaDetected = false
  const enriched: EnrichedStore[] = []

  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { storeId, outcome } = r.value
    if (!outcome.ok) {
      if (outcome.quotaOrUnavailable) quotaDetected = true
    } else {
      enriched.push({
        id: storeId,
        rating: outcome.rating,
        userRatingCount: outcome.userRatingCount,
        placeId: outcome.placeId,
      })
    }
  }

  return NextResponse.json({
    enriched,
    fallback: quotaDetected,
    ...(quotaDetected ? { reason: 'quota_or_unavailable' } : {}),
  })
}
