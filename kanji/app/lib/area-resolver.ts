/**
 * Area resolution for Hot Pepper search.
 *
 * Strategy:
 *   - For well-known stations: use HP `service_area` code.
 *     This is equivalent to the "エリア選択" on the HP website and
 *     correctly finds shops regardless of whether the shop name/description
 *     contains the station name.
 *   - For other stations (custom input): fall back to `keyword` search.
 *     keyword searches name/catch/address/access — less reliable but
 *     no code mapping needed.
 *   - When no station is provided: large_service_area=SS10 (Kanto-wide).
 *
 * The `stationName` field is always present when a station was given,
 * and is used downstream for station-match filtering (shopMatchesStation).
 */

export type ResolvedArea =
  | { type: 'service_area'; code: string; stationName: string }
  | { type: 'keyword'; value: string; stationName: string }
  | { type: 'fallback' }

/**
 * HP Gourmet API service_area codes for common stations.
 * These mirror the area segmentation used on the HP website,
 * so results match what a user would see when selecting the area manually.
 *
 * Source: Hot Pepper Gourmet API area master (関東 / SS10)
 */
const STATION_SERVICE_AREA: Record<string, string> = {
  '渋谷':       'SA01',   // 渋谷・代官山・中目黒
  '新宿':       'SA02',   // 新宿・大久保・高田馬場・目白
  '池袋':       'SA03',   // 池袋・大塚・巣鴨
  '東京':       'SA07',   // 東京・日本橋・丸の内・神田
  '品川':       'SA09',   // 品川・田町・浜松町
  '横浜':       'SA11',   // 横浜・みなとみらい・関内・石川町
}

/**
 * Determine the primary search area from a list of selected station names.
 *
 * Rules:
 * - areas[0] is the primary station; others are supplemental and ignored for HP search.
 * - Returns service_area when a code mapping exists (preferred — matches HP website).
 * - Falls back to keyword for unlisted stations.
 * - Returns { type: 'fallback' } when no valid station is present.
 */
export function resolveAreaForSearch(areas: string[]): ResolvedArea {
  const primary = areas[0]?.trim() ?? ''
  if (!primary) return { type: 'fallback' }

  const code = STATION_SERVICE_AREA[primary]
  if (code) return { type: 'service_area', code, stationName: primary }

  return { type: 'keyword', value: primary, stationName: primary }
}
