'use client'

import { useEffect, useRef, useState } from 'react'

// Matches the shape returned by /api/station-search
// Phase 3: add hpMiddleAreaCode / hpSmallAreaCode here when the API provides them
type StationSuggestion = {
  name: string
  prefecture?: string
  line?: string
  displayLabel?: string  // e.g. "新宿（JR山手線）"
}

type Props = {
  value: string[]
  onChange: (stations: string[]) => void
  placeholder?: string
}

export function StationInput({ value, onChange, placeholder = '駅名を入力' }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<StationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/station-search?query=${encodeURIComponent(query)}`)
        const data = await res.json()
        const stations: StationSuggestion[] = data.stations ?? []
        setSuggestions(stations)
        setOpen(stations.length > 0)
      } catch {
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const addStation = (name: string) => {
    if (!value.includes(name)) {
      onChange([...value, name])
    }
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  const removeStation = (name: string) => {
    onChange(value.filter((v) => v !== name))
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
        />
        {loading && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
          </div>
        )}
      </div>

      {/* Suggestion dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/10">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onMouseDown={(e) => {
                // prevent blur before click fires
                e.preventDefault()
                addStation(s.name)
              }}
              className="flex w-full items-baseline gap-2 px-4 py-3 text-left transition hover:bg-stone-50 active:bg-stone-100"
            >
              <span className="text-sm font-bold text-stone-900">{s.name}</span>
              {s.line && (
                <span className="truncate text-xs text-stone-400">{s.line}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected station chips */}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => removeStation(v)}
              className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white transition hover:bg-stone-700 active:scale-95"
            >
              {v} ×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
