'use client'

/**
 * きもちの整理 v3.3
 *
 * v3.2 → v3.3 変更点:
 * - AiResponse に short? 追加、UI は short ?? empathy で短文表示
 * - AiResponseCard から未使用 emotion 引数を除去
 * - ACTION_TABLE / lonely generators の reason を全て20字以内に短縮
 * - ActionSuggestionCard をグラデーション+装飾で視覚的主役に格上げ
 * - generateWave に位相ノイズを追加してフラット区間を排除
 * - getRelationState を前後半平均比較のトレンドベース判定に変更
 * - lonely: LonelySelectorSection 専用フロー確立、接続回復寄せ
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════ */

type Tab = 'home' | 'history' | 'settings'
type EmotionType = 'angry' | 'sad' | 'tired' | 'anxious' | 'lonely' | 'calm'
type FlowStep =
  | 'idle'
  | 'composing'
  | 'responding'
  | 'done'

type EmotionEvent = {
  id: string
  user_id: string
  partner_id: string | null
  emotion_type: EmotionType
  note: string | null
  ai_response: string | null
  ai_response_short: string | null
  share_status: 'unsent' | 'sent'
  shared_message: string | null
  selected_share_option_id: ShareOptionId | null
  partner_reaction: 'ack' | 'soon' | 'on_it' | null
  partner_reacted_at: string | null
  created_at: string
}

type AiResponse = {
  empathy: string
  short?: string          // 短文表示用（未指定時は empathy にフォールバック）
  interpretation: string
  nextStep: string
}

type ActionSuggestion = {
  label: string
  reason?: string
  impact?: 'low' | 'medium' | 'high'
}

type FbTone = 'sweet' | 'normal' | 'spicy'
type WorkStatus = 'fulltime' | 'parttime' | 'parental_leave' | 'stay_home' | 'unknown'
type ChildStage = 'newborn' | 'infant' | 'toddler' | 'preschool' | 'unknown'

type Profile = {
  id: string; email: string | null; pair_code: string | null
  partner_id: string | null; created_at: string
  fb_tone: FbTone | null; my_work_status: WorkStatus | null
  partner_work_status: WorkStatus | null; child_stage: ChildStage | null
  my_busyness: number | null; partner_busyness: number | null
}

type SoloLog = { id: string; label: string; tag: string; created_at: string }
type Toast = { id: number; msg: string; emoji?: string; accent?: boolean }

type SharePlan = {
  options: ShareOption[]
  recommendedId: string
}

type TranslatedShare = {
  message: string
  sourceTags?: string[]
  selectedOptionId?: string | null
  tone?: 'soft' | 'normal' | 'direct'
}

type FlowState = {
  step: FlowStep
  emotion: EmotionType | null
  note: string
  selectedBackgroundIds: BackgroundOptionId[]
  aiResponse: AiResponse | null
  actionSuggestion: ActionSuggestion | null
  altSuggestions: ActionSuggestion[]
  sharePlan: SharePlan | null
  selectedShareOptionId: string | null
  translated: TranslatedShare | null
  savedEventId: string | null
  isShared: boolean
  isLoadingAi: boolean
  isSharing: boolean
  recovered: boolean
  isResponded: boolean
  lonelyTag: LonelyTag | null
}

type ShareOptionId =
  | 'swap_tonight'
  | 'listen_10m'
  | 'leave_me_alone'
  | 'take_one_task'
  | 'rest_time'
  | 'listen_5m'
  | 'one_help'
  | 'quiet_time'
  | 'notice_me'

type ShareOption = {
  id: ShareOptionId
  label: string
}

type BackgroundOptionId =
  | 'sleep_dep'
  | 'child_care'
  | 'chore_burden'
  | 'work_stress'
  | 'isolated'
  | 'relationship'
  | 'sick'
  | 'financial'

type LonelyTag =
  | 'not_noticed'
  | 'less_talk'
  | 'carry_alone'
  | 'feel_distance'
  | 'hard_to_ask'
  | 'seems_busy'
  | 'not_fulfilled'

type BackgroundOption = {
  id: BackgroundOptionId
  label: string
  description: string
  emoji: string
}

const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'sleep_dep',    label: '睡眠不足',      description: '夜泣き・夜間対応・細切れ睡眠',     emoji: '😵' },
  { id: 'sick',         label: '体調不良',      description: '風邪・頭痛・だるさ',               emoji: '🤒' },
  { id: 'chore_burden', label: '家事が重い',    description: '料理・洗濯・買い物・片付け',       emoji: '🧺' },
  { id: 'child_care',   label: '育児負荷',      description: '寝かしつけ・抱っこ・オムツ・ミルク', emoji: '🍼' },
  { id: 'work_stress',  label: '仕事の不安',    description: '復職・会議・連絡・締切',           emoji: '💼' },
  { id: 'isolated',     label: '一人時間がない', description: 'ずっと気が張っている',             emoji: '🫠' },
  { id: 'relationship', label: 'すれ違い',      description: '伝わらない・気づかれない',         emoji: '🫥' },
  { id: 'financial',    label: 'お金の不安',    description: '生活費・支出・将来への不安',        emoji: '💸' },
]

const LONELY_OPTIONS: { id: LonelyTag; label: string }[] = [
  { id: 'not_noticed',   label: '気づいてもらえてない' },
  { id: 'less_talk',     label: '会話が足りない' },
  { id: 'carry_alone',   label: '一人で抱えてる感じ' },
  { id: 'feel_distance', label: '距離を感じる' },
  { id: 'hard_to_ask',   label: '頼りづらい' },
  { id: 'seems_busy',    label: '余裕がなさそう' },
  { id: 'not_fulfilled', label: 'なんとなく満たされない' },
]

/* ═══════════════════════════════════════════════════
   EMOTION METADATA
═══════════════════════════════════════════════════ */

const EMOTIONS: {
  type: EmotionType; emoji: string; label: string
  color: string; bg: string; activeBg: string; border: string
}[] = [
  { type: 'calm',    emoji: '😌', label: '落ち着いてる', color: 'text-teal-700',   bg: 'bg-teal-50',   activeBg: 'bg-teal-100',   border: 'border-teal-200'   },
  { type: 'angry',   emoji: '😤', label: 'イライラ',     color: 'text-red-700',    bg: 'bg-red-50',    activeBg: 'bg-red-100',    border: 'border-red-200'    },
  { type: 'sad',     emoji: '😢', label: 'つらい',       color: 'text-blue-700',   bg: 'bg-blue-50',   activeBg: 'bg-blue-100',   border: 'border-blue-200'   },
  { type: 'tired',   emoji: '😩', label: 'つかれた',     color: 'text-amber-700',  bg: 'bg-amber-50',  activeBg: 'bg-amber-100',  border: 'border-amber-200'  },
  { type: 'anxious', emoji: '😰', label: 'しんどい',     color: 'text-violet-700', bg: 'bg-violet-50', activeBg: 'bg-violet-100', border: 'border-violet-200' },
  { type: 'lonely',  emoji: '🥺', label: 'さみしい',     color: 'text-rose-700',   bg: 'bg-rose-50',   activeBg: 'bg-rose-100',   border: 'border-rose-200'   },
]

const emMeta = (t: EmotionType) => EMOTIONS.find(e => e.type === t)!


/* ═══════════════════════════════════════════════════
   CONTEXT TAG EXTRACTION
═══════════════════════════════════════════════════ */

type ContextTag =
  | 'sick' | 'sleep_dep' | 'chore_burden' | 'work_stress'
  | 'isolated' | 'child_care' | 'relationship' | 'financial' | 'none'

const CONTEXT_RULES: [RegExp, ContextTag][] = [
  [/風邪|熱|体調|病気|しんどい|頭痛|腹痛|だるい|気分が悪/,           'sick'],
  [/寝不足|眠れ|夜泣き|夜間|授乳|起き|ミルク/,                       'sleep_dep'],
  [/料理|洗濯|掃除|買い物|家事|ゴミ|ワンオペ|全部私|自分だけ/,        'chore_burden'],
  [/仕事|職場|会議|復職|締め切り|残業|上司|同僚/,                     'work_stress'],
  [/一人|孤独|誰も|助けてくれ|放置|無視|ほっとか/,                    'isolated'],
  [/子ども|育児|保育園|お迎え|寝かしつけ|オムツ|抱っこ/,              'child_care'],
  [/すれ違い|ありがとうもない|気づいてくれ|理解されない|伝わらない|感謝/, 'relationship'],
  [/お金|費用|節約|生活費|不安/,                                       'financial'],
]

const CONTEXT_TAG_VALUES: ContextTag[] = [
  'sick', 'sleep_dep', 'chore_burden', 'work_stress',
  'isolated', 'child_care', 'relationship', 'financial', 'none',
]

function isContextTag(value: string): value is ContextTag {
  return CONTEXT_TAG_VALUES.includes(value as ContextTag)
}

function extractContexts(note: string | null): [ContextTag, ContextTag | null] {
  if (!note?.trim()) return ['none', null]
  const n = note.toLowerCase()
  const hits = CONTEXT_RULES.filter(([re]) => re.test(n)).map(([, t]) => t)
  return hits.length === 0 ? ['none', null] : [hits[0], hits[1] ?? null]
}

function pickPrimaryContext(
  emotion: EmotionType,
  note: string | null,
  backgroundTags: string[] = [],
): ContextTag {
  const noteContexts = extractContexts(note).filter(
    (tag): tag is ContextTag => !!tag && tag !== 'none'
  )

  const bgContexts = backgroundTags.filter(
    (tag): tag is ContextTag => isContextTag(tag) && tag !== 'none'
  )

  const emotionPriority: Record<EmotionType, ContextTag[]> = {
    calm:    ['relationship', 'isolated', 'child_care', 'sleep_dep', 'work_stress', 'chore_burden', 'sick', 'financial', 'none'],
    angry:   ['relationship', 'chore_burden', 'sleep_dep', 'isolated', 'work_stress', 'child_care', 'sick', 'financial', 'none'],
    sad:     ['relationship', 'isolated', 'sleep_dep', 'sick', 'child_care', 'work_stress', 'chore_burden', 'financial', 'none'],
    tired:   ['sleep_dep', 'child_care', 'chore_burden', 'work_stress', 'sick', 'isolated', 'relationship', 'financial', 'none'],
    anxious: ['work_stress', 'financial', 'child_care', 'sick', 'relationship', 'isolated', 'sleep_dep', 'chore_burden', 'none'],
    lonely:  ['relationship', 'isolated', 'sleep_dep', 'child_care', 'work_stress', 'chore_burden', 'sick', 'financial', 'none'],
  }

  const scoreMap = new Map<ContextTag, number>()

  const addScore = (tag: ContextTag, score: number) => {
    scoreMap.set(tag, (scoreMap.get(tag) ?? 0) + score)
  }

  // note はユーザーの生の言葉なので重く見る
  for (const tag of noteContexts) addScore(tag, 3)

  // backgroundTags は補助情報として使う
  for (const tag of bgContexts) addScore(tag, 2)

  // noteの内容から追加ブースト
  const safeNote = (note ?? '').trim()

  const boostIfMatch = (patterns: RegExp[], tag: ContextTag, score = 2) => {
    if (patterns.some(re => re.test(safeNote))) addScore(tag, score)
  }

  boostIfMatch([/寝不足/, /眠れ/, /寝れてない/, /寝れない/, /夜泣き/], 'sleep_dep', 3)
  boostIfMatch([/育児/, /授乳/, /ミルク/, /寝かしつけ/, /保育園/, /送迎/, /お迎え/], 'child_care', 2)
  boostIfMatch([/洗濯/, /皿洗い/, /食器/, /片付け/, /掃除/, /夕飯/, /ご飯/, /食事/], 'chore_burden', 2)
  boostIfMatch([/仕事/, /会議/, /残業/, /締切/, /上司/], 'work_stress', 2)
  boostIfMatch([/伝わら/, /言えな/, /わかってくれ/, /無視/, /冷た/, /すれ違/], 'relationship', 3)
  boostIfMatch([/ひとり/, /一人/, /孤独/, /誰も/, /抱え込/, /自分だけ/], 'isolated', 3)
  boostIfMatch([/熱/, /体調/, /しんどい/, /頭痛/, /吐き気/, /咳/], 'sick', 2)
  boostIfMatch([/お金/, /家計/, /出費/, /貯金/, /ローン/], 'financial', 2)

  const priority = emotionPriority[emotion]

  let bestTag: ContextTag = 'none'
  let bestScore = 0
  let bestPriorityIndex = Infinity

  for (const tag of priority) {
    if (tag === 'none') continue
    const score = scoreMap.get(tag) ?? 0
    if (score <= 0) continue

    const priorityIndex = priority.indexOf(tag)

    if (
      score > bestScore ||
      (score === bestScore && priorityIndex < bestPriorityIndex)
    ) {
      bestTag = tag
      bestScore = score
      bestPriorityIndex = priorityIndex
    }
  }

  return bestTag
}

export function generateDailyInsight(events: EmotionEvent[]) {
  const scoreMap: Record<string, number> = {
    angry: -2,
    sad: -2,
    anxious: -1,
    tired: -1,
    lonely: -2,
  }

  const now = new Date()

  const last3 = events.filter(e =>
    new Date(e.created_at) > new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  )

  const prev3 = events.filter(e => {
    const d = new Date(e.created_at)
    return (
      d <= new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) &&
      d > new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    )
  })

  const avg = (arr: EmotionEvent[]) =>
    arr.length === 0
      ? 0
      : arr.reduce((sum, e) => sum + (scoreMap[e.emotion_type] ?? 0), 0) / arr.length

  const diff = avg(last3) - avg(prev3)

  let main = ""

  if (diff > 0.5) {
    main = "昨日より少し軽くなってきてますね"
  } else if (diff < -0.5) {
    main = "少し負荷がたまってきてますね"
  } else {
    main = "ここ数日、同じくらいのペースですね"
  }

  return main + "。その中でもちゃんと向き合ってますね"
}

/* ═══════════════════════════════════════════════════
   AI RESPONSE MATRIX
═══════════════════════════════════════════════════ */

type ResponseTemplate = { empathy: string; interpretation: string; nextStep: string }

