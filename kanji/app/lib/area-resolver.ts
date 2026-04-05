/**
 * Area resolution for Hot Pepper Gourmet API search.
 *
 * Strategy: `keyword="${stationName}駅"`
 *   HP の keyword フィールドは name / catch / address / access を全文検索する。
 *   駅名に「駅」を付けることで access 文字列（例: "JR横浜駅 徒歩3分"）に確実にマッチし、
 *   対象駅周辺の店だけを絞り込める。
 *
 * Why NOT service_area:
 *   service_area コードは HP 独自の広域エリア区分（渋谷エリア・横浜エリアなど）を指し、
 *   対象駅の最寄り店だけでなく同一エリア内の別駅店も含む。
 *   コードの粒度が粗く、指定駅とは無関係な店が大量混入するケースがある。
 *
 * Fallback（駅指定なし）:
 *   large_service_area=SS10（関東） → 呼び出し元で設定。
 */

export type ResolvedArea =
  | { type: 'keyword'; value: string; stationName: string }
  | { type: 'fallback' }

/**
 * areas[0] の駅名から HP keyword 検索用の値を決定する。
 *
 * - 駅名が空 → fallback（large_service_area=SS10 にフォールバック）
 * - 駅名あり → keyword="${stationName}駅"
 */
export function resolveAreaForSearch(areas: string[]): ResolvedArea {
  const primary = areas[0]?.trim() ?? ''
  if (!primary) return { type: 'fallback' }

  // "横浜" → keyword="横浜駅" → access="JR横浜駅 徒歩3分" にマッチ
  return { type: 'keyword', value: `${primary}駅`, stationName: primary }
}
