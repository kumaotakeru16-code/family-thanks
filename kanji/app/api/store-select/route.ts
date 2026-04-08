import { NextRequest, NextResponse } from 'next/server'

export const GEMINI_RANK_LIMIT = 5

type StoreInput = {
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

type SelectionConditions = {
  targetStation: string
  maxWalkMinutes?: number | null
  budgetCode?: string
  budgetLabel?: string
  priceRange?: string
  genre?: string
  peopleCount?: number
  eventType?: string
  areaAliases?: string[]
}

export type GeminiSelection = {
  bestStoreId: string
  rankedStoreIds: string[]
  reasons: { storeId: string; reason: string }[]
  fallbackNotes: string[]
}

type ParsedBudgetAverage = {
  estimatedMin: number | null
  estimatedMax: number | null
  sourceType: 'dinner' | 'normal' | 'banquet' | 'course' | 'generic' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  raw: string
}

function normalizeText(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

function normalizePriceText(text: string): string {
  return String(text ?? '')
    .replace(/[【】\[\]]/g, ' ')
    .replace(/[（(]/g, ' ')
    .replace(/[）)]/g, ' ')
    .replace(/[：:]/g, ':')
    .replace(/[／/]/g, ' / ')
    .replace(/[〜～~]/g, '〜')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStationToken(value: string): string {
  return normalizeText(value)
    .replace(/駅/g, '')
    .replace(/\s+/g, '')
}

function buildAreaAliases(targetStation: string, aliases?: string[]): string[] {
  const raw = aliases && aliases.length > 0 ? aliases : [targetStation]
  return Array.from(new Set(raw.map(normalizeStationToken).filter(Boolean)))
}

function parseYen(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

function extractRange(fragment: string): { min: number; max: number } | null {
  const text = normalizePriceText(fragment)

  const rangeMatch =
    text.match(/([0-9,]+)\s*円?\s*[〜\-]\s*([0-9,]+)\s*円?/) ||
    text.match(/([0-9,]+)\s*[〜\-]\s*([0-9,]+)\s*円?/)
  if (rangeMatch) {
    const min = parseYen(rangeMatch[1])
    const max = parseYen(rangeMatch[2])
    if (min !== null && max !== null) {
      return { min: Math.min(min, max), max: Math.max(min, max) }
    }
  }

  const singleWithTilde = text.match(/([0-9,]+)\s*円?\s*〜/)
  if (singleWithTilde) {
    const min = parseYen(singleWithTilde[1])
    if (min !== null) return { min, max: min + 1500 }
  }

  const single = text.match(/([0-9,]+)\s*円?/)
  if (single) {
    const value = parseYen(single[1])
    if (value !== null) return { min: value, max: value }
  }

  return null
}

function parseLabeledBudgetCandidates(text: string) {
  const normalized = normalizePriceText(text)
  const candidates: Array<{
    sourceType: ParsedBudgetAverage['sourceType']
    confidence: ParsedBudgetAverage['confidence']
    min: number
    max: number
  }> = []

  const patterns: Array<{
    type: ParsedBudgetAverage['sourceType']
    regex: RegExp
    confidence: ParsedBudgetAverage['confidence']
  }> = [
    { type: 'dinner', regex: /ディナー[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'high' },
    { type: 'normal', regex: /通常平均[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'medium' },
    { type: 'normal', regex: /フリー[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'medium' },
    { type: 'banquet', regex: /宴会[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'medium' },
    { type: 'course', regex: /コース[^0-9]{0,20}([0-9,]+(?:\s*円)?(?:\s*[〜\-]\s*[0-9,]+(?:\s*円)?)?)/g, confidence: 'low' },
  ]

  for (const { type, regex, confidence } of patterns) {
    const matches = normalized.matchAll(regex)
    for (const match of matches) {
      const parsed = extractRange(match[1])
      if (!parsed) continue
      candidates.push({
        sourceType: type,
        confidence,
        min: parsed.min,
        max: parsed.max,
      })
    }
  }

  return candidates
}

function parseBudgetAverage(average?: string): ParsedBudgetAverage {
  const text = normalizePriceText(average ?? '')
  if (!text) {
    return {
      estimatedMin: null,
      estimatedMax: null,
      sourceType: 'unknown',
      confidence: 'low',
      raw: text,
    }
  }

  const labeled = parseLabeledBudgetCandidates(text)
  const priority: ParsedBudgetAverage['sourceType'][] = ['dinner', 'normal', 'banquet', 'course']

  for (const type of priority) {
    const hit = labeled.find((c) => c.sourceType === type)
    if (hit) {
      return {
        estimatedMin: hit.min,
        estimatedMax: hit.max,
        sourceType: hit.sourceType,
        confidence: hit.confidence,
        raw: text,
      }
    }
  }

  const generic = extractRange(text)
  if (generic) {
    return {
      estimatedMin: generic.min,
      estimatedMax: generic.max,
      sourceType: 'generic',
      confidence: 'medium',
      raw: text,
    }
  }

  return {
    estimatedMin: null,
    estimatedMax: null,
    sourceType: 'unknown',
    confidence: 'low',
    raw: text,
  }
}

function hasMeaningfulBudgetAverage(value?: string): boolean {
  if (!value) return false
  const parsed = parseBudgetAverage(value)
  if (parsed.estimatedMin !== null || parsed.estimatedMax !== null) return true

  const v = normalizeText(value)
  if (!v || v === '(不明)') return false
  if (/各種ご用意|お問い合わせ|応相談/.test(v)) return false
  return /\d/.test(v)
}

function hasMeaningfulBudgetData(store: StoreInput): boolean {
  if (hasMeaningfulBudgetAverage(store.budgetAverage)) return true
  return (store.tags ?? []).some((tag) => hasMeaningfulBudgetAverage(tag))
}

function isAreaMatch(store: StoreInput, targetStation: string, aliases?: string[]): boolean {
  if (!targetStation) return true

  const normalizedAliases = buildAreaAliases(targetStation, aliases)
  const station = normalizeStationToken(store.stationName ?? '')
  const access = normalizeText(store.access ?? '')

  if (station && normalizedAliases.includes(station)) return true
  return normalizedAliases.some((alias) => access.includes(`${alias}駅`) || access.includes(alias))
}

function dedupeIds(ids: string[], validIds: Set<string>, limit = GEMINI_RANK_LIMIT): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (!validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

function requestedPriceRangeToNumbers(priceRange: string): { min: number | null; max: number | null } {
  switch (priceRange) {
    case '指定なし':
      return { min: 4000, max: 7000 }
    case '4,001〜5,000円':
      return { min: 4001, max: 5000 }
    case '5,001〜7,000円':
      return { min: 5001, max: 7000 }
    default:
      return { min: null, max: null }
  }
}

function scoreBudgetFit(store: StoreInput, priceRange?: string): number {
  if (!priceRange) return 0
  const requested = requestedPriceRangeToNumbers(priceRange)
  if (requested.min === null || requested.max === null) return 0

  const parsed = parseBudgetAverage(store.budgetAverage)
  if (parsed.estimatedMin === null || parsed.estimatedMax === null) return -8

  const actualMin = parsed.estimatedMin
  const actualMax = parsed.estimatedMax
  const overlapMin = Math.max(requested.min, actualMin)
  const overlapMax = Math.min(requested.max, actualMax)
  const overlaps = overlapMax >= overlapMin

  if (overlaps) {
    const overlapWidth = Math.max(0, overlapMax - overlapMin)
    const requestedWidth = Math.max(1, requested.max - requested.min)
    const overlapRatio = overlapWidth / requestedWidth
    let score = 26
    if (overlapRatio >= 0.7) score = 34
    else if (overlapRatio >= 0.4) score = 30

    if (parsed.sourceType === 'dinner') score += 2
    if (parsed.confidence === 'medium') score -= 1
    if (parsed.confidence === 'low') score -= 3
    return score
  }

  if (actualMax < requested.min) {
    const gap = requested.min - actualMax
    if (priceRange === '5,001〜7,000円') {
      if (gap <= 300) return 2
      if (gap <= 800) return -8
      if (gap <= 1500) return -20
      return -32
    }
    if (gap <= 300) return 4
    if (gap <= 800) return -4
    if (gap <= 1500) return -14
    return -26
  }

  if (actualMin > requested.max) {
    const gap = actualMin - requested.max
    if (gap <= 500) return 6
    if (gap <= 1200) return 0
    return -10
  }

  return 0
}

function scoreStoreForFallback(store: StoreInput, cond: SelectionConditions): number {
  let score = 0

  if (isAreaMatch(store, cond.targetStation, cond.areaAliases)) score += 30
  else score -= 18

  score += scoreBudgetFit(store, cond.priceRange)

  const text = `${store.genre ?? ''} ${(store.tags ?? []).join(' ')} ${store.name ?? ''}`

  if (cond.genre === '和風・居酒屋') {
    if (/居酒屋|和食|海鮮|魚|寿司|刺身|炉端|おでん|鍋|鶏料理|串焼|焼き鳥|やきとり/.test(text)) score += 12
  } else if (cond.genre === '洋食') {
    if (/イタリアン|フレンチ|ビストロ|バル|スペイン|パエリア|ピザ|パスタ/.test(text)) score += 12
  } else if (cond.genre === '中華') {
    if (/中華|四川|上海|広東|餃子|小籠包|火鍋/.test(text)) score += 12
  }

  if (store.hasPrivateRoom) score += 2
  if (typeof store.googleRating === 'number') score += Math.max(0, store.googleRating - 3.8) * 2

  return score
}

function formatReasonFromStore(store: StoreInput, cond?: SelectionConditions): string {
  const parts: string[] = []

  if (store.stationName) {
    parts.push(`${store.stationName}エリア`)
  }

  if (hasMeaningfulBudgetAverage(store.budgetAverage)) {
    parts.push(normalizeText(store.budgetAverage!))
  }

  if (!parts.length && store.genre) {
    parts.push(store.genre)
  }

  if (store.hasPrivateRoom) {
    parts.push('個室あり')
  }

  return parts.slice(0, 2).join('・') || '条件に近い候補です'
}

function buildPrompt(stores: StoreInput[], cond: SelectionConditions): string {
  const budgetStr = cond.priceRange || cond.budgetLabel || cond.budgetCode || '指定なし'
  const genreStr = cond.genre || '指定なし'
  const peopleStr = cond.peopleCount ? `${cond.peopleCount}人` : '不明'
  const isLargeGroup = (cond.peopleCount ?? 0) >= 10
  const eventStr = cond.eventType ?? '飲み会'
  const areaAliases = buildAreaAliases(cond.targetStation, cond.areaAliases)

  const storeList = JSON.stringify(
    stores.map((s) => ({
      id: s.id,
      name: s.name,
      station_name: s.stationName || '(不明)',
      access: s.access || '',
      walk_minutes: s.walkMinutes ?? null,
      budget_code: s.budgetCode || '(不明)',
      budget_average: s.budgetAverage || '(不明)',
      genre: s.genre || '',
      tags: s.tags ?? [],
      has_private_room: s.hasPrivateRoom ?? false,
      google_rating: s.googleRating ?? null,
      google_rating_count: s.googleRatingCount ?? 0,
    })),
    null,
    2
  )

  return `あなたは飲み会・会食の幹事補助AIです。
以下は Hot Pepper 条件一致済みの候補店リストです。
このリストの中だけから最大 ${GEMINI_RANK_LIMIT} 件を選んでランク付けしてください。
リスト外の店を bestStoreId / rankedStoreIds に含めてはいけません。

## 会の概要
- イベント: ${eventStr}
- 参加人数: ${peopleStr}${isLargeGroup ? '（大人数。収容力・個室対応をやや重視）' : ''}

## 確定済み検索条件
- 開催エリア: ${cond.targetStation}
- エリア別名候補: ${areaAliases.join(' / ')}
- 価格帯: ${budgetStr}
- 希望系統: ${genreStr}

## 選定優先順位
1. 開催エリア一致
- station_name が開催エリア別名候補のいずれかに近い店を優先
- access に開催エリア別名候補が含まれる場合も許容
- まったく別エリアの店を bestStoreId にしない
- rankedStoreIds の上位にも別エリアを残しすぎない

2. 系統の近さ
- 希望系統は「${genreStr}」
- 和風・居酒屋: 居酒屋、和食、海鮮、魚、寿司、刺身、炉端、おでん、鍋、鶏料理、串焼き、焼き鳥寄りの店を優先
- 洋食: イタリアン、フレンチ、ビストロ、バル、スペイン、パエリア、ピザ、パスタ寄りの店を優先
- 中華: 中華、四川、上海、広東、餃子、小籠包、火鍋寄りの店を優先
- 希望系統と明確にズレる店を bestStoreId にしない

3. 価格帯（重要）
- budget_average を最優先で見て、指定価格帯（${budgetStr}）に近い店を優先
- 重なり方が強い候補を上位にする
- bestStoreId には、指定価格帯より明らかに安すぎる店を選ばない
- budget_average が数値を含む候補については「不明」と扱わない
- fallbackNotes は本当に必要な場合だけ入れる。不要なら空配列にする

4. 個室・収容力
- has_private_room == true なら、他条件が同等のとき優先
${isLargeGroup ? '- 大人数なので、個室やまとまりやすさに言及できる店をやや優先' : ''}

5. Google評価（補助条件）
- google_rating と google_rating_count がある場合のみ参考にする
- 同条件なら評価が高い店をやや優先
- ただし上記1〜4を上回ってはいけない

## 理由文ルール
各店に1〜2文の理由文を書いてください。
必ず以下のうち1〜2点を具体的に含めること:
- 開催エリアとの近さ
- budget_average ベースの価格説明
- 系統の近さ
- 個室
- 大人数適合

禁止表現:
- 「おすすめ」
- 「素敵」
- 「良さそう」
- 「ぴったりのお店」

## fallbackNotes ルール
- 原則は []
- top候補の多くで budget_average 情報が足りず、価格帯判断がかなり難しい場合のみ短い日本語で1文だけ入れてよい

## 返却形式（JSONのみ）
{
  "bestStoreId": "最も良い店の id",
  "rankedStoreIds": ["id1", "id2", "id3"],
  "reasons": [
    { "storeId": "id1", "reason": "理由文（1〜2文）" }
  ],
  "fallbackNotes": []
}

## 候補店リスト
${storeList}
`
}

function buildFallbackSelection(stores: StoreInput[], cond?: SelectionConditions): GeminiSelection {
  const ranked = [...stores]
    .sort((a, b) => scoreStoreForFallback(b, cond ?? { targetStation: '' }) - scoreStoreForFallback(a, cond ?? { targetStation: '' }))
    .slice(0, GEMINI_RANK_LIMIT)

  const reasons = ranked.map((s) => ({
    storeId: s.id,
    reason: formatReasonFromStore(s, cond),
  }))

  return {
    bestStoreId: ranked[0]?.id ?? '',
    rankedStoreIds: ranked.map((s) => s.id),
    reasons,
    fallbackNotes: ['AI選定を使わず、条件に近い順で候補を表示しています。'],
  }
}

function sanitizeSelection(
  rawSelection: GeminiSelection,
  stores: StoreInput[],
  conditions: SelectionConditions
): GeminiSelection {
  const validIds = new Set(stores.map((s) => s.id))
  const storeMap = new Map(stores.map((s) => [s.id, s] as const))

  const rankedStoreIds = dedupeIds(rawSelection.rankedStoreIds ?? [], validIds, GEMINI_RANK_LIMIT)

  let bestStoreId = validIds.has(rawSelection.bestStoreId) ? rawSelection.bestStoreId : ''
  if (!bestStoreId) bestStoreId = rankedStoreIds[0] ?? ''

  if (bestStoreId && !rankedStoreIds.includes(bestStoreId)) {
    rankedStoreIds.unshift(bestStoreId)
  }

  const trimmedRanked = dedupeIds(rankedStoreIds, validIds, GEMINI_RANK_LIMIT)
  if (!trimmedRanked.length) {
    return buildFallbackSelection(stores, conditions)
  }

  const reasonsById = new Map<string, string>()
  for (const item of rawSelection.reasons ?? []) {
    if (!validIds.has(item.storeId)) continue
    const reason = normalizeText(item.reason || '')
    if (!reason) continue
    if (!reasonsById.has(item.storeId)) reasonsById.set(item.storeId, reason)
  }

  const reasons = trimmedRanked.map((id) => ({
    storeId: id,
    reason: reasonsById.get(id) || formatReasonFromStore(storeMap.get(id)!, conditions),
  }))

  const topStores = trimmedRanked.map((id) => storeMap.get(id)!).filter(Boolean)
  const topMeaningfulBudgetCount = topStores.filter((s) => hasMeaningfulBudgetData(s)).length

  const fallbackNotes: string[] =
    topStores.length > 0 && topMeaningfulBudgetCount <= 2
      ? ['価格帯の情報が限られる候補が多いため、記載のある予算情報を優先して並べています。']
      : []

  const bestStore = storeMap.get(bestStoreId)
  if (!bestStore) {
    return buildFallbackSelection(stores, conditions)
  }

  const fallbackSorted = [...topStores].sort((a, b) => scoreStoreForFallback(b, conditions) - scoreStoreForFallback(a, conditions))
  const fallbackBestId = fallbackSorted[0]?.id ?? bestStoreId
  const bestIsAreaMismatch = !isAreaMatch(bestStore, conditions.targetStation, conditions.areaAliases)

  if (bestIsAreaMismatch && fallbackBestId && fallbackBestId !== bestStoreId) {
    bestStoreId = fallbackBestId
    const reordered = dedupeIds([bestStoreId, ...trimmedRanked], validIds, GEMINI_RANK_LIMIT)
    return {
      bestStoreId,
      rankedStoreIds: reordered,
      reasons: reordered.map((id) => ({
        storeId: id,
        reason: reasonsById.get(id) || formatReasonFromStore(storeMap.get(id)!, conditions),
      })),
      fallbackNotes,
    }
  }

  return {
    bestStoreId,
    rankedStoreIds: trimmedRanked,
    reasons,
    fallbackNotes,
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview'

  let stores: StoreInput[] = []
  let conditions: SelectionConditions = { targetStation: '' }

  try {
    const body = await req.json()
    stores = Array.isArray(body.stores) ? body.stores : []
    conditions = body.conditions ?? { targetStation: '' }
  } catch {
    return NextResponse.json({ selection: null, error: 'invalid_body' }, { status: 400 })
  }

  if (stores.length === 0) {
    return NextResponse.json({ selection: null })
  }

  if (!apiKey) {
    console.warn('[store-select] GEMINI_API_KEY not set — returning fallback selection')
    return NextResponse.json({
      selection: buildFallbackSelection(stores, conditions),
      usedFallback: true,
    })
  }

  const prompt = buildPrompt(stores, conditions)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                bestStoreId: { type: 'STRING' },
                rankedStoreIds: { type: 'ARRAY', items: { type: 'STRING' } },
                reasons: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      storeId: { type: 'STRING' },
                      reason: { type: 'STRING' },
                    },
                    required: ['storeId', 'reason'],
                  },
                },
                fallbackNotes: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['bestStoreId', 'rankedStoreIds', 'reasons', 'fallbackNotes'],
            },
          },
        }),
        signal: controller.signal,
      }
    )

    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[store-select] Gemini HTTP error:', res.status, errText.slice(0, 300))
      return NextResponse.json({
        selection: buildFallbackSelection(stores, conditions),
        error: `gemini_${res.status}`,
        usedFallback: true,
      })
    }

    const data = await res.json()
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let selection: GeminiSelection
    try {
      selection = JSON.parse(rawText) as GeminiSelection
    } catch {
      console.error('[store-select] JSON parse failed:', rawText.slice(0, 300))
      return NextResponse.json({
        selection: buildFallbackSelection(stores, conditions),
        error: 'parse_failed',
        usedFallback: true,
      })
    }

    const sanitized = sanitizeSelection(selection, stores, conditions)

    console.log('[store-select] selection:', {
      model,
      best: sanitized.bestStoreId,
      ranked: sanitized.rankedStoreIds.length,
      notes: sanitized.fallbackNotes,
    })

    return NextResponse.json({ selection: sanitized, usedFallback: false })
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError'
    console.error('[store-select] error:', isTimeout ? 'timeout' : e?.message)
    return NextResponse.json({
      selection: buildFallbackSelection(stores, conditions),
      error: isTimeout ? 'timeout' : 'fetch_error',
      usedFallback: true,
    })
  }
}