const RESPONSE_MATRIX: Partial<Record<EmotionType, Partial<Record<ContextTag, ResponseTemplate>>>> = {
  angry: {
    sick:         { empathy: '体調が悪いのに家事育児が落ちないのは、かなりきついよ。',               interpretation: '風邪をひいてる時は、普段できることが一気に重くなる。そこに怒りが出るのは当然。',    nextStep: '今日は「やらなくていいこと」を1つ決めて手放す。全部回そうとしないでいい。' },
    sleep_dep:    { empathy: '寝られてない中で怒りが出てくるのは、体が限界に来てるサインだよ。',       interpretation: '寝不足は判断力も感情の調節も狂わせる。イライラして当然の状態。',                    nextStep: '今すぐ全部解決しようとしない。「今夜だけ早く寝る」という1点に絞る。' },
    chore_burden: { empathy: '家事が全部のしかかってくる感覚、そりゃイライラするよ。',                 interpretation: '「なんで自分だけ」という怒りは、不公平さへの正当な反応。',                          nextStep: '感情がある程度落ち着いてから、1つだけ具体的に頼みたいことを伝える。' },
    isolated:     { empathy: '一人で全部抱えながら怒りが出てくるのは、SOSのサインだよ。',             interpretation: '助けを求めても来ない状況が続くと、怒りは当然大きくなる。',                          nextStep: '今日は「誰かに1つだけ頼む」練習をしてみる。断られても続けることが大事。' },
    relationship: { empathy: '気づいてもらえない、感謝されない、それが積み重なれば怒りになるよ。',    interpretation: '相手に悪意はないかもしれないけど、見えていないのは事実。',                          nextStep: '「気づいてほしかった」という言葉から始めると、責めるより伝わりやすい。' },
    work_stress:  { empathy: '仕事のプレッシャーに家のことまで重なってきたら、そりゃ怒りが出るよ。', interpretation: '両方に全力は無理。それを求められてる状況そのものが問題。',                          nextStep: '仕事と家の優先順位を今日だけ決め直す。全部同時にやろうとしない。' },
    child_care:   { empathy: '育児しながら余裕がなくてイライラする、それは責めるようなことじゃない。', interpretation: '子どもに対して怒りが出る自分に罪悪感を持ちやすいけど、それは疲弊のサイン。',      nextStep: '5分だけでいい、子どもと離れて一人になる時間を作れないか考えてみる。' },
    none:         { empathy: 'そのイライラ、ちゃんと理由があると思う。',                             interpretation: '怒りはたいてい「こうしてほしかった」が叶わなかったサイン。',                        nextStep: '感情が少し落ち着いたら、相手に「1つだけ頼みたいこと」を短く伝えてみる。' },
  },
  sad: {
    sick:         { empathy: '体がしんどいのに、心も追いついていないんだね。',         interpretation: '体調が悪い時は感情が不安定になりやすい。つらさが倍になる。',                            nextStep: '今日は休むことを「サボり」じゃなく「必要なこと」として扱っていい。' },
    sleep_dep:    { empathy: '眠れてない時に悲しさが来ると、本当にしんどいよ。',       interpretation: '睡眠不足は感情の防御を崩す。今感じてる悲しさは、睡眠が戻ると少し変わることがある。',      nextStep: '今夜は少し早く横になってみる。それだけで十分。' },
    isolated:     { empathy: '一人で抱えてる感覚が続くと、悲しくなるのは自然だよ。', interpretation: 'さみしさと悲しさが混ざってる状態かもしれない。どちらもちゃんとした感情。',                    nextStep: '「最近ちょっとさみしかった」この一言だけを誰かに伝えてみる。' },
    relationship: { empathy: '伝わらない、気づいてもらえない、それが続くと悲しくなるよ。', interpretation: '相手の無関心に見えるものが、実は余裕のなさから来てることもある。',                    nextStep: '今夜5分だけ、「最近しんどかった」と静かに話す機会を作れないか。' },
    none:         { empathy: 'そのつらさ、ちゃんと受け取ったよ。',                   interpretation: '言葉にするのが難しい悲しさもある。それでも感じているのは本物。',                          nextStep: '今日は「休む」か「誰かに話す」どちらか1つを選んでみて。' },
  },
  tired: {
    sick:         { empathy: '体調が悪いのに動き続けてるんだね。それはきつすぎる。',                     interpretation: '風邪で休めない状況は、消耗が倍になる。疲れて当然。',                                  nextStep: '今日できる「最低限1つ」だけにしぼって、あとは手放す許可を自分に出す。' },
    sleep_dep:    { empathy: '夜間対応が続いてるんだね。そんな状態で動いてるだけで十分すごい。',         interpretation: '慢性的な睡眠不足は、疲れの感覚を麻痺させることがある。実際は思ってるより消耗してる。', nextStep: '今夜だけでいい、「家事を1つ飛ばす」選択を自分に許す。' },
    chore_burden: { empathy: '家事が全部自分に来てる状態で疲れるのは、当たり前のことだよ。',             interpretation: '「頑張れば終わる」と思いながら続けていると、消耗に気づきにくい。',                      nextStep: '今日は1つだけ、「やらなかった」を選んでみる。罪悪感を持たなくていい。' },
    work_stress:  { empathy: '仕事と育児・家事が全部重なってる中でよく動いてるよ。',                    interpretation: '複数のことに同時に全力は、人間には無理な設計。疲れは当然。',                          nextStep: '「今週だけ」仕事か家かどちらかの基準を少し下げる許可を自分に出す。' },
    child_care:   { empathy: '育児って、終わりが見えない疲れだよ。それがずっと続いてるんだね。',          interpretation: 'ケアを与え続けることは消耗するけど、その大変さは見えにくい。',                          nextStep: '今日は「ありがとう」を自分に言ってみる。誰かに言ってもらえなくても。' },
    none:         { empathy: 'よくここまで頑張ってきたよ。',                                           interpretation: '疲れているのに動き続けていること、それ自体がしんどいことだと思う。',                  nextStep: '今日は1つだけ「やめる」選択をしてみる。' },
  },
  anxious: {
    sick:        { empathy: '体調が悪い中で不安が来ると、本当にしんどいよ。',           interpretation: '体が弱ってる時は不安が大きく感じやすい。今感じてることは、体調が戻ると変わることがある。', nextStep: '今日は「体を治すこと」だけを最優先にしていい。他は後回しにしていい。' },
    work_stress: { empathy: '仕事の不安が頭から離れないんだね。それは本当に消耗する。', interpretation: '仕事の心配は、考えれば考えるほど広がりやすい。止まらなくなることもある。',                    nextStep: '今日の不安を紙に1行だけ書き出してみる。頭の中に置いておくより少し楽になることがある。' },
    financial:   { empathy: 'お金の不安は、生活の基盤への不安だから、大きくなるのは自然だよ。', interpretation: '漠然とした不安は、具体化すると少し小さくなることがある。',                           nextStep: '今月の支出を1つだけ「確認する」ことから始めてみる。全部じゃなくていい。' },
    child_care:  { empathy: '育児への不安が重なってるんだね。それは本当に重いよ。',     interpretation: '子どものことを心配するのは愛情があるからだけど、心配しすぎると消耗する。',                  nextStep: '今日だけ「これで十分」という基準を少し下げてみる。' },
    none:        { empathy: 'そのしんどさ、放置しなくてよかったと思う。',               interpretation: '不安は言葉にするだけで少し輪郭が見えてくることがある。',                                    nextStep: '今一番気になっていることを、一言だけ声に出してみる。' },
  },
  lonely: {
    relationship: { empathy: '同じ空間にいるのに、気持ちが届いてない感じって、すごくしんどいよ。', interpretation: '近くにいるのにすれ違うさみしさは、離れてる時より深く来ることがある。伝わらない、気づかれないという感覚が積み重なってるのかもしれない。', nextStep: '「さみしかった」という言葉は、責めてるように聞こえにくい。その一言だけから始めてみる。' },
    isolated:     { empathy: '一人で全部やってきた感覚が続くと、さみしさが静かに深くなるよ。',     interpretation: 'やることをこなすのに必死で、自分がどれだけ孤独だったか気づくのが後になることがある。',                                                               nextStep: '「最近一人でやりすぎてた」の一言だけを誰かに伝えてみる。全部説明しなくていい。' },
    sleep_dep:    { empathy: '夜中に一人で起きてる時間が続くと、さみしさが深くなるよ。',           interpretation: '孤独感は夜や疲れてる時に増幅しやすい。今感じてることは本物だけど、状況の影響もある。',                                                               nextStep: '明日の昼間、誰かに「最近しんどかった」と一言伝えてみる。' },
    child_care:   { empathy: '育児で毎日いっぱいいっぱいで、自分が見えなくなってるんだね。',         interpretation: 'ケアし続ける役割にいると、自分がケアされる感覚がなくなりやすい。',                                                                                     nextStep: '今日は自分のためだけに5分使う。何でもいい。' },
    none:         { empathy: 'さみしかったんだね。そう感じてることをちゃんと受け取ったよ。',         interpretation: '一人で抱えてた感覚が、ここに来て少し緩まるといいな。',                                                                                               nextStep: '今日「さみしかった」を誰かに伝えてみる。言葉にするだけで変わることがある。' },
  },
}

const FALLBACK: Record<EmotionType, ResponseTemplate> = {
  calm:    { empathy: '落ち着いてる日、大事にしてね。',                  interpretation: '余裕がある時こそ、ふたりの関係を整えるチャンス。',             nextStep: '今日、パートナーに一言だけ声をかけてみる。' },
  angry:   { empathy: 'そのイライラ、ちゃんと理由があると思う。',       interpretation: '怒りはたいてい「こうしてほしかった」が叶わなかったサイン。',   nextStep: '少し落ち着いたら、1つだけ頼みたいことを短く伝えてみる。' },
  sad:     { empathy: 'そのつらさ、ちゃんと受け取ったよ。',             interpretation: '悲しさは無視できない感情。それを感じているのは本物。',          nextStep: '今日は「休む」か「話す」どちらか1つを選んでみて。' },
  tired:   { empathy: 'よくここまで頑張ってきたよ。',                   interpretation: '疲れているのに動き続けてきた、それ自体がしんどい。',            nextStep: '今日は1つだけ「やめる」選択をしてみる。' },
  anxious: { empathy: 'そのしんどさ、放置しなくてよかったと思う。',     interpretation: '不安は言葉にするだけで少し輪郭が見えてくることがある。',        nextStep: '今一番気になっていることを、一言だけ声に出してみる。' },
  lonely:  { empathy: 'さみしかったんだね。そう感じてることを受け取ったよ。', interpretation: '一人で抱えてた感覚が、ここで少し緩まるといいな。',          nextStep: '「さみしかった」を誰かに伝えてみる。言葉にするだけで変わることがある。' },
}
function generateAiResponse(
  emotion: EmotionType,
  note: string | null,
  backgroundTags: string[] = [],
): AiResponse {
  const safeNote = (note ?? '').trim()
  const primary = pickPrimaryContext(emotion, safeNote, backgroundTags)

  const has = (tag: string) => backgroundTags.includes(tag)
  const includesAny = (patterns: RegExp[]) => patterns.some(re => re.test(safeNote))

  const isSleepIssue =
    has('sleep_dep') || includesAny([/寝不足/, /眠れ/, /寝れてない/, /寝れない/, /夜泣き/])

  const isChildCareIssue =
    has('child_care') || includesAny([/育児/, /授乳/, /ミルク/, /寝かしつけ/, /保育園/, /送迎/, /お迎え/])

  const isHouseworkIssue =
    has('chore_burden') || includesAny([/洗濯/, /片付け/, /皿洗い/, /食器/, /掃除/, /夕飯/, /ご飯/, /食事/])

  const isRelationshipIssue =
    has('relationship') || includesAny([/わかってくれ/, /伝わら/, /言えな/, /すれ違/, /冷た/, /無視/])

  const isStrongState =
    includesAny([/限界/, /いっぱいいっぱい/, /もう無理/, /しんどすぎ/, /きつい/])

  // ===== 🔥 hook（ここがバズの核） =====
  const hookLine = (() => {
    if (emotion === 'angry') return 'なんで自分ばっかりって感じになるよね。'
    if (emotion === 'lonely') return '近くにいるのに、一人でやってる感じするよね。'
    if (emotion === 'tired') return 'ずっと回し続けてる感じ、しんどいよね。'
    if (emotion === 'sad') return 'なんとなく気持ち落ちる日、あるよね。'
    if (emotion === 'anxious') return 'なんかずっと落ち着かない感じ、あるよね。'
    return ''
  })()

  const base =
    RESPONSE_MATRIX[emotion]?.[primary] ??
    RESPONSE_MATRIX[emotion]?.['none'] ??
    FALLBACK[emotion]

  // ===== lonely =====
  if (emotion === 'lonely') {
    if (isRelationshipIssue) {
      return {
        empathy: `${hookLine}近くにいるのに気持ちが重なりにくいと、しんどくなるよね。`,
        interpretation:
          '距離があるというより、お互いに余裕がなくて気持ちが届きにくくなっている状態かもしれない。',
        nextStep: '全部を伝えようとせず、「少しだけ聞いてほしい」とだけ伝えてみよう。',
      }
    }

    if (isChildCareIssue || isSleepIssue) {
      return {
        empathy: `${hookLine}ひとりで抱えてる感じが続くと、しんどさも大きくなるよね。`,
        interpretation:
          '助けがないというより、「気づいてもらえてない感覚」が積み重なっているのかもしれない。',
        nextStep: '今いちばん軽くなることを1つだけ、短く頼んでみよう。',
      }
    }
  }

  // ===== tired =====
  if (emotion === 'tired') {
    if (isSleepIssue && isChildCareIssue) {
      return {
        empathy: `${hookLine}寝不足と負担が重なると、かなり削られるよね。`,
        interpretation:
          '気合いで回してきたぶん、疲れが一気に出てきている状態かもしれない。',
        nextStep: '今日は全部やるより、1つ減らす前提で考えてみよう。',
      }
    }

    if (isHouseworkIssue) {
      return {
        empathy: `${hookLine}細かい負担が積み重なると、それだけで消耗するよね。`,
        interpretation:
          '大きな原因というより、小さな負荷の積み重なりで余裕が削られている状態かもしれない。',
        nextStep: '家のことを1つだけ減らすなら何か、先に決めてみよう。',
      }
    }
  }

  // ===== angry =====
  if (emotion === 'angry') {
    if (isRelationshipIssue) {
      return {
        empathy: `${hookLine}わかってほしいのに伝わらないと、イライラするよね。`,
        interpretation:
          '怒りの奥に、「気づいてほしかった」「助けてほしかった」があるのかもしれない。',
        nextStep: '責める前に、「どうしてほしかったか」を1つだけ言葉にしてみよう。',
      }
    }

    if (isStrongState || isChildCareIssue || isHouseworkIssue) {
      return {
        empathy: `${hookLine}余裕がない時ほど、強く反応しちゃうよね。`,
        interpretation:
          '怒りというより、負荷が重なって反応しやすくなっている状態かもしれない。',
        nextStep: '今は結論を出さず、まず1つだけ負担を減らそう。',
      }
    }
  }

  // ===== sad =====
  if (emotion === 'sad') {
    if (isRelationshipIssue) {
      return {
        empathy: `${hookLine}気持ちが届かない感じが続くと、静かにしんどくなるよね。`,
        interpretation:
          '出来事よりも、「ひとりで受け止めている感覚」がつらさを大きくしているのかもしれない。',
        nextStep: '「今日は少ししんどい」とだけでも伝えてみよう。',
      }
    }

    if (isSleepIssue) {
      return {
        empathy: `${hookLine}眠れない日が続くと、気持ちも落ちやすくなるよね。`,
        interpretation:
          '気持ちの問題というより、体力の低下が影響している可能性がある。',
        nextStep: '今日は回復を優先して、少しでも休める時間を確保しよう。',
      }
    }
  }

  // ===== anxious =====
  if (emotion === 'anxious') {
    if (isRelationshipIssue) {
      return {
        empathy: `${hookLine}どう伝えたらいいか考えるほど、不安になるよね。`,
        interpretation:
          '相手の反応が読めないことが、不安を大きくしているのかもしれない。',
        nextStep: '長く伝えず、お願いを1つだけに絞ってみよう。',
      }
    }

    if (isStrongState) {
      return {
        empathy: `${hookLine}余裕がない時は、先のことまで不安になるよね。`,
        interpretation:
          '疲れや負荷で、見通しが立てにくくなっている状態かもしれない。',
        nextStep: '今決めることと、後でいいことを分けてみよう。',
      }
    }
  }

  return {
    ...base,
    empathy: hookLine + base.empathy,
  }
}

/* ═══════════════════════════════════════════════════
   ACTION SUGGESTION ENGINE
═══════════════════════════════════════════════════ */

