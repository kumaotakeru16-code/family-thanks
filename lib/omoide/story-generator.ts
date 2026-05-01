import type { StoryPhoto, StoryBook } from './types'

type PageContent = { jp: string; en: string }

// ── Theme detection ───────────────────────────────────────────────────

const THEME_KEYWORDS: Record<string, string[]> = {
  zoo:        ['動物園', '動物', 'どうぶつ', 'キリン', 'ゾウ', 'ライオン', 'パンダ', 'サル', '動物えん'],
  beach:      ['海', 'うみ', 'ビーチ', '砂浜', 'すなはま', '波', 'なみ', '海水浴'],
  park:       ['公園', 'こうえん', 'ブランコ', 'すべり台', '砂場'],
  restaurant: ['レストラン', '食べ', 'たべ', 'ご飯', 'ランチ', 'ごはん', 'おいしい', 'カフェ'],
  family:     ['おじいちゃん', 'おばあちゃん', 'パパ', 'ママ', 'じいじ', 'ばあば', '家族', 'かぞく'],
  sakura:     ['桜', 'さくら', '花見', 'はなみ'],
  travel:     ['旅行', 'りょこう', '旅', 'たび', 'おでかけ'],
}

function detectTheme(memo: string): string {
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(kw => memo.includes(kw))) return theme
  }
  return 'default'
}

// ── Page templates per theme ──────────────────────────────────────────

