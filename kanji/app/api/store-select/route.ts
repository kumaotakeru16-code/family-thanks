import { NextRequest, NextResponse } from 'next/server'

export const GEMINI_RANK_LIMIT = 5

const BUDGET_LABELS: Record<string, string> = {
  B005: '〜3,000円',
  B006: '3,001〜4,000円',
  B007: '4,001〜5,000円',
  B008: '5,001〜7,000円',
  B009: '7,001〜10,000円',
}

type StoreInput = {
  id: string
  name: string
  stationName?: string
  access?: string
  budgetCode?: string
  genre?: string
  tags?: string[]
  googleRating?: number | null
  googleRatingCount?: number | null
}

type SelectionConditions = {
  targetStation: string
  maxWalkMinutes?: number | null
  budgetCode?: string
  budgetLabel?: string
  genre?: string
}

export type GeminiSelection = {
  bestStoreId: string
  rankedStoreIds: string[]
  reasons: { storeId: string; reason: string }[]
  fallbackNotes: string[]
}

function buildPrompt(stores: StoreInput[], cond: SelectionConditions): string {
  const walkStr = cond.maxWalkMinutes
    ? `${cond.maxWalkMinutes}分以内（候補不足時のみ最大20分まで緩和可）`
    : '指定なし'
  const budgetStr = cond.budgetLabel || cond.budgetCode || '指定なし'
  const genreStr = cond.genre || '指定なし'

  const storeList = JSON.stringify(
    stores.map((s) => ({
      id: s.id,
      name: s.name,
      station_name: s.stationName || '(不明)',
      access: s.access || '',
      budget_code: s.budgetCode || '(不明)',
      budget_label: s.budgetCode ? (BUDGET_LABELS[s.budgetCode] ?? s.budgetCode) : '(不明)',
      genre: s.genre || '',
      tags: s.tags ?? [],
      google_rating: s.googleRating ?? null,
      google_rating_count: s.googleRatingCount ?? 0,
    })),
    null,
    2
  )

  return `あなたは飲み会・会食の幹事をサポートするAIです。
以下の候補店リストから、指定条件に最も合う店を ${GEMINI_RANK_LIMIT} 件まで選び、JSON形式だけで返してください。

## 指定条件
- 指定駅: ${cond.targetStation}
- 徒歩: ${walkStr}
- 価格帯: ${budgetStr}
- ジャンル: ${genreStr}

## 前提
- 候補店リストは Hot Pepper の条件一致結果を元にしています
- あなたは「最終順位づけ」と「理由文の生成」に集中してください
- Google評価は補助条件です。無い場合は無視してください

## 選定ルール（優先順位順に厳守してください）

1. **指定駅との一致を最優先**
   - station_name が「${cond.targetStation}」と一致する候補を最優先してください
   - station_name が空でも、access などから明らかに「${cond.targetStation}駅」徒歩圏と読み取れる候補は許容してよいです
   - 明らかに別駅の候補は rankedStoreIds に含めないでください

2. **徒歩条件**
   - まず指定徒歩分以内の店を優先してください
   - 徒歩分数が不明な候補は、条件内候補の次に扱ってください
   - 指定徒歩分以内の候補が少ない場合のみ、20分以内まで緩和してよいです
   - 緩和した場合は fallbackNotes に「条件に合う候補が少ないため、徒歩条件を20分以内に広げて表示しています」を追加してください

3. **価格帯**
   - 指定価格帯（${budgetStr}）の店を最優先してください
   - 完全一致がない場合は、近い価格帯の候補を優先してください
   - 特に安すぎる候補を bestStoreId にしないでください
   - 2段階以上低い価格帯の候補は、他に候補がある限り上位にしないでください
   - 価格帯を広げた場合は fallbackNotes に「条件に合う価格帯の候補が少ないため、価格帯を少し広げて表示しています」を追加してください

4. **ジャンル一致**
   - ジャンルが一致する店を優先してください
   - tags に「焼き鳥系」などの補助情報がある場合は参考にしてください
   - 特に「焼き鳥」希望時は、単なる居酒屋より焼き鳥・串系が明確な店を優先してください

5. **Google評価（補助条件）**
   - Google評価点と評価数がある場合は参考にしてください
   - 同条件なら、評価点が高く評価数も十分ある店をやや優先してください
   - rating が 3.6 未満で、他に十分な候補がある場合は上位にしないでください
   - ただし、指定駅・徒歩・価格帯・ジャンルの優先順位を上回ってはいけません

6. **総合的な納得感**
   - 上記を満たした上で、会の趣旨に自然に合う順に並べてください
   - 幹事が他人に説明しやすい店を優先してください

## 返却形式（JSONのみ。説明文は不要）
{
  "bestStoreId": "最もおすすめの店のid",
  "rankedStoreIds": ["id1", "id2", "id3"],
  "reasons": [
    { "storeId": "id1", "reason": "なぜこの店か（1〜2文）" }
  ],
  "fallbackNotes": []
}

## 候補店リスト
${storeList}
`
}

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