const ACTION_TABLE: Partial<Record<EmotionType, Partial<Record<ContextTag | 'none', ActionSuggestion>>>> = {
  angry: {
    sick:         { label: '今日は家事を全部スキップしていい',               reason: '体調の日は休むが正解',     impact: 'high'   },
    sleep_dep:    { label: '今夜は1つだけ手放していい',                      reason: '全部やらなくていい',       impact: 'high'   },
    chore_burden: { label: '「これだけ代わってほしい」を1つ決めておいていい', reason: '1つ伝えるだけでいい',     impact: 'medium' },
    isolated:     { label: '今日は「5分だけ話せる？」とだけ聞いていい',       reason: '入口だけ開ければいい',   impact: 'medium' },
    relationship: { label: '「気づいてほしかった」の一言だけ伝えていい',     reason: '責めなくていい',           impact: 'medium' },
    work_stress:  { label: '今日だけ、仕事の通知を1時間切っていい',          reason: '1時間だけでいい',         impact: 'medium' },
    child_care:   { label: '子どもが落ち着いたら3分だけ別室に移動していい',  reason: '離れる時間があっていい',   impact: 'low'    },
    none:         { label: '返信や返答を少し後回しにしていい',               reason: '今すぐ解決しなくていい',   impact: 'low'    },
  },
  sad: {
    sick:         { label: '今日の予定を1つキャンセルしていい',          reason: '予定を守らなくていい',  impact: 'high'   },
    sleep_dep:    { label: '今夜は30分早く横になっていい',               reason: 'それだけでいい',        impact: 'medium' },
    isolated:     { label: '「さみしかった」の一言だけ誰かに送っていい', reason: 'それだけで十分',        impact: 'high'   },
    relationship: { label: '「最近しんどかった」の一言だけ伝えていい',   reason: '全部説明しなくていい',  impact: 'medium' },
    none:         { label: '今日は「やる気が出ない」を責めなくていい',   reason: 'そういう日があっていい',  impact: 'low'    },
  },
  tired: {
    sick:         { label: '今夜の夕食を作らなくていい',                 reason: '今日はスキップでいい',   impact: 'high'   },
    sleep_dep:    { label: '今日の昼間に15分だけ横になっていい',         reason: '15分だけでいい',         impact: 'high'   },
    chore_burden: { label: '今日の家事を1つスキップしていい',            reason: '全部やらなくていい',     impact: 'medium' },
    work_stress:  { label: '今日の仕事はここで終わりにしていい',         reason: '反省は明日でいい',       impact: 'low'    },
    child_care:   { label: '「今夜30分だけ代わってほしい」と伝えていい', reason: '一人でやらなくていい',   impact: 'high'   },
    none:         { label: '今夜はスマホを置いて早めに横になっていい',   reason: 'それだけでいい',         impact: 'medium' },
  },
  anxious: {
    sick:        { label: '今日は「体を治す」だけでいい',               reason: '他は後回しでいい',       impact: 'high'   },
    work_stress: { label: '今一番気になってることを1行だけメモしていい', reason: '外に出すだけでいい',     impact: 'medium' },
    financial:   { label: '今月の支出を1項目だけ確認すればいい',        reason: '1つだけ見ればいい',      impact: 'medium' },
    child_care:  { label: '今日の育児は「これだけできれば十分」でいい', reason: '完璧にしなくていい',     impact: 'medium' },
    none:        { label: '今一番気になってることを声に出すだけでいい', reason: '声に出すだけでいい',     impact: 'low'    },
  },
  calm: {
    none: { label: 'パートナーに「ありがとう」を伝える', impact: 'high' },
  },
  lonely: {
    sleep_dep:    { label: '夜中に起きたとき「起きてる」とだけ送っていい',   reason: '一言だけでいい',       impact: 'low'    },
    isolated:     { label: '「最近一人でやりすぎてた」の一言だけ伝えていい', reason: '全部説明しなくていい', impact: 'high'   },
    relationship: { label: '「さみしかった」の一言だけ伝えていい',           reason: 'それだけで届く',       impact: 'high'   },
    child_care:   { label: '今日は自分のために5分使っていい',               reason: '自分の時間があっていい', impact: 'medium' },
    none:         { label: '「さみしかった」を一言だけ誰かに伝えていい',     reason: '言葉にするだけでいい', impact: 'medium' },
  },
}

const ACTION_FALLBACK: Record<EmotionType, ActionSuggestion> = {
  calm:    { label: '今日の余裕を誰かと共有する',                          impact: 'medium' },
  angry:   { label: 'まず5分だけ一人になる',                              impact: 'high'   },
  sad:     { label: '今日は「やらない」を1つだけ選んでみる',               impact: 'low'    },
  tired:   { label: '今夜、いつもより30分早く休んでみる',                  impact: 'medium' },
  anxious: { label: '気になっていることを紙に1行だけ書き出してみる',       impact: 'medium' },
  lonely:  { label: '「さみしかった」の一言だけ、誰かに伝えてみる',        impact: 'medium' },
}

async function generateActionSuggestion(
  emotion: EmotionType,
  note: string | null,
  backgroundTags: string[] = [],
): Promise<ActionSuggestion> {
  const safeNote = (note ?? '').trim()

  const has = (tag: string) => backgroundTags.includes(tag)
  const includesAny = (patterns: RegExp[]) => patterns.some(re => re.test(safeNote))

  const primary = pickPrimaryContext(emotion, safeNote, backgroundTags)
  const [ctx1, ctx2] = extractContexts(safeNote)

  const base =
    ACTION_TABLE[emotion]?.[primary] ??
    ACTION_TABLE[emotion]?.[ctx1] ??
    (ctx2 ? ACTION_TABLE[emotion]?.[ctx2] : undefined) ??
    ACTION_TABLE[emotion]?.['none'] ??
    ACTION_FALLBACK[emotion]

  const isSleepIssue =
    has('sleep_dep') || includesAny([/寝不足/, /眠れ/, /寝れてない/, /寝れない/, /夜泣き/])

  const isChildCareIssue =
    has('child_care') || includesAny([/育児/, /授乳/, /ミルク/, /寝かしつけ/, /保育園/, /送迎/, /お迎え/])

  const isHouseworkIssue =
    has('chore_burden') || includesAny([/洗濯/, /片付け/, /皿洗い/, /食器/, /掃除/, /夕飯/, /ご飯/, /食事/])

  const isRelationshipIssue =
    has('relationship') || includesAny([/わかってくれ/, /伝わら/, /言えな/, /すれ違/, /冷た/, /無視/])

  const isStrongState =
    includesAny([/限界/, /いっぱいいっぱい/, /もう無理/, /しんどすぎ/, /きつい/])

  const inferTaskFromNote = (): string | null => {
    if (/洗濯/.test(safeNote)) return '洗濯'
    if (/片付け|皿洗い|食器/.test(safeNote)) return '片付けか洗い物'
    if (/夕飯|ご飯|食事/.test(safeNote)) return '食事まわり'
    if (/風呂|お風呂|沐浴/.test(safeNote)) return 'お風呂まわり'
    if (/寝かしつけ/.test(safeNote)) return '寝かしつけ'
    if (/送迎|お迎え|保育園/.test(safeNote)) return '送迎'
    return null
  }

  const task = inferTaskFromNote()

  // ===== lonely =====
  if (emotion === 'lonely') {
    if (isRelationshipIssue) {
      return {
        label: '5分だけ気持ちをつなぐ',
        reason: '全部を説明しようとせず、「少しだけ聞いてほしい」と短く伝えるだけでも十分。',
        impact: 'high',
      }
    }

    if (isChildCareIssue || isSleepIssue) {
      return {
        label: '助けてほしいことを1つに絞る',
        reason: '全部を分かってもらうより、1つだけ頼む方が伝わりやすい。',
        impact: 'high',
      }
    }
  }

  // ===== tired =====
  if (emotion === 'tired') {
    if (task) {
      return {
        label: `${task}を手放す`,
        reason: `今日は全部やろうとせず、${task}だけでも代わってもらう前提で考えると少し楽になる。`,
        impact: 'high',
      }
    }

    if (isSleepIssue && isChildCareIssue) {
      return {
        label: '今夜の負担を1つ減らす',
        reason: '寝不足と育児が重なる日は、頑張るより先に減らすことが回復につながる。',
        impact: 'high',
      }
    }

    if (isHouseworkIssue) {
      return {
        label: '家事を1つやめる',
        reason: '完璧に回すより、今日はやらないことを決める方が負担は軽くなる。',
        impact: 'medium',
      }
    }
  }

  // ===== angry =====
  if (emotion === 'angry') {
    if (isRelationshipIssue) {
      return {
        label: '本音を1つだけ言う',
        reason: '責める前に「どうしてほしかったか」だけを伝える方が関係は崩れにくい。',
        impact: 'high',
      }
    }

    if (isStrongState || isChildCareIssue || isHouseworkIssue) {
      return {
        label: '今は結論を出さない',
        reason: '余裕がない状態で話し合うと悪化しやすい。まず負担を減らすのが先。',
        impact: 'high',
      }
    }
  }

  // ===== sad =====
  if (emotion === 'sad') {
    if (isRelationshipIssue) {
      return {
        label: 'しんどさだけ共有する',
        reason: '理由を全部説明しなくても、「少ししんどい」と伝えるだけで十分伝わる。',
        impact: 'medium',
      }
    }

    if (isSleepIssue || isStrongState) {
      return {
        label: '今日は立て直しを優先する',
        reason: '気持ちより先に体力を戻すことが、結果的に回復につながる。',
        impact: 'medium',
      }
    }
  }

  // ===== anxious =====
  if (emotion === 'anxious') {
    if (isRelationshipIssue) {
      return {
        label: 'お願いを1つに絞る',
        reason: '長く伝えるほど不安は強くなるので、1つだけにすると伝えやすい。',
        impact: 'medium',
      }
    }

    if (isStrongState) {
      return {
        label: '今日決めなくていいことを分ける',
        reason: '全部を今決めようとせず、後回しにできるものを分けるだけでも楽になる。',
        impact: 'low',
      }
    }
  }

  return base
}

/* ═══════════════════════════════════════════════════
   ALT SUGGESTIONS
═══════════════════════════════════════════════════ */

function generateAltSuggestions(emotion: EmotionType): ActionSuggestion[] {
  const map: Record<EmotionType, ActionSuggestion[]> = {
    calm: [
      { label: 'パートナーに「ありがとう」を伝える', impact: 'medium' },
      { label: '今日の余裕を使って少し話す',         impact: 'high'   },
    ],
    angry: [
      { label: '5分だけ一人になる',            impact: 'medium' },
      { label: '「今少し余裕ない」と短く伝える', impact: 'high'   },
    ],
    sad: [
      { label: '今日は休む許可を自分に出す',     impact: 'medium' },
      { label: '「少ししんどい」の一言だけ伝える', impact: 'high'  },
    ],
    tired: [
      { label: '今夜だけ早く寝る',              impact: 'medium' },
      { label: '家事を1つだけ飛ばす',            impact: 'low'    },
    ],
    anxious: [
      { label: '心配事を紙に1行書き出す',         impact: 'low'    },
      { label: '今日決めなくていいことを分ける',   impact: 'medium' },
    ],
    lonely: [
      { label: '今日5分だけ自分のための時間をつくる', impact: 'low' },
      { label: '「さみしかった」の一言だけ伝える',    impact: 'high' },
    ],
  }
  return map[emotion] ?? []
}

/* ═══════════════════════════════════════════════════
   SHARE PLAN GENERATOR
═══════════════════════════════════════════════════ */

async function generateSharePlan(
  emotion: EmotionType,
  note: string | null,
  backgroundTags: string[] = [],
): Promise<SharePlan> {
  await new Promise(r => setTimeout(r, 250))
  const primary = pickPrimaryContext(emotion, note, backgroundTags)
  const has = (tag: string) => backgroundTags.includes(tag)

  if (primary === 'sick')
    return { options: [makeShareOption('rest_time'), makeShareOption('take_one_task'), makeShareOption('listen_5m')], recommendedId: 'rest_time' }
  if (primary === 'sleep_dep')
    return { options: [makeShareOption('swap_tonight'), makeShareOption('rest_time'), makeShareOption('leave_me_alone')], recommendedId: 'swap_tonight' }
  if (primary === 'isolated' || primary === 'relationship')
    return { options: [makeShareOption('listen_10m'), makeShareOption('notice_me'), makeShareOption('leave_me_alone')], recommendedId: (emotion === 'lonely' || emotion === 'sad') ? 'notice_me' : 'listen_10m' }
  if (primary === 'work_stress')
    return { options: [makeShareOption('quiet_time'), makeShareOption('one_help'), makeShareOption('listen_10m')], recommendedId: emotion === 'anxious' ? 'quiet_time' : 'one_help' }
  if (primary === 'child_care' || has('child_care')) {
    if (emotion === 'tired' || has('sleep_dep'))
      return { options: [makeShareOption('swap_tonight'), makeShareOption('rest_time'), makeShareOption('take_one_task')], recommendedId: 'swap_tonight' }
    return { options: [makeShareOption('take_one_task'), makeShareOption('listen_10m'), makeShareOption('leave_me_alone')], recommendedId: 'take_one_task' }
  }
  if (primary === 'chore_burden' || has('chore_burden'))
    return { options: [makeShareOption('take_one_task'), makeShareOption('one_help'), makeShareOption('leave_me_alone')], recommendedId: 'take_one_task' }
  if (emotion === 'calm')
    return { options: [makeShareOption('listen_10m'), makeShareOption('notice_me'), makeShareOption('one_help')], recommendedId: 'listen_10m' }
  if (emotion === 'lonely')
    return { options: [makeShareOption('notice_me'), makeShareOption('listen_10m'), makeShareOption('leave_me_alone')], recommendedId: 'notice_me' }
  if (emotion === 'anxious')
    return { options: [makeShareOption('quiet_time'), makeShareOption('listen_10m'), makeShareOption('one_help')], recommendedId: 'quiet_time' }
  return { options: [makeShareOption('listen_10m'), makeShareOption('one_help'), makeShareOption('leave_me_alone')], recommendedId: 'listen_10m' }
}

