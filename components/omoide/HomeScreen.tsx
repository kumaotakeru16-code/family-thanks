'use client'

import { useEffect, useState } from 'react'
import { Button } from './ui/Button'
import { HomeIcon, BookIcon, PlusIcon, UserIcon, SparkleIcon, StarIcon } from './ui/Icons'
import { getBooks } from '@/lib/omoide/storage'
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
  butter: '#F2D27C',
  sage: '#A8C9B8',
  line: '#E9DEC8',
  lineSoft: '#F2E9D6',
}

function Logo({ size = 44 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'inline-flex' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: C.paper,
        border: `1.5px solid ${C.line}`,
        borderRadius: size * 0.18,
        boxShadow: '0 2px 8px rgba(120,80,40,0.10)',
      }}/>
      <div style={{
        position: 'absolute',
        left: '50%', top: size * 0.12, bottom: size * 0.12,
        width: 1.5,
        background: C.line,
        transform: 'translateX(-50%)',
      }}/>
      <svg width={size * 0.38} height={size * 0.38} viewBox="0 0 24 24" style={{
        position: 'absolute', left: size * 0.09, top: size * 0.13,
      }}>
        <path d="M12 2.5L14.7 9L21.5 9.6L16.3 14L18 20.5L12 17L6 20.5L7.7 14L2.5 9.6L9.3 9Z"
          fill="#F2D27C" stroke="#D9B658" strokeWidth="1" strokeLinejoin="round"/>
      </svg>
      <svg width={size * 0.30} height={size * 0.30} viewBox="0 0 24 24" style={{
        position: 'absolute', right: size * 0.09, bottom: size * 0.13,
      }}>
        <circle cx="8" cy="18" r="3" fill={C.peach}/>
        <path d="M11 18V6L18 4V8L11 10" fill="none" stroke={C.peach} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="15" cy="16" r="2.2" fill={C.peach} opacity="0.6"/>
      </svg>
    </div>
  )
}

