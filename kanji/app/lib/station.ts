// app/lib/station.ts

import { STATION_DEFS, type HpArea, type StationDef } from './station-defs'

export type StationSearchContext = {
  rawInput: string
  canonical: string
  displayName: string
  aliases: string[]
  hpArea: HpArea | null
  searchMode: 'area' | 'keyword'
  keyword: string
  matchedBy: 'canonical' | 'alias' | 'raw'
  hasAreaConfig: boolean
}

function normalizeBasic(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/駅$/, '')
}

export function normalizeStationInput(input: string | null | undefined): string {
  if (!input) return ''

  const normalized = normalizeBasic(input)

  for (const def of Object.values(STATION_DEFS)) {
    if (normalizeBasic(def.canonical) === normalized) return def.canonical
    if (def.aliases.some((alias) => normalizeBasic(alias) === normalized)) {
      return def.canonical
    }
  }

  return normalized
}

export function getStationConfig(input: string | null | undefined): StationDef | null {
  const canonical = normalizeStationInput(input)
  return STATION_DEFS[canonical] ?? null
}

export function buildStationSearchContext(input: string | null | undefined): StationSearchContext {
  const rawInput = (input ?? '').trim()
  const normalized = normalizeBasic(rawInput)

  for (const def of Object.values(STATION_DEFS)) {
    if (normalizeBasic(def.canonical) === normalized) {
      return {
        rawInput,
        canonical: def.canonical,
        displayName: def.displayName,
        aliases: def.aliases,
        hpArea: def.hpArea ?? null,
        searchMode: def.hpArea?.middleArea ? 'area' : 'keyword',
        keyword: `${def.canonical}駅`,
        matchedBy: 'canonical',
        hasAreaConfig: !!def.hpArea?.middleArea,
      }
    }

    if (def.aliases.some((alias) => normalizeBasic(alias) === normalized)) {
      return {
        rawInput,
        canonical: def.canonical,
        displayName: def.displayName,
        aliases: def.aliases,
        hpArea: def.hpArea ?? null,
        searchMode: def.hpArea?.middleArea ? 'area' : 'keyword',
        keyword: `${def.canonical}駅`,
        matchedBy: 'alias',
        hasAreaConfig: !!def.hpArea?.middleArea,
      }
    }
  }

  return {
    rawInput,
    canonical: normalized,
    displayName: normalized,
    aliases: normalized ? [normalized] : [],
    hpArea: null,
    searchMode: 'keyword',
    keyword: normalized ? `${normalized}駅` : '',
    matchedBy: 'raw',
    hasAreaConfig: false,
  }
}

export function getStationAliases(input: string | null | undefined): string[] {
  return buildStationSearchContext(input).aliases
}

export function isStationMatch(
  targetStation: string | null | undefined,
  shopStationName?: string | null
): boolean {
  if (!targetStation || !shopStationName) return false

  const ctx = buildStationSearchContext(targetStation)
  const shop = normalizeBasic(shopStationName)
  if (!shop) return false

  return ctx.aliases.some((alias) => normalizeBasic(alias) === shop)
}

export function getAllStationDefs(): Record<string, StationDef> {
  return STATION_DEFS
}