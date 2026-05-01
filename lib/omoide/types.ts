export type StoryPhoto = {
  id: string
  dataUrl: string
  memo?: string
}

export type StoryBook = {
  id: string
  title: string
  photos: StoryPhoto[]
  japaneseStory: string[]
  englishStory: string[]
  createdAt: string
}

export type AppScreen =
  | 'onboarding'
  | 'home'
  | 'bookshelf'
  | 'photo-picker'
  | 'memo'
  | 'generating'
  | 'story-confirm'
  | 'reader'

export type CreationState = {
  photos: StoryPhoto[]
  memo: string
  generatedBook: StoryBook | null
}
