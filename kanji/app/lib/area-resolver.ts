/**
 * Area resolution for Hot Pepper search.
 *
 * Phase 2: resolves areas[] → keyword (primary station name).
 * Phase 3 extension point: swap `keyword` branch for `middle_area` / `small_area`
 * by enriching StationSuggestion with HP area codes and returning a different type.
 *
 * Usage:
 *   const resolved = resolveAreaForSearch(orgPrefs.areas)
 *   if (resolved.type === 'keyword') params.set('keyword', resolved.value)
 *   else params.set('large_service_area', 'SS10')
 */

export type ResolvedArea =
  | { type: 'keyword'; value: string }
  | { type: 'fallback' }

// Future Phase 3 variant (not yet used):
// | { type: 'middle_area'; code: string }
// | { type: 'small_area'; code: string }

/**
 * Determine the primary search area from a list of selected station names.
 *
 * Rules (Phase 2):
 * - areas[0] is the primary station; others are supplemental and ignored for search.
 * - Returns { type: 'fallback' } when no valid station is present,
 *   which the caller maps to large_service_area=SS10 (Kanto-wide).
 */
export function resolveAreaForSearch(areas: string[]): ResolvedArea {
  const primary = areas[0]?.trim() ?? ''
  if (!primary) return { type: 'fallback' }
  return { type: 'keyword', value: primary }
}