const TEMPLATES: Record<string, Array<(memo: string, i: number, total: number) => PageContent>> = {
  zoo: [
    () => ({
      jp: '今日は どうぶつえんに いきました。\nたくさんの どうぶつたちに あいました。',
      en: 'Today we went to the zoo.\nWe saw so many amazing animals!',
    }),
    () => ({
      jp: '大きな キリンが 首を のばしていました。\nとっても 高くて、びっくりしました！',
      en: 'A tall giraffe stretched its neck up high.\nIt was so big, I was amazed!',
    }),
    () => ({
      jp: 'ゾウが 長い 鼻で 水を シュッと かけてくれました。\nびっくりしたけど、たのしかったです！',
      en: 'The elephant sprayed water with its long nose.\nI was surprised but it was so fun!',
    }),
    () => ({
      jp: 'たくさん 歩いて すこし つかれました。\nでも とっても たのしい いちにちでした。',
      en: 'We walked a lot and got a little tired.\nBut it was the best day ever!',
    }),
    () => ({
      jp: 'かえりに アイスクリームを たべました。\nとっても おいしくて しあわせでした。',
      en: 'On the way home, we had ice cream.\nYummy! It made us so happy.',
    }),
  ],
  beach: [
    () => ({
      jp: '今日は うみに きました。\nあおい なみが きれいでした。',
      en: 'Today we went to the beach.\nThe blue waves were so beautiful!',
    }),
    () => ({
      jp: 'すなはまで かいがらを ひろいました。\nキラキラして かわいかったです。',
      en: 'We found pretty shells in the sand.\nThey sparkled in the sunshine!',
    }),
    () => ({
      jp: 'なみに 足を つけたら つめたくて きもちよかった。\nもっと ずっと いたかったです。',
      en: 'The cool water felt great on my feet.\nI never wanted to leave!',
    }),
    () => ({
      jp: 'うみで たくさん 泳ぎました。\nおひさまが かがやいていました。',
      en: 'We swam and played in the sea.\nThe sunshine made everything glow.',
    }),
    () => ({
      jp: 'うみべで みんなと おべんとうを たべました。\nそとで たべると おいしさ 2ばいです！',
      en: 'We had a picnic by the sea.\nFood outside tastes twice as good!',
    }),
  ],
  park: [
    () => ({
      jp: '今日は こうえんで あそびました。\nひろくて きもちよかったです。',
      en: 'Today we played at the park.\nThe fresh air felt wonderful!',
    }),
    () => ({
      jp: 'ブランコに のって そらまで とびそうでした。\n「もっと 高く！」って さけびました。',
      en: 'I swung so high on the swings.\nI almost touched the sky!',
    }),
    () => ({
      jp: 'すべりだいで なんかいも すべりました。\nはやくて スリル まんてんでした。',
      en: 'I slid down the slide again and again.\nFast and exciting!',
    }),
    () => ({
      jp: 'おにごっこを して たくさん はしりました。\nへとへとに なるまで あそびました。',
      en: 'We ran and played tag together.\nWe played until we were tired!',
    }),
    () => ({
      jp: 'ゆうぐれに いえに かえりました。\nまた きたいな と おもいました。',
      en: 'As the sun set, we headed home.\nI hope we come back soon!',
    }),
  ],
  restaurant: [
    () => ({
      jp: '今日は みんなで ごはんを たべに いきました。\nいいにおいが していました。',
      en: 'Today we all went out to eat.\nIt smelled so delicious!',
    }),
    () => ({
      jp: 'メニューを みて なにを たべようか なやみました。\nいっぱい あって えらべませんでした。',
      en: 'Looking at the menu was hard.\nEverything looked so yummy!',
    }),
    () => ({
      jp: 'りょうりが きたら めが かがやきました。\nとっても おいしそうでした！',
      en: 'When the food arrived, my eyes lit up.\nIt looked absolutely delicious!',
    }),
    () => ({
      jp: 'ひとくち たべたら、もう とまりません。\nあっというまに ぜんぶ たべてしまいました。',
      en: 'One bite and I could not stop.\nI finished everything in no time!',
    }),
    () => ({
      jp: 'おなかが いっぱいで にこにこです。\nまた たべに きたいです！',
      en: 'Full tummy, big smile.\nLet\'s come back again soon!',
    }),
  ],
  family: [
    () => ({
      jp: 'きょうは かぞくが あつまりました。\nみんな あえて うれしかったです。',
      en: 'Today our whole family got together.\nEveryone was so happy!',
    }),
    () => ({
      jp: 'おじいちゃんと おばあちゃんに あいました。\nぎゅっと だっこして もらいました。',
      en: 'I got to see Grandpa and Grandma.\nThey gave me the biggest hugs!',
    }),
    () => ({
      jp: 'みんなで おいしい ごはんを たべました。\nにぎやかで たのしかったです。',
      en: 'We all ate a delicious meal together.\nIt was so lively and fun!',
    }),
    () => ({
      jp: 'かぞくみんなで しゃしんを とりました。\nえがおが いっぱいの しゃしんです。',
      en: 'We took a family photo together.\nFull of smiles and love!',
    }),
    () => ({
      jp: 'また あいたいな と おもいました。\nかぞくって、すきだな。',
      en: 'I hope we meet again soon.\nFamily means everything to me.',
    }),
  ],
  sakura: [
    () => ({
      jp: 'さくらが きれいに さいていました。\nピンクの はなびらが ひらひら まいました。',
      en: 'The cherry blossoms were in full bloom.\nPink petals danced in the breeze.',
    }),
    () => ({
      jp: 'さくらの きの したで おべんとうを たべました。\nとても きもちよかったです。',
      en: 'We had a picnic under the cherry trees.\nIt was so peaceful and lovely.',
    }),
    () => ({
      jp: 'はなびらが ゆっくり おちてきました。\nまるで ゆきみたいでした。',
      en: 'Petals fell slowly from the trees.\nIt looked just like pink snow!',
    }),
    () => ({
      jp: 'さくらの まえで しゃしんを とりました。\nとても すてきな おもいでです。',
      en: 'We took photos in front of the blossoms.\nWhat a beautiful memory!',
    }),
    () => ({
      jp: 'らいねんも いっしょに はなみ しようね。\nそう やくそくしました。',
      en: 'We promised to come back next year.\nSee you again, cherry blossoms!',
    }),
  ],
  travel: [
    () => ({
      jp: '今日は とおくへ おでかけしました。\nわくわくして ねむれませんでした。',
      en: 'Today we went on a special trip.\nI was so excited I could not sleep!',
    }),
    () => ({
      jp: 'はじめて みる けしきに みとれました。\nせかいって ひろいんだな と おもいました。',
      en: 'I saw views I had never seen before.\nThe world is so big and wonderful!',
    }),
    () => ({
      jp: 'あたらしい ばしょで いっぱい あそびました。\nたのしい おもいでが できました。',
      en: 'We explored a brand new place together.\nSo many wonderful memories!',
    }),
    () => ({
      jp: 'すてきな ものを たくさん みつけました。\nまるで たからさがしみたいでした。',
      en: 'We found so many wonderful things.\nIt felt like a treasure hunt!',
    }),
    () => ({
      jp: 'またいつか きたいな と おもいました。\nすてきな たびでした。',
      en: 'I hope we can visit again someday.\nWhat a wonderful adventure!',
    }),
  ],
  default: [
    (memo) => ({
      jp: `${memo.length > 0 ? memo.split(/[\n。！？!?]/)[0].slice(0, 20) + 'ました。' : '今日は、たのしいことがありました。'}\nとても うれしかったです。`,
      en: 'Today was a very special day.\nWe made a wonderful memory!',
    }),
    () => ({
      jp: 'みんなで いっしょに いたから、たのしかったです。\nいつも いっしょに いたいな。',
      en: 'Being together made it wonderful.\nI love being with you!',
    }),
    () => ({
      jp: 'えがおで いっぱいの すてきな じかんでした。\nこの おもいでを たいせつに します。',
      en: 'We laughed and smiled together.\nThis memory stays in our hearts!',
    }),
    () => ({
      jp: 'こんなに たのしい いちにちを、ありがとう。\nだいすきな きもち、つたわるといいな。',
      en: 'Thank you for this wonderful day.\nI love you so much!',
    }),
    () => ({
      jp: 'きょうの おもいでを えほんに しました。\nずっと ずっと おぼえていたいです。',
      en: 'Today\'s memory is now a picture book.\nWe will remember this day forever!',
    }),
  ],
}

