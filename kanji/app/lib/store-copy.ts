// Mode-specific copy for the storeSuggestion screen.
// Add new keys here to keep page.tsx free of inline ternary chains.

export type StoreCopy = {
  /** "この店にした理由" or "おすすめポイント" etc. */
  reasonLabel: string
  /** 1-line description of the selection algorithm */
  selectionDescription: string
  /** Genre reason bullet when a genre is specified */
  genreReason: (genre: string) => string
  /** Summary sentence below the reason bullets */
  summaryLow: string
  summaryMid: string
  summaryHigh: string
  /** Footer info card 1 */
  infoCardTitle: string
  infoCardBody: string
  /** Footer info card 2 */
  nextCardTitle: string
  nextCardBody: string
  /** Label for the participant-preference tag block in organizerConditions */
  preferenceLabel: string
}

export const STORE_COPY = {
  store_only: {
    reasonLabel: 'おすすめポイント',
    selectionDescription: '条件・評価・アクセスをもとにAIが選定',
    genreReason: (genre: string) => `${genre}ジャンルの条件に合う`,
    summaryHigh: '条件・評価・アクセスのバランスがよく、店決めに使いやすい',
    summaryMid: 'ジャンル・条件に合っており、たたき台として使いやすい',
    summaryLow: '条件との一致度が高く、参考にしやすい',
    infoCardTitle: '条件をもとに候補を選定',
    infoCardBody: 'ジャンル・エリア・評価・アクセスをもとに、店決めのたたき台になる候補を表示しています。',
    nextCardTitle: '気になったお店は保存できます',
    nextCardBody: 'お気に入りに登録して、あとからこのお店を軸に会を作成できます。',
    preferenceLabel: 'ジャンル条件',
  },
  event_flow: {
    reasonLabel: 'この会に合う理由',
    selectionDescription: '参加者の希望・人数・アクセスをもとにAIが選定',
    genreReason: (genre: string) => `参加者希望の${genre}ジャンル`,
    summaryHigh: '条件・参加者希望・評価のバランスが良く、安心して選べます',
    summaryMid: '条件と参加者の希望の両方に合っており、納得感があります',
    summaryLow: '条件との一致度が高く、安心して選べます',
    infoCardTitle: 'みんなの希望をもとに自動で選定',
    infoCardBody: '参加者の希望・人数・アクセスをもとに、会に合う候補を選んでいます。',
    nextCardTitle: '決定後は、このURLに情報がまとまります',
    nextCardBody: '参加者にURLを共有するだけで、日程・お店・清算が全員に届きます。',
    preferenceLabel: '参加者の希望',
  },
} as const satisfies Record<string, StoreCopy>

export type StoreMode = keyof typeof STORE_COPY

export function getStoreCopy(mode: string): StoreCopy {
  return mode === 'store_only' ? STORE_COPY.store_only : STORE_COPY.event_flow
}
