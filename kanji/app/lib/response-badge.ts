/**
 * response-badge.ts
 * 未確認回答バッジのローカル永続化ヘルパー。
 *
 * 保存キー:
 *   kanji_last_viewed_responses_${eventId} — 幹事が最後にダッシュボードを開いた時刻 (unix ms)
 *   kanji_response_meta_cache_${eventId}   — 最後に取得した回答メタ { id, ts }[]
 *
 * 将来ログイン対応後は DB 保存へ移行する。移行時はここだけ差し替える。
 */

const KEY_VIEWED = (id: string) => `kanji_last_viewed_responses_${id}`
const KEY_CACHE  = (id: string) => `kanji_response_meta_cache_${id}`

export type ResponseMeta = { id: string; ts: number }

// ─── 最終確認時刻 ─────────────────────────────────────────────────────────────

export function getLastViewedResponsesAt(eventId: string): number | null {
  try {
    const val = localStorage.getItem(KEY_VIEWED(eventId))
    return val ? parseInt(val, 10) : null
  } catch { return null }
}

export function setLastViewedResponsesAt(eventId: string, timestamp = Date.now()): void {
  try { localStorage.setItem(KEY_VIEWED(eventId), String(timestamp)) } catch {}
}

// ─── 回答メタキャッシュ ────────────────────────────────────────────────────────

/**
 * 生の Supabase レスポンスを ResponseMeta に変換してキャッシュし、変換済みを返す。
 * 返り値をそのまま countUnseenResponses に渡せるので二重変換が不要。
 */
export function cacheResponseMeta(
  eventId: string,
  responses: { id: string; updated_at?: string | null; created_at?: string | null }[],
): ResponseMeta[] {
  const meta: ResponseMeta[] = responses.map(r => ({
    id: r.id,
    ts: new Date(r.updated_at ?? r.created_at ?? 0).getTime(),
  }))
  try { localStorage.setItem(KEY_CACHE(eventId), JSON.stringify(meta)) } catch {}
  return meta
}

export function getCachedResponseMeta(eventId: string): ResponseMeta[] | null {
  try {
    const val = localStorage.getItem(KEY_CACHE(eventId))
    return val ? (JSON.parse(val) as ResponseMeta[]) : null
  } catch { return null }
}

// ─── カウント計算 ─────────────────────────────────────────────────────────────

/**
 * 未確認回答数を返す。
 * lastViewedAt が null（初回未閲覧）のときは 0 を返す（初回は0扱い）。
 */
export function countUnseenResponses(meta: ResponseMeta[], lastViewedAt: number | null): number {
  if (lastViewedAt === null) return 0
  return meta.filter(r => r.ts > lastViewedAt).length
}

/** バッジ表示用文字列。10件以上は "9+" に丸める。 */
export function formatBadgeCount(count: number): string {
  if (count <= 0) return ''
  return count >= 10 ? '9+' : String(count)
}