function getPageContent(theme: string, pageIndex: number): (memo: string, i: number, total: number) => PageContent {
  const pool = TEMPLATES[theme] ?? TEMPLATES.default
  return pool[pageIndex % pool.length]
}

function generateTitle(memo: string, theme: string): string {
  const defaults: Record<string, string> = {
    zoo:        'どうぶつえんのえほん',
    beach:      'うみのおもいでえほん',
    park:       'こうえんであそんだえほん',
    restaurant: 'おいしいおもいでえほん',
    family:     'かぞくのおもいでえほん',
    sakura:     'さくらのはなみえほん',
    travel:     'たびのおもいでえほん',
    default:    'たいせつなおもいでえほん',
  }
  const firstLine = memo.split(/[\n。！？!?]/)[0].trim()
  if (firstLine.length > 0 && firstLine.length <= 18) {
    return firstLine + 'のえほん'
  }
  return defaults[theme] ?? defaults.default
}

export function generateStoryBook(
  photos: StoryPhoto[],
  memo: string,
  id?: string,
): StoryBook {
  const theme = detectTheme(memo)
  const total = photos.length

  const japaneseStory: string[] = []
  const englishStory: string[] = []

  photos.forEach((_, i) => {
    const fn = getPageContent(theme, i)
    const content = fn(memo, i, total)
    japaneseStory.push(content.jp)
    englishStory.push(content.en)
  })

  return {
    id: id ?? `book-${Date.now()}`,
    title: generateTitle(memo, theme),
    photos,
    japaneseStory,
    englishStory,
    createdAt: new Date().toISOString(),
  }
}
