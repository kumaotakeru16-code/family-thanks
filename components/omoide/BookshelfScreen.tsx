'use client'

import { useEffect, useState } from 'react'
import { Button, IconButton } from './ui/Button'
import { ChevLeftIcon, PlusIcon, StarIcon } from './ui/Icons'
import { getBooks, deleteBook } from '@/lib/omoide/storage'
import type { StoryBook } from '@/lib/omoide/types'

const C = {
  bg: '#FBF4E8',
  bgSoft: '#FCF7EE',
  paper: '#FFFCF6',
  ink: '#3B2F22',
  inkSoft: '#6E5E4D',
  inkMute: '#A89685',
  peach: '#F4B5B0',
  peachDeep: '#E89B95',
  peachSoft: '#FBDDD7',
  line: '#E9DEC8',
  lineSoft: '#F2E9D6',
}

function BookCover({ book, onClick, onDelete }: { book: StoryBook; onClick: () => void; onDelete: () => void }) {
  const [showMenu, setShowMenu] = useState(false)
  const date = new Date(book.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const firstPhoto = book.photos[0]

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => { setShowMenu(false); onClick() }}
        style={{
          background: C.paper,
          borderRadius: 16,
          border: `1px solid ${C.lineSoft}`,
          boxShadow: '0 2px 10px rgba(120,80,40,0.08)',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(120,80,40,0.12)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = '0 2px 10px rgba(120,80,40,0.08)'
        }}
      >
        {/* cover photo */}
        <div style={{ height: 130, overflow: 'hidden', position: 'relative', background: C.peachSoft }}>
          {firstPhoto?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstPhoto.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: `repeating-linear-gradient(135deg, ${C.peachSoft} 0 10px, ${C.bgSoft} 10px 20px)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
            }}>📖</div>
          )}
          <div style={{ position: 'absolute', top: 6, right: 6 }}>
            <StarIcon size={20}/>
          </div>
          {/* page count badge */}
          <div style={{
            position: 'absolute', top: 6, left: 6,
            background: 'rgba(255,252,246,0.92)',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            color: C.inkSoft,
            border: `1px solid ${C.lineSoft}`,
          }}>
            {book.photos.length}ページ
          </div>
        </div>

        <div style={{ padding: '10px 12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>{book.title}</div>
          <div style={{
            fontSize: 10,
            color: C.inkMute,
            marginTop: 4,
            fontFamily: 'Georgia, serif',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{date}</span>
          </div>
        </div>
      </div>

      {/* long-press menu toggle */}
      <button
        onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
        style={{
          position: 'absolute', top: 6, right: 30,
          width: 24, height: 24,
          background: 'rgba(255,252,246,0.9)',
          border: `1px solid ${C.lineSoft}`,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: C.inkSoft,
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        ⋯
      </button>

      {showMenu && (
        <div style={{
          position: 'absolute', top: 34, right: 8, zIndex: 20,
          background: C.paper,
          borderRadius: 12,
          border: `1px solid ${C.line}`,
          boxShadow: '0 8px 24px rgba(120,80,40,0.14)',
          overflow: 'hidden',
          minWidth: 140,
        }}>
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(false); onClick() }}
            style={{
              display: 'block', width: '100%', padding: '12px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: C.ink, textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            📖 よむ
          </button>
          <div style={{ height: 1, background: C.lineSoft }}/>
          <button
            onClick={e => {
              e.stopPropagation()
              setShowMenu(false)
              if (confirm('このえほんを削除しますか？')) onDelete()
            }}
            style={{
              display: 'block', width: '100%', padding: '12px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#e05a4e', textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            🗑️ 削除
          </button>
        </div>
      )}
    </div>
  )
}

const FILTERS = ['すべて', '最近', 'お気に入り'] as const

interface Props {
  onBack: () => void
  onCreateBook: () => void
  onReadBook: (book: StoryBook) => void
}

export default function BookshelfScreen({ onBack, onCreateBook, onReadBook }: Props) {
  const [books, setBooks] = useState<StoryBook[]>([])
  const [filter] = useState<(typeof FILTERS)[number]>('すべて')

  useEffect(() => {
    setBooks(getBooks())
  }, [])

  const handleDelete = (id: string) => {
    deleteBook(id)
    setBooks(getBooks())
  }

  const displayed = books

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, paddingBottom: 100 }}>
      <div style={{ padding: '56px 22px 24px' }}>

        {/* header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconButton onClick={onBack} size={36} style={{ border: `1px solid ${C.line}` }}>
              <ChevLeftIcon size={18}/>
            </IconButton>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: 0 }}>えほんだな</h1>
          </div>
          <span style={{ fontSize: 12, color: C.inkMute }}>{displayed.length}さつ</span>
        </div>

        {/* filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto' }}>
          {FILTERS.map((f) => (
            <div key={f} style={{
              padding: '7px 16px',
              borderRadius: 999,
              background: f === filter ? C.peach : C.paper,
              color: f === filter ? '#fff' : C.inkSoft,
              fontSize: 13,
              whiteSpace: 'nowrap',
              border: f === filter ? 'none' : `1px solid ${C.line}`,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {f}
            </div>
          ))}
        </div>

        {/* book grid */}
        {displayed.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 24px',
            background: C.paper,
            borderRadius: 22,
            border: `1.5px dashed ${C.line}`,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📚</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
              まだえほんがありません
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.7, marginBottom: 20 }}>
              写真とメモから、<br/>あなただけのえほんをつくりましょう！
            </div>
            <Button variant="primary" onClick={onCreateBook}>
              最初の1冊をつくる
            </Button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}>
            {displayed.map(book => (
              <BookCover
                key={book.id}
                book={book}
                onClick={() => onReadBook(book)}
                onDelete={() => handleDelete(book.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={onCreateBook}
        style={{
          position: 'fixed',
          right: 22,
          bottom: 30,
          width: 56, height: 56,
          borderRadius: '50%',
          background: C.peach,
          border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(244,181,176,0.40)',
          zIndex: 10,
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = '' }}
      >
        <PlusIcon size={26} color="#fff"/>
      </button>
    </div>
  )
}
