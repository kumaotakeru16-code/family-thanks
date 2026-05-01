'use client'

import { useState } from 'react'
import { Button, IconButton } from './ui/Button'
import { ChevLeftIcon, SpeakerIcon, StarIcon } from './ui/Icons'
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

interface Props {
  book: StoryBook
  onRead: () => void
  onBack: () => void
  onRecreate: () => void
}

export default function StoryConfirmScreen({ book, onRead, onBack, onRecreate }: Props) {
  const [lang, setLang] = useState<'jp' | 'en'>('jp')

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      <div style={{ padding: '56px 22px 120px', overflowY: 'auto' }}>

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <IconButton onClick={onBack} size={36}>
            <ChevLeftIcon size={18}/>
          </IconButton>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.ink, margin: 0 }}>
            できました！ ✨
          </h1>
          <div style={{
            fontSize: 13, color: C.peachDeep, fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 999,
            background: C.peachSoft,
            cursor: 'pointer',
          }}>
            編集
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: C.inkSoft, marginBottom: 18 }}>
          全 <strong style={{ color: C.ink }}>{book.photos.length}ページ</strong> の絵本ができました ✨
        </p>

        {/* preview card */}
        <div style={{
          background: C.paper,
          borderRadius: 22,
          border: `1px solid ${C.lineSoft}`,
          boxShadow: '0 8px 28px rgba(120,80,40,0.10)',
          overflow: 'hidden',
          marginBottom: 18,
        }}>
          {/* cover photo */}
          {book.photos[0]?.dataUrl && (
            <div style={{ height: 180, overflow: 'hidden', position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={book.photos[0].dataUrl}
                alt="cover"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, transparent 50%, rgba(255,252,246,0.6) 100%)',
              }}/>
              <div style={{ position: 'absolute', top: 8, right: 8 }}>
                <StarIcon size={22}/>
              </div>
            </div>
          )}

          <div style={{ padding: '14px 16px 16px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
              {book.title}
            </div>

            {/* lang toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: '#F2E9D6',
              borderRadius: 999,
              padding: '3px',
              marginBottom: 14,
              width: 'fit-content',
            }}>
              {(['jp', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    padding: '5px 16px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    background: lang === l ? C.paper : 'transparent',
                    color: lang === l ? C.peachDeep : C.inkMute,
                    boxShadow: lang === l ? '0 1px 4px rgba(120,80,40,0.10)' : 'none',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                >
                  {l === 'jp' ? '日本語' : 'English'}
                </button>
              ))}
            </div>

            {/* story preview */}
            <div style={{
              background: lang === 'en' ? C.bgSoft : 'transparent',
              borderRadius: 12,
              padding: lang === 'en' ? '12px 14px' : 0,
              fontSize: 14,
              lineHeight: 1.85,
              color: C.ink,
              fontFamily: lang === 'en' ? 'Georgia, serif' : 'inherit',
            }}>
              {lang === 'jp'
                ? book.japaneseStory[0]?.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))
                : book.englishStory[0]?.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))
              }
            </div>
          </div>
        </div>

        {/* page thumbnails */}
        <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 10 }}>ページ一覧</div>
        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 24,
        }}>
          {book.photos.map((photo, i) => (
            <div key={photo.id} style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 60, height: 76,
                borderRadius: 8,
                overflow: 'hidden',
                border: i === 0 ? `2px solid ${C.peach}` : `1px solid ${C.lineSoft}`,
                boxShadow: i === 0 ? `0 0 0 2px ${C.peachSoft}` : 'none',
              }}>
                {photo.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                ) : (
                  <div style={{ width: '100%', height: '100%', background: C.peachSoft }}/>
                )}
              </div>
              <div style={{
                position: 'absolute', top: 3, left: 3,
                fontSize: 9, padding: '1px 5px',
                background: 'rgba(255,252,246,0.92)',
                borderRadius: 4,
                color: C.inkSoft,
                fontFamily: 'Georgia, serif',
              }}>
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* bottom actions */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: C.paper,
        borderTop: `1px solid ${C.lineSoft}`,
        padding: '16px 22px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <Button variant="primary" fullWidth onClick={onRead}
          style={{ gap: 10 }}
        >
          <SpeakerIcon size={16} color="#fff"/>
          えほんをよむ
        </Button>
        <Button variant="ghost" fullWidth onClick={onRead}>
          日本語でよむ
        </Button>
        <button
          onClick={onRecreate}
          style={{
            background: 'none', border: 'none',
            fontSize: 12, color: C.inkMute,
            cursor: 'pointer', fontFamily: 'inherit',
            padding: '4px 0',
          }}
        >
          もう一度つくりなおす
        </button>
      </div>
    </div>
  )
}
