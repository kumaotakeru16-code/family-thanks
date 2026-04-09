// lib/store-select-adapter.ts

export type HotpepperSearchShop = {
  id: string
  name: string
  address?: string
  station_name?: string
  image_url?: string
  genre_code?: string
  genre_name?: string
  budget_code?: string
  budget_average?: string
  private_room?: string
  free_drink?: string
  non_smoking?: string
  catch?: string
  open?: string
  url?: string
  access?: string
  google_rating?: number | null
  google_rating_count?: number | null
  tags?: string[]
  _debug?: {
    parsedBudget?: unknown
    stationMatch?: boolean
    priceScore?: number
    genreBoost?: number
    totalScore?: number
  }
}

export type StoreSelectInput = {
  id: string
  name: string
  stationName?: string
  access?: string
  budgetCode?: string
  budgetAverage?: string
  genre?: string
  tags?: string[]
  walkMinutes?: number | null
  hasPrivateRoom?: boolean
  googleRating?: number | null
  googleRatingCount?: number | null
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function parseWalkMinutes(access?: string): number | null {
  const text = normalizeText(access)
  if (!text) return null

  const match =
    text.match(/徒歩\s*([0-9]{1,2})\s*分/) ||
    text.match(/([0-9]{1,2})\s*分/)
  if (!match) return null

  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

function toBooleanLikeHotpepper(value?: string): boolean {
  const text = normalizeText(value)

  if (!text) return false

  return (
    /あり|有|○|可|対応/.test(text) &&
    !/なし|無|不可/.test(text)
  )
}

function buildTags(shop: HotpepperSearchShop): string[] {
  const raw = [
    shop.genre_name,
    shop.catch,
    shop.open,
    shop.budget_average,
    shop.private_room ? `個室:${shop.private_room}` : '',
    shop.free_drink ? `飲み放題:${shop.free_drink}` : '',
    shop.non_smoking ? `禁煙:${shop.non_smoking}` : '',
  ]

  return Array.from(
    new Set(
      raw.map((v) => normalizeText(v)).filter(Boolean)
    )
  )
}

export function adaptHotpepperShopToStoreSelect(shop: HotpepperSearchShop): StoreSelectInput {
  return {
    id: shop.id,
    name: shop.name,
    stationName: normalizeText(shop.station_name),
    access: normalizeText(shop.access),
    budgetCode: normalizeText(shop.budget_code),
    budgetAverage: normalizeText(shop.budget_average),
    genre: normalizeText(shop.genre_name),
    tags: shop.tags && shop.tags.length > 0 ? shop.tags : buildTags(shop),
    walkMinutes: parseWalkMinutes(shop.access),
    hasPrivateRoom: toBooleanLikeHotpepper(shop.private_room),
    googleRating:
      typeof shop.google_rating === 'number' ? shop.google_rating : null,
    googleRatingCount:
      typeof shop.google_rating_count === 'number' ? shop.google_rating_count : null,
  }
}

export function adaptHotpepperShopsToStoreSelect(shops: HotpepperSearchShop[]): StoreSelectInput[] {
  return shops.map(adaptHotpepperShopToStoreSelect)
}