'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AppScreen, CreationState, StoryBook } from '@/lib/omoide/types'
import { isOnboarded, setOnboarded, saveBook } from '@/lib/omoide/storage'
import { generateStoryBook } from '@/lib/omoide/story-generator'

import OnboardingScreen from '@/components/omoide/OnboardingScreen'
import HomeScreen from '@/components/omoide/HomeScreen'
import BookshelfScreen from '@/components/omoide/BookshelfScreen'
import PhotoPickerScreen from '@/components/omoide/PhotoPickerScreen'
import MemoScreen from '@/components/omoide/MemoScreen'
import GeneratingScreen from '@/components/omoide/GeneratingScreen'
import StoryConfirmScreen from '@/components/omoide/StoryConfirmScreen'
import BookReaderScreen from '@/components/omoide/BookReaderScreen'

const EMPTY_CREATION: CreationState = {
  photos: [],
  memo: '',
  generatedBook: null,
}

export default function OmoideApp() {
  const [screen, setScreen] = useState<AppScreen>('onboarding')
  const [creation, setCreation] = useState<CreationState>(EMPTY_CREATION)
  const [readingBook, setReadingBook] = useState<StoryBook | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (isOnboarded()) setScreen('home')
  }, [])

  const navigate = useCallback((to: AppScreen) => {
    setScreen(to)
    window.scrollTo(0, 0)
  }, [])

  const handleOnboardingStart = () => { setOnboarded(); navigate('home') }

  const handleCreateBook = () => { setCreation(EMPTY_CREATION); navigate('photo-picker') }

  const handlePhotosSelected = (photos: CreationState['photos']) => {
    setCreation(prev => ({ ...prev, photos }))
    navigate('memo')
  }

  const handleMemoSubmit = (memo: string) => {
    setCreation(prev => ({ ...prev, memo }))
    navigate('generating')
  }

  const handleGenerationDone = useCallback(() => {
    const book = generateStoryBook(creation.photos, creation.memo)
    saveBook(book)
    setCreation(prev => ({ ...prev, generatedBook: book }))
    navigate('story-confirm')
  }, [creation.photos, creation.memo, navigate])

  const handleReadBook = (book: StoryBook) => { setReadingBook(book); navigate('reader') }

  const handleReaderBack = () => {
    if (creation.generatedBook && readingBook?.id === creation.generatedBook.id) {
      navigate('story-confirm')
    } else {
      navigate('home')
    }
  }

  if (!mounted) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#FBF4E8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: '#F4B5B0',
          animation: 'twinkle 1.2s ease-in-out infinite',
        }}/>
      </div>
    )
  }

  return (
    <main className="omoide-screen-enter">
      {screen === 'onboarding' && <OnboardingScreen onStart={handleOnboardingStart}/>}
      {screen === 'home' && (
        <HomeScreen
          onCreateBook={handleCreateBook}
          onOpenBookshelf={() => navigate('bookshelf')}
          onReadBook={handleReadBook}
        />
      )}
      {screen === 'bookshelf' && (
        <BookshelfScreen
          onBack={() => navigate('home')}
          onCreateBook={handleCreateBook}
          onReadBook={handleReadBook}
        />
      )}
      {screen === 'photo-picker' && (
        <PhotoPickerScreen
          onBack={() => navigate('home')}
          onNext={handlePhotosSelected}
          initialPhotos={creation.photos}
        />
      )}
      {screen === 'memo' && (
        <MemoScreen
          photos={creation.photos}
          onBack={() => navigate('photo-picker')}
          onGenerate={handleMemoSubmit}
        />
      )}
      {screen === 'generating' && <GeneratingScreen onDone={handleGenerationDone}/>}
      {screen === 'story-confirm' && creation.generatedBook && (
        <StoryConfirmScreen
          book={creation.generatedBook}
          onRead={() => handleReadBook(creation.generatedBook!)}
          onBack={() => navigate('home')}
          onRecreate={() => navigate('photo-picker')}
        />
      )}
      {screen === 'reader' && readingBook && (
        <BookReaderScreen book={readingBook} onBack={handleReaderBack}/>
      )}
    </main>
  )
}