/* ═══════════════════════════════════════════════════
   SHARE TRANSLATION GENERATOR
═══════════════════════════════════════════════════ */
async function translateForPartner(
  emotion: EmotionType,
  note: string | null,
  selectedOption: ShareOption,
  backgroundTags: string[] = [],
  tone: 'soft' | 'normal' | 'direct' = 'normal',
): Promise<TranslatedShare> {
  await new Promise(r => setTimeout(r, 180))

  const primary = pickPrimaryContext(emotion, note, backgroundTags)
  const safeNote = (note ?? '').trim()

  const has = (tag: string) => backgroundTags.includes(tag)
  const includesAny = (patterns: RegExp[]) => patterns.some(re => re.test(safeNote))

  const isSleepIssue =
    primary === 'sleep_dep' ||
    has('sleep_dep') ||
    includesAny([/寝不足/, /眠れ/, /寝れてない/, /寝れない/, /夜泣き/])

  const isChildCareIssue =
    primary === 'child_care' ||
    has('child_care') ||
    includesAny([/育児/, /授乳/, /ミルク/, /寝かしつけ/, /保育園/, /送迎/, /お迎え/])

  const isHouseworkIssue =
    primary === 'chore_burden' ||
    has('chore_burden') ||
    includesAny([/洗濯/, /片付け/, /皿洗い/, /食器/, /掃除/, /夕飯/, /ご飯/, /食事/])

  const isRelationshipIssue =
    primary === 'relationship' ||
    has('relationship') ||
    includesAny([/わかってくれ/, /伝わら/, /言えな/, /すれ違/, /冷た/, /無視/, /気づいて/])

  const isStrongState =
    includesAny([/限界/, /いっぱいいっぱい/, /もう無理/, /しんどすぎ/, /きつい/])

  const openerOptions = (() => {
    if (emotion === 'angry') {
      if (isHouseworkIssue) {
        return [
          'ちょっと余裕なくなってるかも。',
          '今日は少しピリピリしてるかも。',
          'ちょっと抱え込みすぎてるかも。',
        ]
      }
      if (isRelationshipIssue) {
        return [
          'うまく伝わってない感じがしてる。',
          '少しモヤモヤがたまってるかも。',
          '今日はちょっとしんどい気持ちが強めかも。',
        ]
      }
      return [
        'ちょっと余裕ないかも。',
        '今日は少ししんどいかも。',
        '今ちょっといっぱいいっぱいかも。',
      ]
    }

    if (emotion === 'sad') {
      if (isRelationshipIssue) {
        return [
          'ちょっと気持ちが沈みぎみかも。',
          '少しさみしい気持ちがあるかも。',
          '今日は少ししんどい気分かも。',
        ]
      }
      return [
        'ちょっと気持ちが落ちぎみかも。',
        '今日は少ししんどいかも。',
        'ちょっと余裕が少ないかも。',
      ]
    }

    if (emotion === 'tired') {
      if (isSleepIssue) {
        return [
          '寝不足でちょっと余裕ないかも。',
          '今日はかなり疲れぎみかも。',
          '少ししんどさがたまってるかも。',
        ]
      }
      if (isChildCareIssue) {
        return [
          '今日は育児でちょっと余裕ないかも。',
          '少し疲れがたまってるかも。',
          '今ちょっと手が回りにくいかも。',
        ]
      }
      return [
        '今日はちょっと余裕ないかも。',
        '少し疲れがたまってるかも。',
        '今ちょっとしんどいかも。',
      ]
    }

    if (emotion === 'anxious') {
      return [
        'ちょっと落ち着かないかも。',
        '少し不安が強めかも。',
        '今日はちょっと余裕ないかも。',
      ]
    }

    if (emotion === 'lonely') {
      if (isRelationshipIssue) {
        return [
          'ちょっと気づいてほしい気持ちがあるかも。',
          '少しひとりで抱えてる感じがあるかも。',
          '今日はちょっとさみしい気持ちかも。',
        ]
      }
      return [
        '少しひとりで抱えてる感じかも。',
        'ちょっとさみしい気持ちがあるかも。',
        '今日は少し余裕が少ないかも。',
      ]
    }

    return [
      'ちょっと余裕ないかも。',
      '今日は少ししんどいかも。',
      '今ちょっと手いっぱいかも。',
    ]
  })()

  const askOptions = (() => {
    switch (selectedOption.id) {
      case 'swap_tonight':
        return [
          '今夜少し代わってもらえると助かる。',
          '今夜だけ少しお願いできると助かる。',
          '今日は少し代わってもらえるとありがたい。',
        ]

      case 'take_one_task':
        if (isHouseworkIssue) {
          return [
            '家のことをひとつだけお願いできると助かる。',
            'ひとつだけ代わってもらえると助かる。',
            '少しだけ手を貸してもらえるとありがたい。',
          ]
        }
        return [
          'ひとつだけお願いできると助かる。',
          '少しだけ手を貸してもらえると助かる。',
          '一つだけお願いしてもいい？',
        ]

      case 'one_help':
        return [
          '少しだけ手を貸してもらえると助かる。',
          '少しだけ助けてもらえるとありがたい。',
          'ひとつだけ手伝ってもらえると助かる。',
        ]

      case 'listen_10m':
        return [
          '少しだけ聞いてもらえると助かる。',
          '少し話を聞いてもらえると嬉しい。',
          '10分だけ聞いてもらえると助かる。',
        ]

      case 'listen_5m':
        return [
          '少しだけ聞いてもらえると助かる。',
          '5分だけ話せると少し楽かも。',
          '少しだけ話を聞いてほしい。',
        ]

      case 'notice_me':
        return [
          '少し気にかけてもらえると嬉しい。',
          'ちょっと気づいてもらえると助かる。',
          '少しだけ気にしてもらえると嬉しい。',
        ]

      case 'quiet_time':
        return [
          '少し静かに過ごす時間をもらえると助かる。',
          '少しひとりになる時間があると助かる。',
          '少し落ち着く時間をもらえるとありがたい。',
        ]

      case 'rest_time':
        return [
          '少し休む時間をもらえると助かる。',
          '少し横になる時間があるとありがたい。',
          '少し休ませてもらえると助かる。',
        ]

      case 'leave_me_alone':
        return [
          '今日は少しそっとしておいてもらえると助かる。',
          '今は少しひとりで落ち着きたいかも。',
          '少しだけ静かにさせてもらえると助かる。',
        ]

      default:
        return [
          '少しだけ助けてもらえると助かる。',
          '少しだけ手を貸してもらえると嬉しい。',
          '今は少しサポートしてもらえると助かる。',
        ]
    }
  })()

  const closerOptions =
    emotion === 'angry' && isStrongState
      ? ['責めたいわけじゃないよ。', '', '']
      : emotion === 'lonely'
      ? ['うまく言えないけど、そんな感じ。', '重く受け取らなくて大丈夫。', 'それだけ伝えたかった。']
      : ['', '', '無理のない範囲で大丈夫。']

const options = pick3([
  `${openerOptions[0]} ${askOptions[0]} ${closerOptions[0]}`.trim(),
  `${openerOptions[1] ?? openerOptions[0]} ${askOptions[1] ?? askOptions[0]} ${closerOptions[1] ?? ''}`.trim(),
  `${openerOptions[2] ?? openerOptions[0]} ${askOptions[2] ?? askOptions[0]} ${closerOptions[2] ?? ''}`.trim(),
]).map(v => v.replace(/\s+/g, ' ').trim())

// 👇 ここ追加（これが元の文章）
let message = options[0] ?? ''

// 👇 トーン変換関数
const soften = (text: string) => {
  let t = text

  t = t.replace(/^/, 'ちょっと、')
  t = t.replace(/少し静かに過ごす時間をもらえると助かる/g, '少し静かに過ごせると助かるかも')
  t = t.replace(/少しひとりになる時間があると助かる/g, '少しひとりになれると助かるかも')
  t = t.replace(/少し落ち着く時間をもらえるとありがたい/g, '少し落ち着けると嬉しいかも')
  t = t.replace(/少し休む時間をもらえると助かる/g, '少し休めると助かるかも')
  t = t.replace(/少し横になる時間があるとありがたい/g, '少し横になれたら嬉しいかも')
  t = t.replace(/少し休ませてもらえると助かる/g, '少し休めると助かるかも')
  t = t.replace(/少しだけ聞いてもらえると助かる/g, '少しだけ聞いてもらえたら嬉しい')
  t = t.replace(/少し話を聞いてもらえると嬉しい/g, '少し話を聞いてもらえたら嬉しい')
  t = t.replace(/10分だけ聞いてもらえると助かる/g, '10分だけ聞いてもらえたら嬉しい')
  t = t.replace(/少し気にかけてもらえると嬉しい/g, '少し気にしてもらえたら嬉しい')
  t = t.replace(/ちょっと気づいてもらえると助かる/g, 'ちょっと気づいてもらえたら嬉しい')
  t = t.replace(/少しだけ気にしてもらえると嬉しい/g, '少しだけ気にしてもらえたら嬉しい')
  t = t.replace(/今夜少し代わってもらえると助かる/g, 'もし大丈夫そうなら、今夜少し代わってもらえると嬉しい')
  t = t.replace(/今夜だけ少しお願いできると助かる/g, 'もし大丈夫そうなら、今夜だけ少しお願いできると嬉しい')
  t = t.replace(/今日は少し代わってもらえるとありがたい/g, '今日は少し代わってもらえたら嬉しい')
  t = t.replace(/ひとつだけお願いできると助かる/g, 'もしよければ、ひとつだけお願いできると嬉しい')
  t = t.replace(/少しだけ手を貸してもらえると助かる/g, '少しだけ手を貸してもらえたら嬉しい')
  t = t.replace(/少しだけ助けてもらえるとありがたい/g, '少しだけ助けてもらえたら嬉しい')
  t = t.replace(/ひとつだけ手伝ってもらえると助かる/g, 'ひとつだけ手伝ってもらえたら嬉しい')

  if (!t.endsWith('🙏')) t += '🙏'
  return t
}

const directify = (text: string) => {
  let t = text

  t = t.replace(/ちょっと/g, '')
  t = t.replace(/少し/g, '')
  t = t.replace(/かも/g, '')
  t = t.replace(/もし大丈夫そうなら、/g, '')
  t = t.replace(/もらえると助かる/g, 'ほしい')
  t = t.replace(/もらえると嬉しい/g, 'ほしい')
  t = t.replace(/もらえたら嬉しい/g, 'ほしい')
  t = t.replace(/お願いできると助かる/g, 'お願いしたい')
  t = t.replace(/お願いできると嬉しい/g, 'お願いしたい')
  t = t.replace(/過ごせると助かるかも/g, '過ごす時間がほしい')
  t = t.replace(/ひとりになれると助かるかも/g, 'ひとりになる時間がほしい')
  t = t.replace(/落ち着けると嬉しいかも/g, '落ち着く時間がほしい')
  t = t.replace(/休めると助かるかも/g, '休みたい')
  t = t.replace(/横になれたら嬉しいかも/g, '横になりたい')
  t = t.replace(/聞いてもらえたら嬉しい/g, '聞いてほしい')
  t = t.replace(/気にしてもらえたら嬉しい/g, '気にしてほしい')
  t = t.replace(/気づいてもらえたら嬉しい/g, '気づいてほしい')
  t = t.replace(/代わってもらえると嬉しい/g, '代わってほしい')
  t = t.replace(/手を貸してもらえたら嬉しい/g, '手を貸してほしい')
  t = t.replace(/助けてもらえたら嬉しい/g, '助けてほしい')
  t = t.replace(/手伝ってもらえたら嬉しい/g, '手伝ってほしい')

  return t
}
// 👇 tone適用
let finalMessage = message

if (tone === 'soft') {
  finalMessage = soften(message)
} else if (tone === 'direct') {
  finalMessage = directify(message)
}

// 👇 returnは1回だけ
return {
  message: finalMessage,
  sourceTags: backgroundTags,
  selectedOptionId: selectedOption.id,
  tone,
}
}
function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.map(v => v.trim()).filter(Boolean)))
}

function pick3(arr: string[]) {
  return dedupeStrings(arr).slice(0, 3)
}

/* ═══════════════════════════════════════════════════
   LONELY GENERATORS
═══════════════════════════════════════════════════ */

function generateLonelyAiResponse(tag: LonelyTag | null): AiResponse {
  type LonelyEntry = { empathy: string; short: string }
  const empathyMap: Record<LonelyTag, LonelyEntry> = {
    not_noticed:   { empathy: '気づいてほしい気持ち、あるよね。',       short: '気づいてほしい感じ。' },
    less_talk:     { empathy: 'ちょっとさみしくなってるのかも。',       short: 'ちょっとさみしかったのかも。' },
    carry_alone:   { empathy: 'ひとりで抱えてる感じ、あるよね。',       short: 'ひとりで抱えてる感じ。' },
    feel_distance: { empathy: '距離を感じてるのかも。',                 short: '距離を感じてるのかも。' },
    hard_to_ask:   { empathy: '頼りづらい感じ、あるよね。',             short: '頼りづらい感じ。' },
    seems_busy:    { empathy: '言い出しにくい感じ、あるよね。',         short: '言い出しにくかったのかも。' },
    not_fulfilled: { empathy: 'なんとなく満たされない感じ、あるかも。', short: 'なんとなく満たされない感じ。' },
  }
  const found = tag ? empathyMap[tag] : null
  return {
    empathy: found?.empathy ?? 'ひとりで抱えてる感じ、あるよね。',
    short:   found?.short   ?? 'ひとりで抱えてる感じ。',
    interpretation: '',
    nextStep: '',
  }
}

function generateLonelyActionSuggestion(tag: LonelyTag | null): ActionSuggestion {
  const actionMap: Record<LonelyTag, ActionSuggestion> = {
    not_noticed:   { label: '「気づいてほしかった」の一言だけ伝えていい',   reason: '責めなくていい' },
    less_talk:     { label: '5分だけ話せる時間を作っていい',               reason: '入口だけ開ければいい' },
    carry_alone:   { label: '助けてほしいことを1つに絞って伝えていい',      reason: '1つだけでいい' },
    feel_distance: { label: '「少し話せる？」とだけ聞いていい',             reason: '入口だけでいい' },
    hard_to_ask:   { label: '「一個だけお願いしていい？」と聞いていい',     reason: '言い方は完璧じゃなくていい' },
    seems_busy:    { label: '「少しだけ聞いてほしい」と送っていい',         reason: '余裕を待たなくていい' },
    not_fulfilled: { label: '「さみしい」の一言だけ伝えていい',             reason: '理由を言わなくていい' },
  }
  return tag
    ? actionMap[tag]
    : { label: '「さみしかった」の一言だけ誰かに伝えていい', reason: '言葉にするだけでいい' }
}

function generateLonelySharePlan(tag: LonelyTag | null): SharePlan {
  // ShareOptionId インライン（makeShareOption依存なし）
  const opt = (id: ShareOptionId, label: string): ShareOption => ({ id, label })
  const notice  = opt('notice_me',  '今つらいことに少し気づいてほしい')
  const listen5 = opt('listen_5m',  '5分だけ様子を聞いてほしい')
  const listen10 = opt('listen_10m', '10分だけ話を聞いてほしい')
  const oneHelp  = opt('one_help',   '今日だけ1つ助けてほしい')
  const quiet    = opt('quiet_time', '少し一人になる時間がほしい')

  switch (tag) {
    case 'not_noticed':
    case 'feel_distance':
      return { options: [notice, listen5, listen10], recommendedId: 'notice_me' }
    case 'less_talk':
    case 'seems_busy':
      return { options: [listen5, listen10, notice], recommendedId: 'listen_5m' }
    case 'carry_alone':
    case 'hard_to_ask':
      return { options: [listen10, oneHelp, notice], recommendedId: 'listen_10m' }
    case 'not_fulfilled':
      return { options: [notice, listen5, quiet], recommendedId: 'notice_me' }
    default:
      return { options: [notice, listen5, listen10], recommendedId: 'notice_me' }
  }
}

async function translateLonelyForPartner(
  tag: LonelyTag | null,
  selectedOption: ShareOption,
  tone: 'soft' | 'normal' | 'direct' = 'normal',
): Promise<TranslatedShare> {
  await new Promise(r => setTimeout(r, 180))

  const openerMap: Partial<Record<LonelyTag, string>> = {
    not_noticed:   'ちょっと気づいてほしい気持ちがあるかも。',
    less_talk:     '最近少し話せてなかったかも。',
    carry_alone:   '少しひとりで抱えてる感じがあるかも。',
    feel_distance: 'なんかちょっと距離を感じてたかも。',
    hard_to_ask:   '言い出しにくくてずっと抱えてたかも。',
    seems_busy:    '忙しそうで言えなかったけど。',
    not_fulfilled: 'うまく言えないけど、なんとなく満たされてない感じがあって。',
  }
  const opener = tag ? (openerMap[tag] ?? '少しひとりで抱えてる感じかも。') : '少しひとりで抱えてる感じかも。'

  const askMap: Partial<Record<ShareOptionId, string>> = {
    notice_me:     '少しだけ気にしてもらえると嬉しい。',
    listen_5m:     '5分だけ話せると少し楽かも。',
    listen_10m:    '少しだけ聞いてもらえると嬉しい。',
    leave_me_alone:'今は少しそっとしておいてほしい。',
    quiet_time:    '少しだけひとり時間があると助かる。',
    one_help:      '少しだけ助けてもらえると嬉しい。',
  }
  const ask = askMap[selectedOption.id as ShareOptionId] ?? '少しだけ聞いてもらえると嬉しい。'

  let message = `${opener} ${ask}`.trim()
  if (tone === 'soft') {
    message = `ちょっと、${opener} ${ask} 重く受け取らなくて大丈夫。`.replace(/\s+/g, ' ').trim()
  } else if (tone === 'direct') {
    message = `${opener.replace(/かも。$/, '。').replace(/くて。$/, '。')} ${ask.replace(/嬉しい。$/, 'ほしい。').replace(/助かる。$/, 'ほしい。')}`.trim()
  }

  return { message, selectedOptionId: selectedOption.id, tone }
}

/* ═══════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════ */

const isToday = (d: Date) => {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}
const relTime = (s: string) => {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}
function getTodayBackgroundTags(logs: SoloLog[]): BackgroundOptionId[] {
  const tags = new Set<BackgroundOptionId>()

  logs.forEach(log => {
    if (log.tag === 'childcare') {
      tags.add('child_care')
    }
    if (log.tag === 'housework') {
      tags.add('chore_burden')
    }
  })

  return Array.from(tags)
}

function getProfileBackgroundTags(profile: Profile | null): BackgroundOptionId[] {
  const tags = new Set<BackgroundOptionId>()

  if (!profile) return []

  if (profile.child_stage === 'newborn') {
    tags.add('child_care')
    tags.add('sleep_dep')
  } else if (profile.child_stage === 'infant') {
    tags.add('child_care')
  } else if (profile.child_stage === 'toddler') {
    tags.add('child_care')
  }

  if ((profile.my_busyness ?? 0) >= 4) {
    tags.add('chore_burden')
  }

  if (profile.my_work_status === 'fulltime') {
    tags.add('work_stress')
  }

  return Array.from(tags)
}

function mergeBackgroundTags(
  a: BackgroundOptionId[],
  b: BackgroundOptionId[]
): BackgroundOptionId[] {
  return Array.from(new Set([...a, ...b]))
}

function parseAiResponse(value: string | null): AiResponse | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<AiResponse>
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.empathy !== 'string' || typeof parsed.interpretation !== 'string' || typeof parsed.nextStep !== 'string') return null
    return { empathy: parsed.empathy, interpretation: parsed.interpretation, nextStep: parsed.nextStep }
  } catch { return null }
}

function generatePairCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 6; i += 1) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

async function ensurePairCode(
  userId: string,
  email?: string | null,
  currentPairCode?: string | null
) {
  // まず呼び出し元がすでに持っていればそれを優先
  if (currentPairCode) return currentPairCode

  // DB上の最新を確認
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('pair_code')
    .eq('id', userId)
    .maybeSingle()

  if (fetchError) {
    console.error('[ensurePairCode] fetch failed', fetchError)
    return null
  }

  // 既存コードがあれば絶対それを使う
  if (existing?.pair_code) return existing.pair_code

  // 本当に空のときだけ新規生成
  const newCode = generatePairCode()

  const { error: updateError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: email ?? null,
        pair_code: newCode,
      },
      { onConflict: 'id' }
    )

  if (updateError) {
    console.error('[ensurePairCode] upsert failed', updateError)
    return null
  }

  return newCode
}

/* ═══════════════════════════════════════════════════
   HOOKS
═══════════════════════════════════════════════════ */

