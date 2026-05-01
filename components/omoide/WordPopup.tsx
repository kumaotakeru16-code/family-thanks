'use client'

import { useEffect, useRef } from 'react'
import { SpeakerIcon, XIcon } from './ui/Icons'
import { speak } from '@/lib/omoide/speech'

const C = {
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

export type WordEntry = {
  word: string
  pronunciation: string
  meaning: string
  description?: string
}

interface Props {
  entry: WordEntry
  anchorRect: DOMRect | null
  onClose: () => void
}

export default function WordPopup({ entry, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Position below the word, clamped to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 100,
    minWidth: 220,
    maxWidth: 260,
  }

  if (anchorRect) {
    const top = anchorRect.bottom + 8
    const left = Math.max(12, Math.min(anchorRect.left, window.innerWidth - 272))
    style.top = top
    style.left = left
  } else {
    style.bottom = 80
    style.left = '50%'
    style.transform = 'translateX(-50%)'
  }

  return (
    <div
      ref={ref}
      style={{
        ...style,
        background: C.paper,
        borderRadius: 16,
        border: `1px solid ${C.line}`,
        boxShadow: '0 8px 32px rgba(120,80,40,0.16)',
        padding: '14px 16px',
        animation: 'sheetUp 0.18s ease',
      }}
    >
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontFamily: 'Georgia, serif',
              fontSize: 20,
              fontWeight: 700,
              color: C.peachDeep,
            }}>
              {entry.word}
            </span>
            <span style={{
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontSize: 11,
              color: C.inkMute,
            }}>
              {entry.pronunciation}
            </span>
          </div>
        </div>
        <button
          onClick={() => speak(entry.word, 'en')}
          style={{
            background: C.peachSoft,
            border: 'none',
            borderRadius: '50%',
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <SpeakerIcon size={14} color={C.peachDeep}/>
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.inkMute,
            display: 'flex',
            alignItems: 'center',
            padding: 2,
          }}
        >
          <XIcon size={14}/>
        </button>
      </div>

      {/* meaning */}
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
        {entry.meaning}
      </div>

      {/* description */}
      {entry.description && (
        <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.6 }}>
          {entry.description}
        </div>
      )}

      {/* tag */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <div style={{
          padding: '3px 10px',
          borderRadius: 999,
          background: C.peachSoft,
          color: C.peachDeep,
          fontSize: 11,
          fontWeight: 500,
        }}>
          えいご
        </div>
        <div style={{
          padding: '3px 10px',
          borderRadius: 999,
          background: '#F2E9D6',
          color: C.inkSoft,
          fontSize: 11,
        }}>
          → ほんだなに追加
        </div>
      </div>
    </div>
  )
}