function PhotoStrip({ dataUrl, label }: { dataUrl?: string; label: string }) {
  if (dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={dataUrl} alt={label} style={{
        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
      }}/>
    )
  }
  return (
    <div style={{
      width: '100%', height: '100%',
      background: `repeating-linear-gradient(135deg, ${C.peachSoft} 0 10px, ${C.bgSoft} 10px 20px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        background: 'rgba(255,252,246,0.9)',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 10,
        color: C.inkSoft,
        border: `1px solid ${C.lineSoft}`,
      }}>{label}</span>
    </div>
  )
}

function BookCard({ book, onClick }: { book: StoryBook; onClick: () => void }) {
  const date = new Date(book.createdAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  const firstPhoto = book.photos[0]
  return (
    <div
      onClick={onClick}
      style={{
        background: C.paper,
        borderRadius: 16,
        border: `1px solid ${C.lineSoft}`,
        boxShadow: '0 2px 8px rgba(120,80,40,0.07)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 8px 24px rgba(120,80,40,0.12)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform = ''
        el.style.boxShadow = '0 2px 8px rgba(120,80,40,0.07)'
      }}
    >
      <div style={{ height: 100, overflow: 'hidden', position: 'relative' }}>
        <PhotoStrip dataUrl={firstPhoto?.dataUrl} label="photo"/>
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <StarIcon size={20}/>
        </div>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{book.title}</div>
        <div style={{ fontSize: 10, color: C.inkMute, marginTop: 4, fontFamily: 'Georgia, serif' }}>
          {date} · {book.photos.length}ページ
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'home', icon: HomeIcon, label: 'ホーム' },
  { id: 'shelf', icon: BookIcon, label: 'ほんだな' },
  { id: 'create', icon: PlusIcon, label: 'つくる', center: true },
  { id: 'profile', icon: UserIcon, label: 'プロフィール' },
] as const

interface Props {
  onCreateBook: () => void
  onOpenBookshelf: () => void
  onReadBook: (book: StoryBook) => void
}

export default function HomeScreen({ onCreateBook, onOpenBookshelf, onReadBook }: Props) {
  const [recentBooks, setRecentBooks] = useState<StoryBook[]>([])

  useEffect(() => {
    setRecentBooks(getBooks().slice(0, 4))
  }, [])

  return (
    <div style={{
      minHeight: '100dvh',
      background: C.bg,
      paddingBottom: 90,
    }}>
      <div style={{ padding: '56px 22px 24px' }}>

        {/* greeting row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 12, color: C.inkMute, letterSpacing: '0.08em' }}>こんにちは</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>おもいで英語えほん</div>
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: C.peachSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: C.peachDeep, fontWeight: 700,
            border: `1px solid ${C.peach}`,
          }}>
            H
          </div>
        </div>

        {/* hero card */}
        <div style={{
          background: `linear-gradient(150deg, ${C.peachSoft} 0%, ${C.bgSoft} 60%, ${C.bg} 100%)`,
          borderRadius: 28,
          padding: 22,
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 24,
          border: `1px solid ${C.lineSoft}`,
          boxShadow: '0 4px 20px rgba(244,181,176,0.20)',
        }}>
          {/* sparkles */}
          {[
            { x: '80%', y: 14 },
            { x: '92%', y: 38 },
            { x: '70%', y: 52 },
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', left: pos.x, top: pos.y,
              width: 10, height: 10,
              background: `radial-gradient(closest-side, ${i % 2 === 0 ? C.peach : C.butter} 30%, transparent 70%)`,
              borderRadius: '50%',
              animation: `twinkle 2.4s ease-in-out ${i * 0.6}s infinite`,
            }}/>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Logo size={52}/>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: C.ink }}>
                あたらしい<br/>絵本をつくる
              </div>
              <div style={{
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: 12,
                color: C.inkMute,
                marginTop: 4,
              }}>
                Create a new book
              </div>
            </div>
          </div>
          <Button variant="primary" fullWidth onClick={onCreateBook}>
            <SparkleIcon size={16} color="#fff"/>
            写真をえらぶ
          </Button>
        </div>

        {/* recent books */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>最近の絵本</div>
          {recentBooks.length > 0 && (
            <button
              onClick={onOpenBookshelf}
              style={{
                fontSize: 12,
                color: C.peachDeep,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              すべて見る ›
            </button>
          )}
        </div>

        {recentBooks.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 24px',
            background: C.paper,
            borderRadius: 22,
            border: `1.5px dashed ${C.line}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
            <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.7 }}>
              まだ絵本がありません<br/>
              <span style={{ color: C.peachDeep }}>上のボタンから最初の1冊</span>を作ってみましょう！
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}>
            {recentBooks.map(book => (
              <BookCard key={book.id} book={book} onClick={() => onReadBook(book)}/>
            ))}
          </div>
        )}
      </div>

      {/* bottom tab bar */}
      <div style={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        background: C.paper,
        borderTop: `1px solid ${C.lineSoft}`,
        padding: '10px 8px 20px',
        display: 'flex',
        alignItems: 'center',
        boxShadow: '0 -4px 16px rgba(120,80,40,0.06)',
        zIndex: 10,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={tab.id === 'shelf' ? onOpenBookshelf : tab.id === 'create' ? onCreateBook : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: tab.id === 'home' ? C.peachDeep : C.inkMute,
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            {'center' in tab && tab.center ? (
              <div style={{
                width: 44, height: 44,
                borderRadius: '50%',
                background: C.peach,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(244,181,176,0.36)',
              }}>
                <tab.icon size={22} color="#fff"/>
              </div>
            ) : (
              <tab.icon size={22} color={tab.id === 'home' ? C.peachDeep : C.inkMute}/>
            )}
            <span style={{ fontSize: 10 }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