function useToast() {
  const [toasts, set] = useState<Toast[]>([])
  const ctr = useRef(0)
  const push = useCallback((msg: string, emoji?: string, accent = false) => {
    const id = ctr.current++
    set(p => [...p, { id, msg, emoji, accent }])
    window.setTimeout(() => set(p => p.filter(t => t.id !== id)), 3200)
  }, [])
  return { toasts, push }
}

function useProfile(session: Session | null, toast: (m: string) => void) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [partner, setPartner] = useState<Profile | null>(null)

  const refresh = useCallback(async () => {
    if (!session?.user?.id) { setProfile(null); setPartner(null); return }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) { console.error('[useProfile.refresh] failed', error); setProfile(null); setPartner(null); return }
    const nextProfile = (data as Profile | null) ?? null
    setProfile(nextProfile)
    if (!nextProfile?.partner_id) { setPartner(null); return }
    const { data: partnerData, error: partnerError } = await supabase.from('profiles').select('*').eq('id', nextProfile.partner_id).maybeSingle()
    if (partnerError) { console.error('[useProfile.refresh partner] failed', partnerError); setPartner(null); return }
    setPartner((partnerData as Profile | null) ?? null)
  }, [session?.user?.id])

  useEffect(() => {
    setProfile(null); setPartner(null)
    if (!session?.user?.id) return
    void refresh()
  }, [session?.user?.id, refresh])

  useEffect(() => {
    const run = async () => {
      if (!session?.user?.id) return
      if (profile?.pair_code) return
      const created = await ensurePairCode(session.user.id, session.user.email, profile?.pair_code ?? null)
      if (created) await refresh()
    }
    void run()
  }, [session?.user?.id, session?.user?.email, profile?.pair_code, refresh])

  return { profile, partner, refresh }
}

function useEmotionEvents(userId: string | null) {
  const [events, setEvents] = useState<EmotionEvent[]>([])
  const [partnerEvents, setPartnerEvents] = useState<EmotionEvent[]>([])

  const saveEvent = useCallback(async (
    uid: string,
    pid: string | null,
    emotion: EmotionType,
    note: string | null,
    ai: AiResponse,
    trans: TranslatedShare,
    selectedShareOptionId: string | null,
  ): Promise<EmotionEvent | null> => {
    const payload = {
      user_id: uid,
      partner_id: pid,
      emotion_type: emotion,
      note,
      ai_response: JSON.stringify(ai),
      ai_response_short: ai.empathy,
      share_status: 'unsent' as const,
      shared_message: trans.message,
      selected_share_option_id: selectedShareOptionId,
    }

    const { data, error } = await supabase
      .from('emotion_events')
      .insert(payload)
      .select()
      .single()

    if (error || !data) {
      console.error('[saveEvent] FAILED', { error, payload })
      return null
    }

    const ev = data as EmotionEvent
    setEvents(prev => [ev, ...prev])
    return ev
  }, [])

  const fetchMy = useCallback(async (uid?: string) => {
    if (!uid) {
      console.warn('[fetchMy] missing uid')
      return
    }

    const { data, error } = await supabase
      .from('emotion_events')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[fetchMy error]', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error,
      })
      return
    }

    setEvents((data ?? []) as EmotionEvent[])
  }, [])

  const markShared = useCallback(async (eventId: string) => {
    const { error } = await supabase
      .from('emotion_events')
      .update({ share_status: 'sent' })
      .eq('id', eventId)

    if (error) {
      console.error('[markShared] FAILED', error)
      return false
    }

    setEvents(prev =>
      prev.map(e => (e.id === eventId ? { ...e, share_status: 'sent' } : e))
    )

    return true
  }, [])

  const fetchSharedToMe = useCallback(async (uid?: string) => {
    if (!uid) {
      console.warn('[fetchSharedToMe] missing uid')
      return
    }

    const { data, error } = await supabase
      .from('emotion_events')
      .select('*')
      .eq('partner_id', uid)
      .eq('share_status', 'sent')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[fetchSharedToMe error]', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error,
      })
      return
    }

    setPartnerEvents((data ?? []) as EmotionEvent[])
  }, [])

  const reactToPartnerEvent = useCallback(async (
    eventId: string,
    reaction: 'ack' | 'soon' | 'on_it'
  ): Promise<void> => {
    const target = partnerEvents.find(e => e.id === eventId)

    if (!target) {
      console.error('[reactToPartnerEvent] event not found', eventId)
      return
    }

    if (userId && target.user_id === userId) {
      console.warn('[reactToPartnerEvent] blocked self reaction', {
        eventId,
        userId,
        targetUserId: target.user_id,
      })
      return
    }

    const reactedAt = new Date().toISOString()

    const { error } = await supabase
      .from('emotion_events')
      .update({
        partner_reaction: reaction,
        partner_reacted_at: reactedAt,
      })
      .eq('id', eventId)

    if (error) {
      console.error('[reactToPartnerEvent] FAILED', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error,
      })
      return
    }

    setPartnerEvents(prev =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, partner_reaction: reaction, partner_reacted_at: reactedAt }
          : e
      )
    )

    setEvents(prev =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, partner_reaction: reaction, partner_reacted_at: reactedAt }
          : e
      )
    )
  }, [partnerEvents, userId])

  useEffect(() => {
    if (!userId) {
      setEvents([])
      setPartnerEvents([])
      return
    }

    void fetchMy(userId)
    void fetchSharedToMe(userId)
  }, [userId, fetchMy, fetchSharedToMe])

  return {
    events,
    partnerEvents,
    saveEvent,
    markShared,
    reactToPartnerEvent,
    fetchMy,
    fetchSharedToMe,
  }
}



/* ── useEmotionFlow ──────────────────────────────────────────── */

const INIT_FLOW: FlowState = {
  step: 'idle',
  emotion: null,
  note: '',
  selectedBackgroundIds: [],
  aiResponse: null,
  actionSuggestion: null,
  altSuggestions: [],
  sharePlan: null,
  selectedShareOptionId: null,
  translated: null,
  savedEventId: null,
  isShared: false,
  isLoadingAi: false,
  isSharing: false,
  recovered: false,
  isResponded: false,
  lonelyTag: null,
}

function useEmotionFlow(
  userId: string | null,
  partnerId: string | null,
  backgroundTags: BackgroundOptionId[],
  saveEvent: (
    uid: string,
    pid: string | null,
    emotion: EmotionType,
    note: string | null,
    ai: AiResponse,
    translated: TranslatedShare,
    selectedShareOptionId: string | null,
  ) => Promise<EmotionEvent | null>,
  markShared: (eventId: string) => Promise<boolean>,
  shareTone: 'soft' | 'normal' | 'direct',
) {
  const [flow, setFlow] = useState<FlowState>(INIT_FLOW)
  const savedEventIdRef = useRef<string | null>(null)

  const selectEmotion = useCallback((emotion: EmotionType) => {
    savedEventIdRef.current = null
    setFlow({ ...INIT_FLOW, step: 'composing', emotion })
  }, [])

  const setNote = useCallback((n: string) => {
    setFlow(prev => ({ ...prev, note: n }))
  }, [])

  const setBackgroundIds = useCallback((ids: BackgroundOptionId[]) => {
    setFlow(prev => ({ ...prev, selectedBackgroundIds: ids }))
  }, [])

  const setLonelyTag = useCallback((tag: LonelyTag | null) => {
    setFlow(prev => ({ ...prev, lonelyTag: tag }))
  }, [])

  const selectShareOption = useCallback((optionId: string) => {
    setFlow(prev => ({ ...prev, selectedShareOptionId: optionId }))
  }, [])

  const submit = useCallback(async () => {
    if (!flow.emotion || !userId) return

    setFlow(prev => ({ ...prev, step: 'responding', isLoadingAi: true }))

    const isLonelyFlow = flow.emotion === 'lonely'

    let ai: AiResponse
    let action: ActionSuggestion
    let sharePlan: SharePlan

    if (isLonelyFlow) {
      ai = generateLonelyAiResponse(flow.lonelyTag)
      action = generateLonelyActionSuggestion(flow.lonelyTag)
      sharePlan = generateLonelySharePlan(flow.lonelyTag)
    } else {
      const mergedTags =
        flow.selectedBackgroundIds.length > 0
          ? flow.selectedBackgroundIds
          : backgroundTags
      ;[ai, action, sharePlan] = await Promise.all([
        Promise.resolve(generateAiResponse(flow.emotion, flow.note || null, mergedTags)),
        generateActionSuggestion(flow.emotion, flow.note || null, mergedTags),
        generateSharePlan(flow.emotion, flow.note || null, mergedTags),
      ])
    }

    const altSuggestions = generateAltSuggestions(flow.emotion)

    const selectedShareOptionId = sharePlan.recommendedId
    const selectedOption =
      sharePlan.options.find(o => o.id === selectedShareOptionId) ??
      sharePlan.options[0]

    const translated = isLonelyFlow
      ? await translateLonelyForPartner(flow.lonelyTag, selectedOption, shareTone)
      : await translateForPartner(
          flow.emotion,
          flow.note || null,
          selectedOption,
          flow.selectedBackgroundIds.length > 0 ? flow.selectedBackgroundIds : backgroundTags,
          shareTone,
        )

    const saved = await saveEvent(
      userId,
      partnerId,
      flow.emotion,
      flow.note || null,
      ai,
      translated,
      selectedShareOptionId,
    )

    savedEventIdRef.current = saved?.id ?? null

    await new Promise(r => setTimeout(r, 700))

    setFlow(prev => ({
      ...prev,
      step: 'done',
      aiResponse: ai,
      actionSuggestion: action,
      altSuggestions,
      sharePlan,
      selectedShareOptionId,
      translated,
      savedEventId: saved?.id ?? null,
      isLoadingAi: false,
      isShared: saved?.share_status === 'sent',
    }))
  }, [
    flow.emotion,
    flow.note,
    flow.lonelyTag,
    flow.selectedBackgroundIds,
    userId,
    partnerId,
    backgroundTags,
    saveEvent,
    shareTone,
  ])

  const regenerateTranslatedMessage = useCallback(async () => {
    if (!flow.emotion || !flow.sharePlan || !flow.selectedShareOptionId) return

    const selectedOption = flow.sharePlan.options.find(
      o => o.id === flow.selectedShareOptionId
    )
    if (!selectedOption) return

    let translated: TranslatedShare
    if (flow.emotion === 'lonely') {
      translated = await translateLonelyForPartner(flow.lonelyTag, selectedOption, shareTone)
    } else {
      const mergedTags =
        flow.selectedBackgroundIds.length > 0
          ? flow.selectedBackgroundIds
          : backgroundTags
      translated = await translateForPartner(
        flow.emotion,
        flow.note || null,
        selectedOption,
        mergedTags,
        shareTone,
      )
    }

    setFlow(prev => {
      if (prev.translated?.message === translated.message) return prev
      return { ...prev, translated }
    })
  }, [
    flow.emotion,
    flow.note,
    flow.lonelyTag,
    flow.sharePlan,
    flow.selectedShareOptionId,
    flow.selectedBackgroundIds,
    backgroundTags,
    shareTone,
  ])

  useEffect(() => {
    void regenerateTranslatedMessage()
  }, [regenerateTranslatedMessage])

  const shareWithPartner = useCallback(async () => {
    const eventId = savedEventIdRef.current ?? flow.savedEventId

    if (!eventId) return
    if (flow.isShared) return

    setFlow(prev => ({ ...prev, isSharing: true }))

    const ok = await markShared(eventId)

    if (!ok) {
      setFlow(prev => ({ ...prev, isSharing: false }))
      return
    }

    setFlow(prev => ({
      ...prev,
      isSharing: false,
      isShared: true,
    }))
  }, [flow.savedEventId, flow.isShared, markShared])

  const markRecovered = useCallback(() => {
    setFlow(prev => ({ ...prev, recovered: true }))
  }, [])

  const reset = useCallback(() => {
    savedEventIdRef.current = null
    setFlow(INIT_FLOW)
  }, [])

  const goBack = useCallback(() => {
    setFlow(prev => prev.step === 'composing' ? { ...prev, step: 'idle' } : prev)
  }, [])

  return {
    flow,
    setFlow,
    savedEventIdRef,
    selectEmotion,
    setNote,
    setBackgroundIds,
    setLonelyTag,
    submit,
    reset,
    markRecovered,
    selectShareOption,
    regenerateTranslatedMessage,
    shareWithPartner,
    goBack,
  }
}

/* ═══════════════════════════════════════════════════
   SHARE OPTION HELPERS
═══════════════════════════════════════════════════ */

const SHARE_OPTION_LABELS: Record<ShareOptionId, string> = {
  swap_tonight:   '今夜だけ少し代わってほしい',
  listen_10m:     '10分だけ話を聞いてほしい',
  leave_me_alone: '今日はそっとしておいてほしい',
  take_one_task:  '家のことを1つ代わってほしい',
  rest_time:      '少し休む時間をもらいたい',
  listen_5m:      '5分だけ様子を聞いてほしい',
  one_help:       '今日だけ1つ助けてほしい',
  quiet_time:     '少し一人になる時間がほしい',
  notice_me:      '今つらいことに少し気づいてほしい',
}

function makeShareOption(id: ShareOptionId): ShareOption { return { id, label: SHARE_OPTION_LABELS[id] } }
function getShareOptionLabel(optionId: ShareOptionId | string | null | undefined): string | null {
  if (!optionId) return null
  return SHARE_OPTION_LABELS[optionId as ShareOptionId] ?? null
}

function buildPartnerSupportHint(optionId: ShareOptionId | null): string {
  switch (optionId) {
    case 'swap_tonight':   return '今夜30分だけ代わる'
    case 'take_one_task':  return '家のことを1つ代わる'
    case 'listen_10m':     return '10分だけ話を聞く'
    case 'listen_5m':      return '5分だけ気にかける'
    case 'notice_me':      return '少し気にかける'
    case 'leave_me_alone': return '今日はそっとしておく'
    case 'rest_time':      return '少し休む時間をつくる'
    case 'one_help':       return '今日だけ少し助ける'
    case 'quiet_time':     return '10分だけ一人時間をつくる'
    default:               return '今できる助け方を考える'
  }
}

function getReactionLabel(reaction: 'ack' | 'soon' | 'on_it' | null): string | null {
  switch (reaction) {
    case 'ack':   return '了解'
    case 'soon':  return 'あとで行くね'
    case 'on_it': return 'やるよ'
    default: return null
  }
}

function getPartnerReactionText(reaction: 'ack' | 'soon' | 'on_it' | null): string | null {
  switch (reaction) {
    case 'ack':   return '了解が返ってきた'
    case 'soon':  return 'あとで行くねが返ってきた'
    case 'on_it': return 'やるよが返ってきた'
    default: return null
  }
}

/* ═══════════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════════ */


