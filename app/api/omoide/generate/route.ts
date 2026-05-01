import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const SYSTEM_PROMPT = `あなたは3〜6歳向けの絵本ライターです。
子どもの写真と思い出から、やさしい日本語と英語の絵本を書きます。

ルール：
- 日本語：ひらがな多め、やさしい語彙、短文（2〜3文）
- 英語：短く音読しやすい、簡単な単語（2〜3文）
- 写真1枚につき1ページ
- ストーリーが自然につながるように書く
- メモに書かれた思い出・気持ちを反映する
- 主語は「ぼく」「わたし」「みんな」など子どもの視点

必ず以下のJSON形式のみで返答してください（他のテキストは一切不要）：
{
  "title": "えほんのタイトル（ひらがな、20文字以内）",
  "japaneseStory": ["1ページ目の日本語", "2ページ目の日本語", ...],
  "englishStory": ["1ページ目の英語", "2ページ目の英語", ...]
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { photos, globalMemo } = body as {
      photos: { dataUrl: string; memo?: string }[]
      globalMemo?: string
    }

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: 'photos is required' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const photoParts = photos.map((photo, i) => {
      const [header, base64] = photo.dataUrl.split(',')
      const mimeType = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg'
      return {
        index: i + 1,
        part: { inlineData: { data: base64, mimeType } },
        pageMemo: photo.memo ?? '',
      }
    })

    const memoParts = photoParts
      .map(p => p.pageMemo ? `写真${p.index}のメモ: ${p.pageMemo}` : '')
      .filter(Boolean)
      .join('\n')

    const userText = [
      `写真が${photos.length}枚あります。`,
      globalMemo ? `全体のメモ: ${globalMemo}` : '',
      memoParts,
      '',
      `この${photos.length}枚の写真で、${photos.length}ページの絵本を作ってください。`,
      'JSONのみで返してください。',
    ].filter(Boolean).join('\n')

    const contents = [
      { text: SYSTEM_PROMPT },
      { text: userText },
      ...photoParts.map(p => p.part),
    ]

    const result = await model.generateContent(contents)
    const text = result.response.text().trim()

    console.log('[omoide/generate] Gemini raw response:', text)

    // Strip markdown code fences if present
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let parsed: { title?: string; japaneseStory: string[]; englishStory: string[] }
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error('[omoide/generate] JSON parse failed:', jsonText)
      throw new Error('Gemini returned invalid JSON')
    }

    if (
      !Array.isArray(parsed.japaneseStory) ||
      !Array.isArray(parsed.englishStory) ||
      parsed.japaneseStory.length !== photos.length ||
      parsed.englishStory.length !== photos.length
    ) {
      console.error('[omoide/generate] Array length mismatch:', {
        expected: photos.length,
        jp: parsed.japaneseStory?.length,
        en: parsed.englishStory?.length,
      })
      throw new Error(`Story array length mismatch (expected ${photos.length})`)
    }

    console.log('[omoide/generate] Success:', {
      title: parsed.title,
      pages: photos.length,
    })

    return NextResponse.json({
      title: parsed.title,
      japaneseStory: parsed.japaneseStory,
      englishStory: parsed.englishStory,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[omoide/generate] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
