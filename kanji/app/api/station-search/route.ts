import { NextRequest, NextResponse } from 'next/server'
import { STATION_DEFS } from '@/app/lib/station-defs'
import { STATION_KANA } from '@/app/lib/station-kana'

/**
 * Local station search against STATION_DEFS + kana readings.
 *
 * Scoring priority (higher wins):
 *  100 – canonical prefix match
 *   95 – kana prefix match
 *   90 – alias prefix match
 *   80 – canonical contains
 *   75 – kana contains
 *   65 – alias contains
 *
 * This gives instant, offline results without external API calls.
 */

type StationResult = {
  name: string
  displayName: string
  kana?: string
  prefecture?: string
  line?: string
  displayLabel?: string
}

const MAX_RESULTS = 8

function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, '').toLowerCase()
}

function searchLocalStations(rawQuery: string): StationResult[] {
  const q = normalizeQuery(rawQuery)
  if (!q) return []

  const scored: Array<{ result: StationResult; score: number }> = []

  for (const def of Object.values(STATION_DEFS)) {
    const canonical = def.canonical.toLowerCase()
    const kana = (STATION_KANA[def.canonical] ?? '').toLowerCase()
    let score = 0

    // Canonical match
    if (canonical === q) {
      score = 110
    } else if (canonical.startsWith(q)) {
      score = 100
    } else if (canonical.includes(q)) {
      score = 80
    }

    // Kana match
    if (kana) {
      if (kana === q) score = Math.max(score, 108)
      else if (kana.startsWith(q)) score = Math.max(score, 95)
      else if (kana.includes(q)) score = Math.max(score, 75)
    }

    // Alias match
    for (const alias of def.aliases) {
      const a = alias.toLowerCase()
      if (a === q) { score = Math.max(score, 105); break }
      if (a.startsWith(q)) { score = Math.max(score, 90); break }
      if (a.includes(q)) { score = Math.max(score, 65); break }
    }

    if (score > 0) {
      scored.push({
        result: {
          name: def.canonical,
          displayName: def.displayName,
          kana: STATION_KANA[def.canonical],
          displayLabel: def.displayName,
        },
        score,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.result.name.localeCompare(b.result.name, 'ja'))
  return scored.slice(0, MAX_RESULTS).map((s) => s.result)
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query') ?? ''

  if (normalizeQuery(query).length === 0) {
    return NextResponse.json({ stations: [] })
  }

  const stations = searchLocalStations(query)
  return NextResponse.json({ stations })
}