function ShareOptionSelector({ plan, selectedId, onSelect }: { plan: SharePlan; selectedId: string | null; onSelect: (id: string) => void }) {
  // Put recommended first
  const orderedOptions = useMemo(() => {
    const rec = plan.options.find(o => o.id === plan.recommendedId)
    const rest = plan.options.filter(o => o.id !== plan.recommendedId)
    return rec ? [rec, ...rest] : plan.options
  }, [plan])

  const [idx, setIdx] = useState(0)
  const current = orderedOptions[idx] ?? orderedOptions[0]
  const isSelected = current?.id === selectedId

  // Auto-select recommended on mount
  useEffect(() => {
    if (!selectedId && plan.recommendedId) {
      onSelect(plan.recommendedId)
    }
  }, [])

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100/80" style={{ animation: 'fadeUp .45s ease-out .06s both' }}>
      <div className="border-b border-emerald-50 px-5 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/60">してほしいこと</p>
          {orderedOptions.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIdx(i => Math.max(0, i - 1)); onSelect(orderedOptions[Math.max(0, idx - 1)]?.id ?? current.id) }}
                disabled={idx === 0}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[10px] text-stone-400 disabled:opacity-30 transition active:scale-90"
              >‹</button>
              <div className="flex gap-1">
                {orderedOptions.map((_, i) => (
                  <span key={i} className={`h-1 rounded-full transition-all ${i === idx ? 'w-3 bg-emerald-400' : 'w-1 bg-stone-200'}`} />
                ))}
              </div>
              <button
                onClick={() => { const ni = Math.min(orderedOptions.length - 1, idx + 1); setIdx(ni); onSelect(orderedOptions[ni]?.id ?? current.id) }}
                disabled={idx === orderedOptions.length - 1}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[10px] text-stone-400 disabled:opacity-30 transition active:scale-90"
              >›</button>
            </div>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        <button
          onClick={() => current && onSelect(current.id)}
          className={`w-full rounded-2xl border px-4 py-4 text-left transition active:scale-[0.98] ${isSelected ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-stone-200 bg-white hover:bg-stone-50'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-bold ${isSelected ? 'text-emerald-700' : 'text-stone-700'}`}>{current?.label}</span>
            {current?.id === plan.recommendedId && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">おすすめ</span>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}

function PartnerSupportCard({ event, onReact }: { event: EmotionEvent; onReact: (reaction: 'ack' | 'soon' | 'on_it') => void }) {
  const hint = buildPartnerSupportHint(event.selected_share_option_id)
  const reactedLabel = getReactionLabel(event.partner_reaction)

  const reactedText =
    event.partner_reaction === 'ack'
      ? 'わかったよ'
      : event.partner_reaction === 'soon'
      ? 'あとで行くね'
      : event.partner_reaction === 'on_it'
      ? 'やっておくね'
      : null

  const reactedAtText = event.partner_reacted_at
    ? new Date(event.partner_reacted_at).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-black/5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
        パートナーからの共有
      </p>

      {event.shared_message && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
          <p className="text-sm leading-relaxed text-stone-700">
            {event.shared_message}
          </p>
        </div>
      )}

      {reactedText ? (
        <p className="mt-3 text-xs text-stone-400">「{reactedText}」と伝えた</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['ack', 'soon', 'on_it'] as const).map(r => {
            const labels: Record<typeof r, string> = { ack: 'わかったよ', soon: 'あとで行くね', on_it: 'やっておくね' }
            return (
              <button
                key={r}
                onClick={() => onReact(r)}
                className="rounded-2xl bg-stone-100 px-2 py-3 text-xs font-semibold text-stone-600 transition hover:bg-stone-200 active:scale-95"
              >
                {labels[r]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 flex flex-col items-center gap-2">
      {toasts.map(t => (
        <div key={t.id} style={{ animation: 'slideUp .25s ease-out both' }}
          className={`flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-xl backdrop-blur-sm ${t.accent ? 'bg-teal-800/95' : 'bg-stone-900/95'}`}>
          {t.emoji && <span className="text-base">{t.emoji}</span>}
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
          {t.msg}
        </div>
      ))}
    </div>
  )
}

function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'home',     icon: '💭', label: '気持ち' },
    { id: 'history',  icon: '📖', label: '履歴'   },
    { id: 'settings', icon: '⚙️', label: '設定'   },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-100/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-md">
        {tabs.map(({ id, icon, label }) => {
          const on = active === id
          return (
            <button key={id} onClick={() => onChange(id)} className="relative flex flex-1 flex-col items-center gap-0.5 py-3 transition-all">
              {on && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-indigo-500" />}
              <span className={`text-xl leading-none transition-transform duration-150 ${on ? 'scale-110' : 'scale-100'}`}>{icon}</span>
              <span className={`text-[10px] font-semibold ${on ? 'text-indigo-500' : 'text-stone-400'}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function BackgroundSelector({ selectedIds, onChange, label }: { selectedIds: BackgroundOptionId[]; onChange: (ids: BackgroundOptionId[]) => void; label?: string }) {
  const toggle = (id: BackgroundOptionId) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id))
    else onChange([...selectedIds, id])
  }
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{label ?? '何が近い？'}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {BACKGROUND_OPTIONS.map(option => {
          const active = selectedIds.includes(option.id)
          return (
            <button key={option.id} type="button" onClick={() => toggle(option.id)}
              className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] ${active ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${active ? 'bg-white' : 'bg-stone-100'}`}>{option.emoji}</div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold leading-tight ${active ? 'text-indigo-700' : 'text-stone-800'}`}>{option.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-stone-400">{option.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmotionQuickSelect({ onSelect }: { onSelect: (e: EmotionType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {EMOTIONS.map(em => (
        <button key={em.type} onClick={() => onSelect(em.type)}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-transparent px-1 py-4 transition active:scale-90 hover:${em.activeBg} ${em.bg}`}>
          <span className="text-3xl leading-none">{em.emoji}</span>
          <span className={`text-[11px] font-bold ${em.color}`}>{em.label}</span>
        </button>
      ))}
    </div>
  )
}

function LonelySelectorSection({ selectedTag, onSelect }: {
  selectedTag: LonelyTag | null
  onSelect: (tag: LonelyTag | null) => void
}) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">どんなさみしさ？</p>
      <div className="flex flex-wrap gap-2">
        {LONELY_OPTIONS.map(opt => {
          const active = selectedTag === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(active ? null : opt.id)}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95 ${
                active
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-stone-300">選ばずにそのまま進んでも大丈夫</p>
    </div>
  )
}

function EmotionComposerSheet({
  emotion, note, selectedBackgroundIds, lonelyTag, setNote, setBackgroundIds, setLonelyTag, onSubmit, onBack, isLoading,
}: {
  emotion: EmotionType; note: string; selectedBackgroundIds: BackgroundOptionId[]
  lonelyTag: LonelyTag | null
  setNote: (n: string) => void; setBackgroundIds: (ids: BackgroundOptionId[]) => void
  setLonelyTag: (tag: LonelyTag | null) => void
  onSubmit: () => void; onBack: () => void; isLoading: boolean
}) {
  const meta = emMeta(emotion)
  const isCalm = emotion === 'calm'
  const isLonely = emotion === 'lonely'
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5" style={{ animation: 'sheetUp .25s ease-out both' }}>
      <div className="mb-5 flex items-center gap-3">
        <span className="text-2xl">{meta.emoji}</span>
        <p className={`text-sm font-bold ${meta.color}`}>{meta.label}</p>
      </div>
      {isLonely && (
        <LonelySelectorSection selectedTag={lonelyTag} onSelect={setLonelyTag} />
      )}
      {!isCalm && !isLonely && (
        <div className="mb-5">
          <BackgroundSelector selectedIds={selectedBackgroundIds} onChange={setBackgroundIds} />
        </div>
      )}
      <div className="mb-4">
        {!isLonely && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">もしあれば（任意）</p>
        )}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={isLonely ? 2 : 3}
          placeholder={
            isCalm   ? '今日の余裕を一言メモしておく（空でも大丈夫）' :
            isLonely ? '一言あれば（空でも大丈夫）' :
                       'もう少し具体的に書いてもOK（空でも大丈夫）'
          }
          className={`w-full resize-none rounded-2xl border bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-700 outline-none transition focus:bg-white focus:ring-2 ${
            isLonely
              ? 'mt-0 border-stone-100 focus:border-rose-200 focus:ring-rose-50'
              : 'mt-2 border-stone-200 focus:border-indigo-300 focus:ring-indigo-100'
          }`} />
      </div>
      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-50">戻る</button>
        <button onClick={onSubmit} disabled={isLoading} className="flex-1 rounded-2xl bg-indigo-500 py-3 text-sm font-bold text-white transition hover:bg-indigo-600 disabled:opacity-70">
          {isLoading ? '処理中...' : '整理する'}
        </button>
      </div>
    </div>
  )
}

function AiResponseCard({ response }: { response: AiResponse }) {
  const text = (() => {
    if (response.short) return response.short
    const match = response.empathy.match(/^[^。！？]+[。！？]/)
    return match ? match[0] : response.empathy
  })()
  return (
    <div style={{ animation: 'fadeUp .4s ease-out both' }}>
      <p className="px-1 text-sm text-stone-400">{text}</p>
    </div>
  )
}

function ActionSuggestionCard({ suggestion, recovered, onRecovered, hideRecoveryButton, isCalm }: {
  suggestion: ActionSuggestion; recovered: boolean; onRecovered: () => void
  hideRecoveryButton?: boolean
  isCalm?: boolean
}) {
  if (recovered) {
    return (
      <div className="rounded-3xl bg-emerald-50 ring-1 ring-emerald-200 px-5 py-5" style={{ animation: 'fadeUp .35s ease-out both' }}>
        <p className="text-base font-bold text-emerald-700">{suggestion.label}</p>
        <p className="mt-1 text-xs text-emerald-500">それだけでも十分。</p>
      </div>
    )
  }

  if (isCalm) {
    return (
      <div className="overflow-hidden rounded-3xl bg-teal-50 ring-1 ring-teal-200" style={{ animation: 'fadeUp .35s ease-out both' }}>
        <div className="px-6 py-5">
          <p className="text-xl font-bold leading-snug tracking-tight text-teal-800">{suggestion.label}</p>
          {suggestion.reason && (
            <p className="mt-2 text-xs text-teal-600/70">{suggestion.reason}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-3xl shadow-lg shadow-indigo-500/20"
      style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
        animation: 'fadeUp .35s ease-out both',
      }}
    >
      {/* 右上の装飾サークル */}
      <div className="relative px-6 py-6 overflow-hidden">
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -right-2 -top-2 h-14 w-14 rounded-full bg-white/5" />

        <p className="text-[24px] font-extrabold leading-snug tracking-tight text-white">
          {suggestion.label}
        </p>
        {suggestion.reason && (
          <p className="mt-2 text-xs font-medium text-white/50">{suggestion.reason}</p>
        )}
        {!hideRecoveryButton && (
          <button
            onClick={onRecovered}
            className="mt-5 text-xs text-white/30 underline underline-offset-2 hover:text-white/60 transition"
          >
            少し落ち着いた
          </button>
        )}
      </div>
    </div>
  )
}

function getRecoveryMessage(emotion?: EmotionType) {
  switch (emotion) {
    case 'calm':
      return '余裕がある日は、その気持ちをふたりで共有できるといいですね'
    case 'angry':
      return '少し落ち着けていたらそれで十分です'
    case 'sad':
      return 'その気持ちを言葉にできただけでも大事な一歩です'
    case 'tired':
      return '今日はここまでで十分頑張っています'
    case 'anxious':
      return '少しでも落ち着けていたら大丈夫です'
    case 'lonely':
      return 'ひとりで抱えずに言葉にできたのは大きいです'
    default:
      return '少し整理できましたね'
  }
}

function RecoveryCard({ onReset, emotion }: { onReset: () => void; emotion?: EmotionType }) {
  const message = getRecoveryMessage(emotion)

  return (
    <section className="rounded-3xl border border-stone-200 bg-white px-5 py-5 shadow-sm">
      <p className="text-sm text-stone-700">
        {message}
      </p>

      <p className="mt-1 text-xs text-stone-400">
        今日はここまでで大丈夫です
      </p>

      <button
        onClick={onReset}
        className="mt-4 w-full rounded-2xl bg-stone-900 py-3 text-white"
      >
        ひとまず閉じる
      </button>
    </section>
  )
}

function ShareTranslationCard({
  translated,
  hasPartner,
  isSharing,
  isShared,
  onShare,
  tone,
  onToneChange,
}: {
  translated: TranslatedShare
  hasPartner: boolean
  isSharing: boolean
  isShared: boolean
  onShare: (message?: string) => void
  tone: 'soft' | 'normal' | 'direct'
  onToneChange: (tone: 'soft' | 'normal' | 'direct') => void
}) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(translated.message)

  useEffect(() => {
    setDraft(translated.message)
    setIsEditing(false)
  }, [translated.message])

  const handleCopy = async () => {
    try {
      if (!draft) return
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(draft)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
        return
      }
      if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea')
        ta.value = draft
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('execCommand failed')
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch (e) {
      console.error('[copy error]', e)
    }
  }

  return (
    <div
      className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5"
      style={{ animation: 'fadeUp .5s ease-out .1s both' }}
    >
      <div className="px-5 py-4">
        <div className="mb-3 flex gap-1.5">
          {[
            { key: 'soft', label: 'やさしく' },
            { key: 'normal', label: 'ふつう' },
            { key: 'direct', label: 'はっきり' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => onToneChange(t.key as 'soft' | 'normal' | 'direct')}
              disabled={isShared}
              className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                tone === t.key
                  ? 'bg-emerald-500 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isEditing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => setIsEditing(false)}
            rows={4}
            maxLength={160}
            autoFocus
            className="w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => !isShared && setIsEditing(true)}
            className="w-full rounded-2xl bg-stone-50 px-4 py-3.5 text-left transition hover:bg-stone-100 active:scale-[0.99] disabled:cursor-default"
            disabled={isShared}
          >
            <p className="text-sm leading-relaxed text-stone-700">{draft}</p>
            {!isShared && <p className="mt-1 text-[10px] text-stone-300">タップして編集</p>}
          </button>
        )}

        {!isShared ? (
          <>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 rounded-2xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-600 transition active:scale-[0.98]"
              >
                {copied ? 'コピーしました' : 'コピーする'}
              </button>

              {hasPartner && (
                <button
                  type="button"
                  onClick={() => onShare(draft)}
                  disabled={isSharing || !draft.trim()}
                  className="flex-[1.4] rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 active:scale-[0.98]"
                >
                  {isSharing ? '送信中…' : 'やさしく伝える'}
                </button>
              )}
            </div>

            {!hasPartner && (
              <p className="mt-3 text-xs leading-relaxed text-stone-400">
                連携すると、このまま相手に伝えられます
              </p>
            )}
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
            <p className="text-sm font-semibold text-emerald-700">
              やわらかく伝えられました
            </p>
            <p className="mt-1 text-xs text-emerald-700/80">
              相手の反応を待っています
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   PARTNER EMOTION HINT
═══════════════════════════════════════════════════ */

const PARTNER_EMOTION_HINTS: Record<EmotionType, string> = {
  calm:    'パートナーが今日は落ち着いているみたい',
  angry:   'パートナーが少し余裕をなくしているみたい',
  sad:     'パートナーがしんどさを感じているみたい',
  tired:   'パートナーが疲れているみたい',
  anxious: 'パートナーが何か気になっていることがあるみたい',
  lonely:  'パートナーが少しさみしさを感じているみたい',
}

function PartnerEmotionHint({ event }: { event: EmotionEvent }) {
  const meta = emMeta(event.emotion_type)
  if (!isToday(new Date(event.created_at))) return null
  return (
    <div className={`flex items-center gap-2 rounded-2xl ${meta.bg} px-4 py-3`}>
      <span className="text-lg">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-semibold ${meta.color}`}>{PARTNER_EMOTION_HINTS[event.emotion_type]}</p>
        <p className="text-[11px] text-stone-400 mt-0.5">{relTime(event.created_at)}</p>
      </div>
    </div>
  )
}



/* ═══════════════════════════════════════════════════
   HOME TAB
═══════════════════════════════════════════════════ */

const REL_OPTIONS = [
  { id: 'great',   label: 'いい感じ'             },
  { id: 'ok',      label: '大きく崩れてない'      },
  { id: 'off',     label: '少しズレてるかも'      },
  { id: 'distant', label: 'ちょっとかみ合ってない' },
] as const

function getTodayRelStatus(events: EmotionEvent[]) {
  const recent = events.slice(-3)
  const negative = recent.filter(e =>
    ['angry', 'sad', 'tired', 'anxious', 'lonely'].includes(e.emotion_type)
  ).length
  if (negative === 0) return 'いい感じ'
  if (negative <= 1) return '大きく崩れてない'
  return '少しズレてるかも'
}




function HomeTab({
  events,
  sharedEvents,
  flow,
  onSelectEmotion,
  onSetNote,
  onSetBackgroundIds,
  onSubmit,
  onShare,
  onReset,
  onRecovered,
  onSelectShareOption,
  hasPartner,
  partnerLatest,
  onReactToPartnerEvent,
  onGoBack,
  shareTone,
  onToneChange,
  relStatus,
  onRelChange,
  onSetLonelyTag,
}: {
  flow: FlowState
  events: EmotionEvent[]
  sharedEvents: EmotionEvent[]
  onSelectEmotion: (e: EmotionType) => void
  onSetNote: (n: string) => void
  onSetBackgroundIds: (ids: BackgroundOptionId[]) => void
  onSubmit: () => void
  onShare: (message?: string) => void
  onReset: () => void
  onRecovered: () => void
  onSelectShareOption: (id: string) => void
  hasPartner: boolean
  partnerLatest: EmotionEvent | null
  onReactToPartnerEvent: (
    eventId: string,
    reaction: 'ack' | 'soon' | 'on_it'
  ) => void | Promise<void>
  onGoBack: () => void
  shareTone: 'soft' | 'normal' | 'direct'
  onToneChange: (tone: 'soft' | 'normal' | 'direct') => void
  relStatus: string | null
  onRelChange: (label: string, id: string) => void
  onSetLonelyTag: (tag: LonelyTag | null) => void
}) {
  const [relPickerOpen, setRelPickerOpen] = useState(false)
  const [relJustUpdated, setRelJustUpdated] = useState(false)
  const [showFirstVisitHint, setShowFirstVisitHint] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem('kt_hint_seen')
  })
  const [exitMessage, setExitMessage] = useState<string | null>(null)

  const handleResetWithFade = useCallback(() => {
    const msgs = ['この気持ち、大切にね。', '少し整ってきたかも。', 'そのままでいいよ。']
    setExitMessage(msgs[Math.floor(Math.random() * msgs.length)])
    setTimeout(() => {
      setExitMessage(null)
      onReset()
    }, 1000)
  }, [onReset])

  useEffect(() => {
    if (!showFirstVisitHint) localStorage.setItem('kt_hint_seen', '1')
  }, [showFirstVisitHint])

  const autoRelStatus = getTodayRelStatus(events ?? [])
  const displayRelStatus = relStatus ?? autoRelStatus

return (
  <div className="space-y-4">

    {/* ① 関係の流れ — wave chart + rel picker */}
    {events.length >= 2 ? (
      <div>
        <RelWaveChart events={events} sharedEvents={sharedEvents} />
        {!relPickerOpen ? (
          <div className="flex justify-end px-1 -mt-1">
            {relJustUpdated ? (
              <span className="text-[10px] text-teal-500 font-medium" style={{ animation: 'fadeUp .2s ease-out both' }}>
                更新しました
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setRelPickerOpen(true)}
                className="text-[10px] text-stone-300 hover:text-stone-500 transition underline underline-offset-2"
              >
                少し違うかも？
              </button>
            )}
          </div>
        ) : (
          <div className="px-1 mt-2" style={{ animation: 'fadeUp .2s ease-out both' }}>
            <p className="text-[11px] text-stone-400 mb-2">今の状態に近いのは？</p>
            <div className="flex flex-wrap gap-1.5">
              {REL_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onRelChange(label, id)
                    setRelPickerOpen(false)
                    setRelJustUpdated(true)
                    setTimeout(() => setRelJustUpdated(false), 2000)
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                    displayRelStatus === label
                      ? 'bg-stone-700 text-white'
                      : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="px-1">
        {!relPickerOpen ? (
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-stone-400">最近の関係：<span className="font-semibold text-stone-500">{displayRelStatus}</span></p>
            {relJustUpdated ? (
              <span className="text-[10px] text-teal-500 font-medium" style={{ animation: 'fadeUp .2s ease-out both' }}>
                更新しました
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setRelPickerOpen(true)}
                className="text-[10px] text-stone-300 hover:text-stone-500 transition underline underline-offset-2"
              >
                少し違うかも？
              </button>
            )}
          </div>
        ) : (
          <div style={{ animation: 'fadeUp .2s ease-out both' }}>
            <p className="text-[11px] text-stone-400 mb-2">今の状態に近いのは？</p>
            <div className="flex flex-wrap gap-1.5">
              {REL_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onRelChange(label, id)
                    setRelPickerOpen(false)
                    setRelJustUpdated(true)
                    setTimeout(() => setRelJustUpdated(false), 2000)
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                    displayRelStatus === label
                      ? 'bg-stone-700 text-white'
                      : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )}

    {/* パートナーからの共有 */}
    {flow.step === 'idle' && partnerLatest && isToday(new Date(partnerLatest.created_at)) && (
      <div className="rounded-3xl bg-stone-50 ring-1 ring-stone-100 px-5 py-4" style={{ animation: 'fadeUp .3s ease-out both' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">パートナーから</p>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{emMeta(partnerLatest.emotion_type).emoji}</span>
          <p className="text-xs text-stone-500">{PARTNER_EMOTION_HINTS[partnerLatest.emotion_type]}</p>
        </div>
        {!partnerLatest.partner_reaction ? (
          <div className="flex gap-2">
            {(['ack', 'soon', 'on_it'] as const).map(r => {
              const labels: Record<typeof r, string> = { ack: 'わかったよ', soon: 'あとで行くね', on_it: 'やっておくね' }
              return (
                <button key={r} onClick={() => void onReactToPartnerEvent(partnerLatest.id, r)}
                  className="flex-1 rounded-2xl bg-white ring-1 ring-stone-200 py-2.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 active:scale-95">
                  {labels[r]}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-stone-400">「{partnerLatest.partner_reaction === 'ack' ? 'わかったよ' : partnerLatest.partner_reaction === 'soon' ? 'あとで行くね' : 'やっておくね'}」と伝えた</p>
        )}
      </div>
    )}

    {/* ② 感情選択 */}
    {flow.step === 'idle' && (
      <div style={{ animation: 'fadeUp .3s ease-out both' }}>
        <div className="my-2 h-px bg-stone-100" />
        <div className="mb-4 flex items-center justify-between px-1">
          <p className="text-base font-bold text-stone-800">今どう？</p>
          {showFirstVisitHint && (
            <p className="text-[10px] text-stone-400 leading-tight max-w-[130px] text-right">選ぶと次の一歩を提案します</p>
          )}
        </div>
        <EmotionQuickSelect onSelect={(e) => { onSelectEmotion(e); setShowFirstVisitHint(false) }} />
      </div>
    )}

    {/* ③ 背景 + メモ */}
    {flow.step === 'composing' && flow.emotion && (
      <>
        <button
          type="button"
          onClick={onGoBack}
          className="flex items-center gap-1 px-1 text-xs text-stone-400 hover:text-stone-600 transition active:scale-95"
        >
          ← 戻る
        </button>
        <EmotionComposerSheet
          emotion={flow.emotion} note={flow.note}
          selectedBackgroundIds={flow.selectedBackgroundIds}
          lonelyTag={flow.lonelyTag}
          setNote={onSetNote} setBackgroundIds={onSetBackgroundIds}
          setLonelyTag={onSetLonelyTag}
          onSubmit={onSubmit} onBack={onGoBack} isLoading={flow.isLoadingAi}
        />
      </>
    )}

    {/* loading */}
    {flow.step === 'responding' && (
      <div className="rounded-3xl bg-white px-5 py-8 text-center shadow-sm ring-1 ring-black/5">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-indigo-500" />
        <p className="text-sm font-semibold text-stone-500">気持ちを整理してる…</p>
      </div>
    )}

    {/* done フロー */}
    {flow.step === 'done' && flow.emotion && flow.aiResponse && (
      <div style={{ animation: 'fadeUp .3s ease-out both' }}>
        {exitMessage ? (
          <div className="py-10 text-center" style={{ animation: 'fadeUp .3s ease-out both' }}>
            <p className="text-sm text-stone-400">{exitMessage}</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-8">
            {/* タイムライン縦線 */}
            <div className="absolute left-[11px] top-2 bottom-3 w-px bg-stone-100" />

            {/* ① まず一歩（主役・最上位） */}
            {flow.actionSuggestion && (
              <div className="relative">
                <span className="absolute -left-6 top-6 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 ring-2 ring-white">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">まず一歩</p>
                <ActionSuggestionCard
                  suggestion={flow.actionSuggestion}
                  recovered={flow.recovered}
                  onRecovered={onRecovered}
                  hideRecoveryButton={flow.emotion === 'calm'}
                  isCalm={flow.emotion === 'calm'}
                />
                {flow.altSuggestions.length > 0 && !flow.recovered && (
                  <div className="flex gap-2 mt-2">
                    {flow.altSuggestions.slice(0, 2).map((s, i) => (
                      <div key={i} className="flex-1 rounded-2xl bg-stone-100 px-3 py-2.5">
                        <p className="text-xs font-medium text-stone-500 leading-snug">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ② AI整理（補助・下） */}
            <div className="relative">
              <span className="absolute -left-6 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 ring-2 ring-white">
                <span className="h-2 w-2 rounded-full bg-stone-300" />
              </span>
              <AiResponseCard response={flow.aiResponse} />
            </div>

            {/* ③ 伝えるならこんな感じ（calm 除外） */}
            {flow.emotion !== 'calm' && flow.sharePlan && (
              <div className="relative">
                <span className="absolute -left-6 top-6 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-white">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">伝えるならこんな感じ</p>
                <ShareOptionSelector plan={flow.sharePlan} selectedId={flow.selectedShareOptionId} onSelect={onSelectShareOption} />
              </div>
            )}

            {/* ④ 翻訳（calm 除外） */}
            {flow.emotion !== 'calm' && flow.translated && (
              <div className="relative">
                <span className="absolute -left-6 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 ring-2 ring-white">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                </span>
                <ShareTranslationCard
                  translated={flow.translated}
                  hasPartner={hasPartner}
                  isSharing={flow.isSharing}
                  isShared={flow.isShared}
                  onShare={onShare}
                  tone={shareTone}
                  onToneChange={onToneChange}
                />
              </div>
            )}

            {/* ⑤ パートナーの反応（calm 除外、共有済み） */}
            {flow.emotion !== 'calm' && flow.isShared && (() => {
              const myEvent = events.find(e => e.id === flow.savedEventId)
              const reactionText = myEvent ? getPartnerReactionText(myEvent.partner_reaction) : null
              return (
                <div className="relative">
                  <span className="absolute -left-6 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-50 ring-2 ring-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-200" />
                  </span>
                  <p className="pl-1 text-xs text-stone-400">
                    {reactionText ?? '返事を待っています…'}
                  </p>
                </div>
              )
            })()}

            {/* calm の閉じるボタン */}
            {flow.emotion === 'calm' && (
              <div className="relative">
                <button
                  onClick={handleResetWithFade}
                  className="pl-1 text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600 transition"
                >
                  閉じる
                </button>
              </div>
            )}

            {/* 完了後（calm 以外） */}
            {flow.emotion !== 'calm' && (flow.recovered || flow.isShared) && (
              <div className="relative">
                <span className="absolute -left-6 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 ring-2 ring-white">
                  <span className="h-2 w-2 rounded-full bg-stone-300" />
                </span>
                <p className="text-xs text-stone-400 pl-1">{getRecoveryMessage(flow.emotion)}</p>
                <button
                  onClick={handleResetWithFade}
                  className="mt-3 pl-1 text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600 transition"
                >
                  もう一度整理する
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </div>
)
}



/* ═══════════════════════════════════════════════════
   HISTORY TAB
═══════════════════════════════════════════════════ */

type RelationState = 'stable' | 'drifting' | 'recovering'

const RELATION_LABEL: Record<RelationState, string> = {
  stable:     '安定',
  drifting:   'ズレ気味',
  recovering: '回復中',
}

function getRelationState(history: number[]): RelationState {
  if (history.length < 2) return 'stable'
  // 前半平均 vs 後半平均でトレンドを判定（最後の1点差より安定）
  const mid = Math.floor(history.length / 2)
  const firstAvg = history.slice(0, mid).reduce((s, v) => s + v, 0) / mid
  const secondAvg = history.slice(mid).reduce((s, v) => s + v, 0) / (history.length - mid)
  const diff = secondAvg - firstAvg
  if (diff > 0.08) return 'recovering'
  if (diff < -0.08) return 'drifting'
  return 'stable'
}

function generateWave(history: number[]): number[] {
  // ランダムノイズ + 位相ノイズを合成してフラットな波を防ぐ
  return history.map((h, i) => {
    const phaseNoise = Math.sin(i * 1.9 + 0.7) * 0.1   // 決定論的な振動
    const randomNoise = (Math.random() - 0.5) * 0.12   // ランダム成分
    return Math.min(1, Math.max(0, h + phaseNoise + randomNoise))
  })
}

function smoothWave(points: number[]): number[] {
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p
    return (points[i - 1] + p + points[i + 1]) / 3
  })
}

function RelWaveChart({ events, sharedEvents }: { events: EmotionEvent[]; sharedEvents: EmotionEvent[] }) {
  const negativeEmotions = new Set(['angry', 'sad', 'tired', 'anxious', 'lonely'])
  const allItems = useMemo(() => {
    const combined = [
      ...events.map(e => ({ e, mine: true })),
      ...sharedEvents.map(e => ({ e, mine: false })),
    ].sort((a, b) => new Date(a.e.created_at).getTime() - new Date(b.e.created_at).getTime())
    return combined.slice(-14)
  }, [events, sharedEvents])

  const wavePoints = useMemo(() => {
    const rawHistory = allItems.map(({ e }) =>
      negativeEmotions.has(e.emotion_type) ? 0.2 : e.emotion_type === 'calm' ? 0.9 : 0.55
    )
    return smoothWave(generateWave(rawHistory))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems])

  if (allItems.length < 2) return null

  const W = 280, H = 48, PAD = 10
  const pts: [number, number][] = wavePoints.map((s, i) => {
    const x = PAD + (i / (wavePoints.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - s) * (H - PAD * 2)
    return [x, y]
  })

  const d = pts.map(([x, y], i) => {
    if (i === 0) return `M ${x} ${y}`
    const [px, py] = pts[i - 1]
    const cx = (px + x) / 2
    return `C ${cx} ${py} ${cx} ${y} ${x} ${y}`
  }).join(' ')

  const lastPt = pts[pts.length - 1]
  const state = getRelationState(wavePoints)
  const stateLabel = RELATION_LABEL[state]

  return (
    <div className="mb-4 rounded-3xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">関係の流れ</p>
        <p className="text-[11px] font-bold text-stone-500">{stateLabel}</p>
      </div>
      <div className="relative">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
          <path d={d} fill="none" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {lastPt && (
            <>
              <circle cx={lastPt[0]} cy={lastPt[1]} r="7" fill="#a8a29e" opacity={0.15} />
              <circle cx={lastPt[0]} cy={lastPt[1]} r="4.5" fill="#57534e" />
              <circle cx={lastPt[0]} cy={lastPt[1]} r="1.8" fill="white" />
            </>
          )}
        </svg>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-stone-300">過去</span>
          <span className="text-[9px] text-stone-400">今</span>
        </div>
      </div>
    </div>
  )
}

function HistoryTab({
  events,
  sharedEvents,
}: {
  events: EmotionEvent[]
  sharedEvents: EmotionEvent[]
}) {
  type TLItem = { event: EmotionEvent; mine: boolean }

  // Group items by calendar date
  const dayGroups = useMemo(() => {
    const mine = events.map(e => ({ event: e, mine: true }))
    const theirs = sharedEvents.map(e => ({ event: e, mine: false }))
    const all: TLItem[] = [...mine, ...theirs].sort(
      (a, b) => new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime()
    )
    // Group by date string YYYY-MM-DD
    const groups = new Map<string, TLItem[]>()
    for (const item of all) {
      const d = new Date(item.event.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [events, sharedEvents])

  const fmtDayLabel = (key: string) => {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const ydKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    if (key === todayKey) return '今日'
    if (key === ydKey) return '昨日'
    const [, m, d] = key.split('-')
    return `${parseInt(m)}月${parseInt(d)}日`
  }

  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  const reactionWord = (r: EmotionEvent['partner_reaction']) => {
    if (r === 'ack') return 'わかったよ'
    if (r === 'soon') return 'あとで行くね'
    if (r === 'on_it') return 'やっておくね'
    return null
  }

  const getDayRelStatus = (items: TLItem[]) => {
    const neg = items.filter(i => ['angry', 'sad', 'tired', 'anxious', 'lonely'].includes(i.event.emotion_type)).length
    if (neg === 0) return 'いい感じ'
    if (neg <= 1) return '大きく崩れてない'
    return '少しズレてるかも'
  }

  if (dayGroups.length === 0) {
    return (
      <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-sm text-stone-400">まだ記録がありません</p>
        <p className="mt-1 text-xs text-stone-300">気持ちを整理するとここに残ります</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 関係の流れグラフ */}
      <RelWaveChart events={events} sharedEvents={sharedEvents} />

      {dayGroups.map(([dateKey, items]) => {
        const dayLabel = fmtDayLabel(dateKey)
        const relStatus = getDayRelStatus(items)
        const myItems = items.filter(i => i.mine)
        const theirItems = items.filter(i => !i.mine)

        return (
          <div key={dateKey} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
            {/* 日付ヘッダー */}
            <div className="flex items-center justify-between border-b border-stone-50 px-5 py-3">
              <p className="text-sm font-bold text-stone-700">{dayLabel}</p>
              <p className="text-[10px] text-stone-400">関係：{relStatus}</p>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* あなたのエントリ */}
              {myItems.map(({ event }) => {
                const meta = emMeta(event.emotion_type)
                const reaction = reactionWord(event.partner_reaction)
                return (
                  <div key={event.id} className="rounded-2xl bg-indigo-50/60 px-4 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">あなた</span>
                      <span className="text-[10px] text-stone-400">{fmtTime(event.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{meta.emoji}</span>
                      <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                    </div>
                    {event.ai_response_short && (
                      <p className="mt-2 text-xs leading-loose text-stone-500">{event.ai_response_short}</p>
                    )}
                    {event.shared_message && (
                      <div className="mt-2 rounded-xl bg-white/80 px-3 py-2">
                        <p className="text-[10px] text-stone-400 mb-0.5">伝えたこと</p>
                        <p className="text-xs leading-relaxed text-stone-700">「{event.shared_message}」</p>
                      </div>
                    )}
                    {reaction && (
                      <div className="mt-2 rounded-xl bg-emerald-100/60 px-3 py-1.5">
                        <p className="text-xs text-emerald-700">→ 「{reaction}」</p>
                      </div>
                    )}
                    {event.share_status === 'sent' && !reaction && (
                      <p className="mt-1 text-[10px] text-stone-400">返事を待っています…</p>
                    )}
                  </div>
                )
              })}

              {/* パートナーのエントリ */}
              {theirItems.map(({ event }) => {
                const meta = emMeta(event.emotion_type)
                const reaction = reactionWord(event.partner_reaction)
                return (
                  <div key={event.id} className="rounded-2xl bg-stone-100/60 px-4 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">パートナー</span>
                      <span className="text-[10px] text-stone-400">{fmtTime(event.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{meta.emoji}</span>
                      <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                    </div>
                    {event.ai_response_short && (
                      <p className="mt-2 text-xs leading-loose text-stone-500">{event.ai_response_short}</p>
                    )}
                    {event.shared_message && (
                      <div className="mt-2 rounded-xl bg-white/80 px-3 py-2">
                        <p className="text-[10px] text-stone-400 mb-0.5">伝えてくれたこと</p>
                        <p className="text-xs leading-relaxed text-stone-700">「{event.shared_message}」</p>
                      </div>
                    )}
                    {reaction && (
                      <div className="mt-2 rounded-xl bg-sky-100/60 px-3 py-1.5">
                        <p className="text-xs text-sky-700">→ 「{reaction}」</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   CONNECT TAB
═══════════════════════════════════════════════════ */

const BACKGROUND_TAGS = [
  { label: '睡眠不足',      tag: 'sleep_dep',    emoji: '🥱', hint: '夜泣き・夜間対応・細切れ睡眠' },
  { label: '体調不良',      tag: 'sick',         emoji: '🤒', hint: '風邪・頭痛・だるさ' },
  { label: '家事が重い',    tag: 'chore_burden', emoji: '🧺', hint: '料理・洗濯・買い物・片付け' },
  { label: '育児負荷',      tag: 'child_care',   emoji: '🍼', hint: '寝かしつけ・抱っこ・オムツ・ミルク' },
  { label: '仕事の不安',    tag: 'work_stress',  emoji: '💼', hint: '復職・会議・連絡・締切' },
  { label: '一人時間がない', tag: 'isolated',    emoji: '🫥', hint: 'ずっと気が張っている' },
  { label: 'すれ違い',      tag: 'relationship', emoji: '💭', hint: '伝わらない・気づかれない' },
]

function ConnectTab({ todayLogs, onRecordBackground }: { todayLogs: SoloLog[]; onRecordBackground: (label: string, tag: string) => Promise<void> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; count: number; emoji: string }>()
    for (const log of todayLogs) {
      const meta = BACKGROUND_TAGS.find(x => x.tag === log.tag)
      const prev = map.get(log.tag)
      if (prev) { prev.count += 1 }
      else map.set(log.tag, { label: meta?.label ?? log.label, count: 1, emoji: meta?.emoji ?? '•' })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [todayLogs])

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-stone-50 px-5 py-3.5"><h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">今日しんどかった背景</h2></div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {BACKGROUND_TAGS.map(item => (
            <button key={item.tag} onClick={() => void onRecordBackground(item.label, item.tag)}
              className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 text-left transition hover:bg-stone-100 active:scale-95">
              <div className="flex items-center gap-2"><span className="text-lg">{item.emoji}</span><span className="text-sm font-bold text-stone-700">{item.label}</span></div>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-400">{item.hint}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-stone-50 px-5 py-3.5"><h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">今日の重なり</h2></div>
        <div className="px-4 py-4">
          {grouped.length === 0 ? (
            <p className="text-sm text-stone-400">まだ背景メモはありません。</p>
          ) : (
            <div className="space-y-2">
              {grouped.map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
                  <div className="flex items-center gap-2"><span>{item.emoji}</span><span className="text-sm font-semibold text-stone-700">{item.label}</span></div>
                  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-600">{item.count}回</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   SETTINGS TAB
═══════════════════════════════════════════════════ */

function SettingsTab({ session, profile, partner, pairInput, setPairInput, onPair, onSignOut }: {
  session: Session; profile: Profile | null; partner: Profile | null
  pairInput: string; setPairInput: (v: string) => void
  onPair: () => Promise<void>; onSignOut: () => Promise<void>
}) {
  return (
    <div className="space-y-4 pb-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-stone-100 px-5 py-3.5"><h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">アカウント</h2></div>
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-500">{(session.user.email ?? '?')[0].toUpperCase()}</div>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-stone-800">{session.user.email}</p><p className="text-[10px] text-stone-400">ログイン中</p></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-stone-100 px-5 py-3.5"><h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">パートナー連携</h2></div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500">あなたのペアコード</p>
            <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3.5">
              <p className="flex-1 text-2xl font-extrabold tracking-[0.25em] text-indigo-600">{profile?.pair_code ?? '生成中...'}</p>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">相手に伝える</span>
            </div>
          </div>
          {profile?.partner_id ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">✓</div>
              <div className="min-w-0"><p className="text-xs font-bold text-emerald-700">接続しました</p><p className="truncate text-xs text-emerald-500">{partner?.email ?? '相手'}</p></div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="text" value={pairInput} onChange={e => setPairInput(e.target.value.toUpperCase())} maxLength={6}
                  className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm uppercase tracking-widest outline-none transition focus:border-indigo-400" placeholder="例: ABC123" />
                <button type="button" onClick={() => void onPair()} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-600 active:scale-95">登録</button>
              </div>
              <p className="text-[11px] leading-relaxed text-stone-400">相手のペアコードを入力すると連携できます</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
        <p className="mb-2 text-xs font-bold text-stone-500">このアプリについて</p>
        <p className="text-xs leading-relaxed text-stone-500">しんどい時やすれ違った時に気持ちを整理して、今できる一歩と、相手に伝わりやすい言葉に変えるためのアプリです。</p>
      </div>

      <button type="button" onClick={() => void onSignOut()} className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 text-sm font-medium text-stone-500 shadow-sm transition hover:bg-stone-50 active:scale-95">ログアウト</button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════ */

export default function Page() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [pairInput, setPairInput] = useState('')
  const [myLogs, setMyLogs] = useState<SoloLog[]>([])
  const [shareTone, setShareTone] = useState<'soft' | 'normal' | 'direct'>('normal')
  const [relStatus, setRelStatus] = useState<string | null>(null)
  const [relStatusId, setRelStatusId] = useState<string | null>(null)

  const handleRelChange = useCallback((label: string, id: string) => {
    setRelStatus(label)
    setRelStatusId(id)
  }, [])

  const { toasts, push } = useToast()
  const toast = useCallback((m: string) => push(m), [push])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const { profile, partner, refresh } = useProfile(session, toast)

  // IDは profile ベースで統一
  const userId = profile?.id ?? null
  const partnerId = profile?.partner_id ?? null

const {
  events,
  partnerEvents,
  saveEvent,
  markShared,
  reactToPartnerEvent: handlePartnerReaction,
  fetchMy,
  fetchSharedToMe,
} = useEmotionEvents(userId)

  const fetchMyLogs = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from('solo_logs')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('[solo_logs fetch error]', error)
        push(`背景メモの取得に失敗: ${error.message}`, '⚠️')
        return
      }

      setMyLogs((data ?? []) as SoloLog[])
    },
    [push]
  )

  useEffect(() => {
    if (!userId) {
      setMyLogs([])
      return
    }
    void fetchMyLogs(userId)
  }, [userId, fetchMyLogs])

  const todayLogs = useMemo(
    () => myLogs.filter(log => isToday(new Date(log.created_at))),
    [myLogs]
  )

  const todayBackgroundTags = useMemo(
    () => getTodayBackgroundTags(todayLogs),
    [todayLogs]
  )

  const profileBackgroundTags = useMemo(
    () => getProfileBackgroundTags(profile),
    [profile]
  )

  const backgroundTags = useMemo(() => {
    const tags = mergeBackgroundTags(todayBackgroundTags, profileBackgroundTags)
    if (relStatusId === 'off' || relStatusId === 'distant') {
      return mergeBackgroundTags(tags, ['relationship' as BackgroundOptionId])
    }
    return tags
  }, [todayBackgroundTags, profileBackgroundTags, relStatusId])

const partnerLatest = useMemo(() => {
  return [...partnerEvents]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )[0] ?? null
}, [partnerEvents])
    
const [visiblePartnerEvent, setVisiblePartnerEvent] = useState<EmotionEvent | null>(null)
const handlePartnerReactionForCard = useCallback(
  async (eventId: string, reaction: 'ack' | 'soon' | 'on_it') => {
    const reactedAt = new Date().toISOString()

    setVisiblePartnerEvent(prev =>
      prev && prev.id === eventId
        ? {
            ...prev,
            partner_reaction: reaction,
            partner_reacted_at: reactedAt,
          }
        : prev
    )

    await handlePartnerReaction(eventId, reaction)
  },
  [handlePartnerReaction]
)
useEffect(() => {
  if (!partnerLatest) return
  setVisiblePartnerEvent(partnerLatest)
}, [
  partnerLatest?.id,
  partnerLatest?.partner_reaction,
  partnerLatest?.partner_reacted_at,
  partnerLatest?.shared_message,
])


const TITLE: Record<Tab, string> = {
  home: 'ホーム',
  history: '履歴',
  settings: '設定',
}
const {
  flow,
  selectEmotion,
  setNote,
  setBackgroundIds,
  setLonelyTag,
  submit,
  reset,
  markRecovered,
  selectShareOption,
  regenerateTranslatedMessage,
  savedEventIdRef,
  setFlow,
  shareWithPartner,
  goBack,
} = useEmotionFlow(
  userId,
  profile?.partner_id ?? null,
  backgroundTags,
  saveEvent,
  markShared,
  shareTone,
)

  useEffect(() => {
    console.log('[Page id check]', {
      sessionUserId: session?.user?.id ?? null,
      profileId: profile?.id ?? null,
      profilePartnerId: profile?.partner_id ?? null,
      partnerId,
      partnerEventsCount: partnerEvents.length,
      partnerLatestId: partnerLatest?.id ?? null,
    })
  }, [
    session?.user?.id,
    profile?.id,
    profile?.partner_id,
    partnerId,
    partnerEvents.length,
    partnerLatest?.id,
  ])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`emotion-events-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emotion_events',
        },
        payload => {
          const row = (payload.new ?? payload.old) as Partial<EmotionEvent> | null
          if (!row) return

          if (row.user_id === userId || row.partner_id === userId) {
            void fetchMy(userId)
            void fetchSharedToMe(userId)
          }
        }
      )
      .subscribe(status => {
        console.log('[realtime emotion_events]', { userId, status })
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, fetchMy, fetchSharedToMe])

  const handleSignIn = useCallback(async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      push(`ログイン失敗: ${error.message}`, '⚠️')
      return
    }
    push('また来てくれてよかった', '✨', true)
  }, [email, password, push])

  const handleSignUp = useCallback(async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      push(`登録失敗: ${error.message}`, '⚠️')
      return
    }
    push('確認メールを送信しました', '📩', true)
  }, [email, password, push])

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      push(`ログアウト失敗: ${error.message}`, '⚠️')
      return
    }
    setSession(null)
    push('また来てね', '👋')
  }, [push])

  const handlePair = useCallback(async () => {
    if (!userId || !pairInput.trim()) return

    const code = pairInput.trim().toUpperCase()

    const { data: partnerProfile, error: partnerError } = await supabase
      .from('profiles')
      .select('*')
      .eq('pair_code', code)
      .single()

    if (partnerError || !partnerProfile) {
      push('ペアコードが見つかりません', '⚠️')
      return
    }

    if (partnerProfile.id === userId) {
      push('自分自身とは連携できません', '⚠️')
      return
    }

    const { error: updateMineError } = await supabase
      .from('profiles')
      .update({ partner_id: partnerProfile.id })
      .eq('id', userId)

    if (updateMineError) {
      push(`連携に失敗しました: ${updateMineError.message}`, '⚠️')
      return
    }

    const { error: updatePartnerError } = await supabase
      .from('profiles')
      .update({ partner_id: userId })
      .eq('id', partnerProfile.id)

    if (updatePartnerError) {
      push(`相手側連携に失敗しました: ${updatePartnerError.message}`, '⚠️')
      return
    }



    push('ふたりでつながれたね', '🤝', true)
    setPairInput('')
    await refresh()
    await fetchMy(userId)
    await fetchSharedToMe(userId)
  }, [userId, pairInput, push, refresh, fetchMy, fetchSharedToMe])

  if (!session) {
    return (
      <>
     
        <main className="min-h-screen bg-stone-50 px-4 py-10">
          <div className="mx-auto max-w-md">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-6 text-center">
                <p className="text-sm font-semibold tracking-wide text-stone-400">
                  感情が壊れる前に、ひと呼吸
                </p>
                <h1 className="mt-2 text-2xl font-extrabold text-stone-900">
                  感情メモ
                </h1>
              </div>

              <div className="space-y-3">
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="メールアドレス"
                  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none ring-0 placeholder:text-stone-300"
                />
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  placeholder="パスワード"
                  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none ring-0 placeholder:text-stone-300"
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleSignIn()}
                  className="w-full rounded-xl bg-indigo-500 py-4 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95"
                >
                  ログイン
                </button>
                <button
                  onClick={() => void handleSignUp()}
                  className="w-full rounded-xl border border-stone-200 bg-white py-4 text-sm font-medium text-stone-600 transition hover:bg-stone-50 active:scale-95"
                >
                  新規登録
                </button>
              </div>
            </div>
          </div>
          <Toasts toasts={toasts} />
        </main>
      </>
    )
  }

  return (
    <>
  
      <div className="min-h-screen bg-stone-50">
        <header className="sticky top-0 z-30 border-b border-stone-100/80 bg-white/90 px-5 py-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center justify-between">
            <h1 className="text-base font-extrabold text-stone-900">
              {TITLE[tab]}
            </h1>
            {tab === 'home' && profile?.partner_id && (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[10px] font-semibold text-emerald-600">
                  連携中
                </span>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-md px-4 pb-28 pt-6">
          
          {tab === 'home' && (
            
<HomeTab
  events={events}
  sharedEvents={partnerEvents}
  flow={flow}
  onSelectEmotion={selectEmotion}
  onSetNote={setNote}
  onSetBackgroundIds={setBackgroundIds}
  onSubmit={submit}
  onShare={shareWithPartner}
  onReset={reset}
  onRecovered={markRecovered}
  onSelectShareOption={selectShareOption}
  hasPartner={!!profile?.partner_id}
  partnerLatest={visiblePartnerEvent}
  onReactToPartnerEvent={handlePartnerReactionForCard}
  onGoBack={goBack}
  shareTone={shareTone}
  onToneChange={setShareTone}
  relStatus={relStatus}
  onRelChange={handleRelChange}
  onSetLonelyTag={setLonelyTag}
/>
          )}

          {tab === 'history' && (
            <HistoryTab
              events={events}
              sharedEvents={partnerEvents}
            />
          )}

          {tab === 'settings' && (
            <SettingsTab
              session={session}
              profile={profile}
              partner={partner}
              pairInput={pairInput}
              setPairInput={setPairInput}
              onPair={handlePair}
              onSignOut={handleSignOut}
            />
          )}
        </main>

        <BottomNav active={tab} onChange={setTab} />
        <Toasts toasts={toasts} />
      </div>
    </>
  )
}
