import { NextRequest, NextResponse } from 'next/server'

export const GEMINI_RANK_LIMIT = 5

const BUDGET_LABELS: Record<string, string> = {
  B005: '〜3,000円',
  B006: '3,001〜4,000円',
  B007: '4,001〜5,000円',
  B008: '5,001〜7,000円',
  B009: '7,001〜10,000円',
}

// ── Types ──────────────────────────────────────────────────────────────────

type StoreInput = {
  id: string
  name: string
  stationName?: string
  access?: string
  budgetCode?: string
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
  genre?: string
  /** 参加人数（Gemini の判断材料として使う。10人以上は大人数コメントに使う。） */
  peopleCount?: number
  /** イベント種別（理由文の文体・観点に使う） */
  eventType?: string
}

export type GeminiSelection = {
  bestStoreId: string
  rankedStoreIds: string[]
  reasons: { storeId: string; reason: string }[]
  fallbackNotes: string[]
}

// ── Prompt ─────────────────────────────────────────────────────────────────

function buildPrompt(stores: StoreInput[], cond: SelectionConditions): string {
  const budgetStr = cond.budgetLabel || (cond.budgetCode ? (BUDGET_LABELS[cond.budgetCode] ?? cond.budgetCode) : '指定なし')
  const genreStr = cond.genre || '指定なし'
  const walkStr = cond.maxWalkMinutes ? `${cond.maxWalkMinutes}分以内` : '指定なし'
  const peopleStr = cond.peopleCount ? `${cond.peopleCount}人` : '不明'
  const isLargeGroup = (cond.peopleCount ?? 0) >= 10
  const eventStr = cond.eventType ?? '飲み会'

  const storeList = JSON.stringify(
    stores.map((s) => ({
      id: s.id,
      name: s.name,
      station_name: s.stationName || '(不明)',
      access: s.access || '',
      walk_minutes: s.walkMinutes ?? null,
      budget_code: s.budgetCode || '(不明)',
      budget_label: s.budgetCode ? (BUDGET_LABELS[s.budgetCode] ?? s.budgetCode) : '(不明)',
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
以下は **Hot Pepper strict 条件一致済みの候補店リスト** です。
このリストの中だけから最大 ${GEMINI_RANK_LIMIT} 件を選んでランク付けしてください。
リスト外の店を bestStoreId / rankedStoreIds に含めてはいけません。

## 会の概要
- イベント: ${eventStr}
- 参加人数: ${peopleStr}${isLargeGroup ? '（大人数 — 収容力・個室対応を重視）' : ''}

## 確定済み検索条件（Hot Pepper strict 一致済み）
- 駅: ${cond.targetStation}
- 徒歩: ${walkStr}
- 価格帯: ${budgetStr}
- ジャンル: ${genreStr}

## 選定優先順位（上から順に厳守）

### 1. 駅一致（絶対条件）
- station_name が「${cond.targetStation}」と一致する店を最優先
- station_name が空でも access に「${cond.targetStation}駅」を含む場合は許容
- どちらにも当てはまらない店は rankedStoreIds に含めないこと

### 2. 徒歩時間
- walk_minutes が小さいほど優先
- walk_minutes が null の場合は中位として扱う
- ※このリストはすでに徒歩条件でフィルタ済みのため、大幅な緩和は不要

### 3. 価格帯
- budget_code が指定価格帯と完全一致する店を優先
- bestStoreId には安すぎる店（指定より 2 段階以上低い）を選ばないこと
- 価格帯を広げた場合は fallbackNotes に「指定価格帯の候補が少ないため、価格帯を少し広げて表示しています」を追加

### 4. ジャンル適合
- genre / tags / name が希望ジャンルに近い店を優先
- **「焼き鳥」希望**: tags に「焼き鳥系」または name / genre に「焼き鳥」「串」「鶏」を含む店を最優先。単なる「居酒屋」より上位にすること
- **「焼肉」希望**: tags に「焼肉系」を含む店を優先
- **「居酒屋」希望**: 居酒屋色の強い店（焼き鳥・焼肉専門より汎用性の高い居酒屋）を優先

### 5. 個室・収容力
- has_private_room == true なら、他条件が同等のとき優先${isLargeGroup ? '\n- 大人数なので、個室・収容人数への言及がある店を積極的に上位にすること' : ''}

### 6. Google 評価（補助条件）
- google_rating と google_rating_count がある場合のみ参考にする
- 同条件なら評価が高い店をやや優先
- ただし上記 1〜5 の優先順位を上回ってはいけない

## 理由文ルール（重要）
各店に **1〜2文** の理由文を書いてください。

**必ず以下のうち 1〜2 点を具体的な数値・言葉で含めること:**
- 徒歩時間: 「${cond.targetStation}駅から徒歩○分」（walk_minutes が null なら省略）
- 価格帯: 「指定価格帯（${budgetStr}）にぴったり」「やや安め」など
- ジャンル: 「${genreStr}専門」「${genreStr}メインの居酒屋」など具体的に
- 個室: 「個室あり」（has_private_room == true のときのみ）
- 大人数: 「○人規模にも対応」（大人数かつ収容力に言及がある場合のみ）

**禁止表現:** 「おすすめ」「素敵」「良さそう」「ぴったりのお店」など曖昧な褒め言葉
**目標:** 幹事が参加者にそのまま読み上げられる具体的な一言

## 返却形式（JSON のみ。説明文・コードブロック不要）
{
  "bestStoreId": "最もおすすめの店の id",
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

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[store-select] GEMINI_API_KEY not set — returning null selection')
    return NextResponse.json({ selection: null })
  }

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

  const prompt = buildPrompt(stores, conditions)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
      console.error('[store-select] Gemini HTTP error:', res.status, errText.slice(0, 200))
      return NextResponse.json({ selection: null, error: `gemini_${res.status}` })
    }

    const data = await res.json()
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let selection: GeminiSelection | null = null
    try {
      selection = JSON.parse(rawText) as GeminiSelection
    } catch {
      console.error('[store-select] JSON parse failed:', rawText.slice(0, 300))
    }

    // Gemini が strict 母集団外の ID を返した場合は除去する（安全網）
    if (selection) {
      const validIds = new Set(stores.map((s) => s.id))
      selection.rankedStoreIds = selection.rankedStoreIds.filter((id) => validIds.has(id))
      if (!validIds.has(selection.bestStoreId)) {
        selection.bestStoreId = selection.rankedStoreIds[0] ?? ''
      }
    }

    console.log('[store-select] selection:', {
      best: selection?.bestStoreId,
      ranked: selection?.rankedStoreIds?.length,
      notes: selection?.fallbackNotes,
    })

    return NextResponse.json({ selection })
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError'
    console.error('[store-select] error:', isTimeout ? 'timeout' : e?.message)
    return NextResponse.json({
      selection: null,
      error: isTimeout ? 'timeout' : 'fetch_error',
    })
  }
}
