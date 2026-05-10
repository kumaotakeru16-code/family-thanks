/**
 * store-reasons.ts
 * Hero理由とBullet理由を1回の呼び出しで生成する。
 * Hero → Bullets の順で優先度付きリストを作り、先頭をHeroにすることで重複を防ぐ。
 */
import { getStoreCopy } from './store-copy'

// ─── Minimal input types ──────────────────────────────────────────────────────

export type ReasonStore = {
  name: string
  genre?: string
  description?: string
  access?: string
  tags?: string[]
  googleRating?: number
  googleRatingCount?: number
  walkMinutes?: number | null
  hasPrivateRoom?: boolean
  budgetCode?: string
}

export type ReasonPrefs = {
  priceRange: string
  genres: string[]
  privateRoom: string
}

// ─── Store personality ────────────────────────────────────────────────────────

type StoreTone = 'lively' | 'calm' | 'formal' | 'casual' | 'neutral'

function detectStoreTone(store: ReasonStore): StoreTone {
  const text = [store.name, store.genre ?? '', store.description ?? ''].join(' ')
  if (/焼鳥|炭火|鶏|やきとり|大衆|酒場|焼肉|ホルモン|立ち飲み|居酒屋/.test(text)) return 'lively'
  if (/鮨|すし|寿司|懐石|料亭|割烹/.test(text)) return 'formal'
  if (/バル|ビストロ|スパニッシュ|トラットリア|イタリアン|フレンチ/.test(text)) return 'casual'
  if (/和モダン|和食|日本料理|小料理|旬/.test(text)) return 'calm'
  return 'neutral'
}

const TONE_REASON: Record<StoreTone, string> = {
  lively:  '飲み会向き',
  calm:    '落ち着いてまとまりやすい',
  formal:  'きちんと感があり選びやすい',
  casual:  'カジュアルにまとまりやすい',
  neutral: '幅広い会に合う',
}

// ─── Access parsing ───────────────────────────────────────────────────────────

export function parseAccessMins(store: ReasonStore): number | null {
  if (store.walkMinutes != null) return store.walkMinutes
  const m = store.access?.match(/徒歩(?:約)?(\d+)分/)
  return m ? parseInt(m[1], 10) : null
}

function accessPhrase(mins: number): string | null {
  if (mins <= 3)  return '駅前で集まりやすい'
  if (mins <= 5)  return '仕事後でも集まりやすい'
  if (mins <= 8)  return '駅近で集まりやすい'
  if (mins <= 12) return '徒歩圏内で行きやすい'
  return null
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Hero理由（1行）とBullet理由（最大4件）を一度に返す。
 * 先頭のcandidateがHeroになるため、BulletsはHeroと重複しない。
 *
 * 優先順位:
 * 1. VIP（主賓あり）
 * 2. 駅近（徒歩≤5分） — 集まりやすさが最強アピール
 * 3. 口コミ評価 4.0以上 — 信頼感として強いアピール
 * 4. 明示的な個室条件（privateRoom === '個室あり'）
 * 5. ジャンル一致
 * 6. 予算一致
 * 7. 駅近（徒歩6〜12分）
 * 8. 店の空気感（tone）
 * 9. 個室ボーナス（条件未指定の場合 — 低優先）
 */
export function buildStoreReasonSet(params: {
  store: ReasonStore
  prefs: ReasonPrefs
  eventType: string
  mainGuestCount: number
  mode: string
}): { hero: string; bullets: string[] } {
  const { store, prefs, eventType, mainGuestCount, mode } = params
  const copy = getStoreCopy(mode)

  const privateRoomExplicit = prefs.privateRoom === '個室あり'
  const hasPrivateRoom = !!store.hasPrivateRoom || (store.tags ?? []).includes('個室あり')
  const hasVip = mainGuestCount > 0
  const isFormal = ['会食', '歓迎会', '送別会'].includes(eventType)
  const genre = prefs.genres.find(g => g !== 'なんでもいい') ?? null
  const priceRange = prefs.priceRange !== '指定なし' ? prefs.priceRange : null
  const accessMins = parseAccessMins(store)
  const tone = detectStoreTone(store)
  const toneReason = TONE_REASON[tone]
  const hasGoodRating = !!(
    store.googleRating && store.googleRating >= 4.0 &&
    store.googleRatingCount && store.googleRatingCount >= 50
  )

  const candidates: string[] = []

  // 1. VIP（event_flow のみ実質有効）
  if (hasVip) {
    candidates.push(
      hasPrivateRoom
        ? '個室で主賓を迎えやすい'
        : '主賓の会に合う雰囲気'
    )
  }

  // 2. 駅近（≤5分）— 集まりやすさを最優先
  if (accessMins != null && accessMins <= 5) {
    const p = accessPhrase(accessMins)
    if (p) candidates.push(p)
  }

  // 3. 口コミ評価（4.0以上は信頼感として強いアピールになる）
  if (hasGoodRating) candidates.push('口コミ評価が高い')

  // 4. 明示的な個室条件（VIPで個室理由が出ていない場合のみ）
  if (privateRoomExplicit && hasPrivateRoom && !hasVip) {
    candidates.push(
      isFormal
        ? `個室で${eventType}しやすい`
        : '個室で落ち着きやすい'
    )
  }

  // 5. ジャンル一致
  if (genre) candidates.push(copy.genreReason(genre))

  // 6. 予算
  if (priceRange) candidates.push('予算感が読みやすい')

  // 7. 駅近（6〜12分）
  if (accessMins != null && accessMins > 5) {
    const p = accessPhrase(accessMins)
    if (p) candidates.push(p)
  }

  // 8. 店の空気感（personality）
  candidates.push(toneReason)

  // 9. 個室ボーナス（明示条件なし — 低優先でBulletに載る程度）
  if (hasPrivateRoom && !privateRoomExplicit && !hasVip) {
    candidates.push('個室で落ち着きやすい')
  }

  const hero = candidates[0] ?? toneReason
  const bullets = candidates.slice(1, 5)

  return { hero, bullets }
}

// ─── Alt store tag (他候補カード) ─────────────────────────────────────────────

export function buildAltStoreTag(store: ReasonStore): string | null {
  const hasPrivateRoom = !!store.hasPrivateRoom || (store.tags ?? []).includes('個室あり')
  if (hasPrivateRoom) return '個室'
  const accessMins = parseAccessMins(store)
  if (accessMins != null && accessMins <= 5) return '駅近'
  if (
    store.googleRating && store.googleRating >= 4.3 &&
    store.googleRatingCount && store.googleRatingCount >= 50
  ) return '評価高め'
  const genre = store.genre ?? ''
  if (/居酒屋|ダイニングバー|バル/.test(genre)) return '飲み向き'
  if (store.budgetCode === 'B005' || store.budgetCode === 'B006') return 'コスパ'
  if (accessMins != null && accessMins <= 10) return '駅近'
  return null
}
