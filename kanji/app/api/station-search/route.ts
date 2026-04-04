import { NextRequest, NextResponse } from 'next/server'

// HeartRails Express API proxy
// https://express.heartrails.com/
// Credit required per HeartRails terms of service.

type RawStation = {
  name: string
  prefecture: string
  line: string
  x?: string
  y?: string
}

// Matches StationSuggestion in app/components/StationInput.tsx
// displayLabel: human-readable label for dropdown (e.g. "新宿（JR山手線）")
// Phase 3 extension: add hpMiddleAreaCode / hpSmallAreaCode here when available
type StationSuggestion = {
  name: string
  prefecture?: string
  line?: string
  displayLabel?: string
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query') ?? ''

  if (query.length < 2) {
    return NextResponse.json({ stations: [] })
  }

  try {
    const url = `https://express.heartrails.com/api/json?method=getStations&name=${encodeURIComponent(query)}`
    const res = await fetch(url, { cache: 'no-store' })

    if (!res.ok) {
      return NextResponse.json({ stations: [] })
    }

    const data = await res.json()
    const rawStations: RawStation[] = data?.response?.station ?? []

    // Deduplicate by name, surface prefecture + first line encountered
    const seen = new Set<string>()
    const stations: StationSuggestion[] = []

    for (const s of rawStations) {
      if (!s.name) continue
      if (!seen.has(s.name)) {
        seen.add(s.name)
        const line = s.line || undefined
        stations.push({
          name: s.name,
          prefecture: s.prefecture || undefined,
          line,
          displayLabel: line ? `${s.name}（${line}）` : s.name,
        })
      }
      if (stations.length >= 8) break
    }

    return NextResponse.json({ stations })
  } catch {
    return NextResponse.json({ stations: [] })
  }
}
