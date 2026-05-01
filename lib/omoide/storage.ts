import type { StoryBook } from './types'

const BOOKS_KEY = 'omoide-english-books'
const ONBOARDED_KEY = 'omoide-onboarded'

export function getBooks(): StoryBook[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(BOOKS_KEY)
    return raw ? (JSON.parse(raw) as StoryBook[]) : []
  } catch {
    return []
  }
}

export function saveBook(book: StoryBook): void {
  const books = getBooks()
  const idx = books.findIndex(b => b.id === book.id)
  if (idx >= 0) {
    books[idx] = book
  } else {
    books.unshift(book)
  }
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}

export function getBook(id: string): StoryBook | null {
  return getBooks().find(b => b.id === id) ?? null
}

export function deleteBook(id: string): void {
  const books = getBooks().filter(b => b.id !== id)
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}

export function isOnboarded(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(ONBOARDED_KEY) === 'true'
}

export function setOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, 'true')
}
