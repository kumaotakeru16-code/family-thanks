import { NextRequest, NextResponse } from 'next/server'

const FALLBACK_STORES = [
  {
    id: 'fallback-1',
    name: '個室和食 紬 渋谷店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩3分',
    reason: '渋谷に集まりやすく、会食向きで外しにくい候補です。',
    link: '#',
    tags: ['完全個室', '会食向き', '駅近'],
  },
  {
    id: 'fallback-2',
    name: '美食米門 新宿店',
    area: '新宿',
    access: 'JR新宿駅 徒歩3分',
    reason: '別エリア候補として比較しやすい店です。',
    link: '#',
    tags: ['駅近', '会食向き'],
  },
  {
    id: 'fallback-3',
    name: '個室 焼肉 ごぶとん 渋谷本店',
    area: '渋谷',
    access: 'JR渋谷駅 徒歩2分',
    reason: '渋谷寄りでジャンル違いの保険候補です。',
    link: '#',
    tags: ['個室', '駅近'],
  },
]

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { stores: FALLBACK_STORES, fallback: true, error: 'GEMINI_API_KEY is not set' },
        { status: 200 }
      )
    }

    const body = await req.json()

    const p = body.orgPrefs ?? {}
    const prompt = `
あなたは飲み会の店候補を提案するアシスタントです。
以下の条件に合う実在する店候補を3件、日本語JSONで返してください。

条件:
- 会の種類: ${body.eventType}
- 日時: ${body.date}
- 参加人数: ${body.participantCount}
- 参加者のジャンル希望: ${(body.participants ?? []).map((r: any) => r.genres?.join('/')).filter(Boolean).join(', ') || 'なし'}
- 参加者のエリア希望: ${(body.participants ?? []).map((r: any) => r.areas?.join('/')).filter(Boolean).join(', ') || 'なし'}
- 価格帯: ${p.priceRange || '指定なし'}
- ジャンル: ${(p.genres ?? []).join('、') || '指定なし'}
- 個室: ${p.privateRoom || '指定なし'}
- 飲み放題: ${p.allYouCanDrink || '指定なし'}
- ドリンク: ${(p.drinks ?? []).join('、') || '指定なし'}
- 喫煙: ${p.smoking || '指定なし'}
- エリア: ${(p.areas ?? []).join('、') || '指定なし'}
- 雰囲気: ${(p.atmosphere ?? []).join('、') || '指定なし'}

各候補には、条件に具体的に言及した「理由」を必ず記述してください。

返却形式（JSONのみ、コードブロック不要）:
{
  "stores": [
    {
      "name": "店名",
      "area": "エリア",
      "access": "最寄り駅 徒歩X分",
      "reason": "この店を選んだ具体的な理由",
      "link": "https://tabelog.com/...",
      "tags": ["個室あり", "駅近"]
    }
  ]
}
`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      }
    )

    clearTimeout(timeout)

    const rawText = await geminiRes.text()

    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        return NextResponse.json(
          {
            stores: FALLBACK_STORES,
            fallback: true,
            error: `Gemini quota exceeded: ${rawText}`,
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        { stores: FALLBACK_STORES, fallback: true, error: rawText },
        { status: 200 }
      )
    }

    const geminiData = JSON.parse(rawText)
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(jsonText)

    return NextResponse.json({ ...parsed, fallback: false })
  } catch (e: any) {
    return NextResponse.json(
      {
        stores: FALLBACK_STORES,
        fallback: true,
        error: e?.message ?? 'unknown error',
      },
      { status: 200 }
    )
  }
}