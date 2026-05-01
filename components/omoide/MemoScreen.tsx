'use client'

import { useState } from 'react'
import { Button, IconButton } from './ui/Button'
import { ChevLeftIcon, PlusIcon, SparkleIcon } from './ui/Icons'
import type { StoryPhoto } from '@/lib/omoide/types'

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

const MOOD_CHIPS = [
  { label: 'うれしい', emoji: '😊' },
  { label: 'わくわく', emoji: '✨' },
  { label: 'びっくり', emoji: '😮' },
  { label: 'たのしい', emoji: '🎉' },
  { label: 'ほっこり', emoji: '🥰' },
] as const

const MAX_CHARS = 200

interface Props {
  photos: StoryPhoto[]
  onBack: () => void
  onGenerate: (memo: string) => void
}

export default function MemoScreen({ photos, onBack, onGenerate }: Props) {
  const [memo, setMemo] = useState('')
  const [selectedMoods, setSelectedMoods] = useState<Set<string>>(new Set())

  const toggleMood = (label: string) => {
    setSelectedMoods(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const remaining = MAX_CHARS - memo.length

  const handleGenerate = () => {
    const moodText = selectedMoods.size > 0
      ? `\n[きもち: ${Array.from(selectedMoods).join('・')}]`
      : ''
    onGenerate(memo + moodText)
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      <div style={{ padding: '56px 22px 120px' }}>

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <IconButton onClick={onBack} size={36}>
            <ChevLeftIcon size={18}/>
          </IconButton>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.ink, margin: 0 }}>おもいでメモ</h1>
          <div style={{ width: 36 }}/>
        </div>

        {/* step dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20,
        }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: i === 1 ? 20 : 6,
              height: 6,
              borderRadius: 999,
              background: i === 1 ? C.peach : C.line,
            }}/>
          ))}
        </div>

        <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.7, marginBottom: 16 }}>
          このときのこと、おしえてください。<br/>
          ひとことでも、おもうままに書いてみて。
        </p>

        {/* photo thumbnails */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto' }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{
              width: 60, height: 60,
              borderRadius: 12,
              overflow: 'hidden',
              flexShrink: 0,
              border: `1px solid ${C.lineSoft}`,
              boxShadow: '0 2px 6px rgba(120,80,40,0.08)',
              position: 'relative',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt={`photo ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
          ))}
          <div style={{
            width: 60, height: 60,
            borderRadius: 12,
            border: `1.5px dashed ${C.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.inkMute,
            flexShrink: 0,
            background: C.bgSoft,
          }}>
            <PlusIcon size={20} color={C.inkMute}/>
          </div>
        </div>

        {/* textarea */}
        <div style={{
          background: C.paper,
          border: `1px solid ${memo.length > 0 ? C.peach : C.lineSoft}`,
          borderRadius: 18,
          padding: 16,
          position: 'relative',
          marginBottom: 16,
          boxShadow: memo.length > 0 ? `0 0 0 3px ${C.peachSoft}` : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value.slice(0, MAX_CHARS))}
            placeholder="今日はどこへ行ったの？なにが楽しかった？&#10;思ったこと、感じたことを自由に書いてね"
            style={{
              width: '100%',
              minHeight: 160,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 15,
              lineHeight: 1.9,
              color: C.ink,
              background: 'transparent',
              fontFamily: 'inherit',
              letterSpacing: '0.02em',
            }}
          />
          <div style={{
            textAlign: 'right',
            fontSize: 11,
            color: remaining < 30 ? C.peachDeep : C.inkMute,
            marginTop: 4,
          }}>
            {remaining} 文字残り
          </div>
        </div>

        {/* mood chips */}
        <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 10 }}>
          このときのきもち
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {MOOD_CHIPS.map(chip => {
            const on = selectedMoods.has(chip.label)
            return (
              <button
                key={chip.label}
                onClick={() => toggleMood(chip.label)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 999,
                  background: on ? C.peachSoft : C.paper,
                  color: on ? C.peachDeep : C.inkSoft,
                  fontSize: 13,
                  border: `1px solid ${on ? C.peach : C.line}`,
                  fontWeight: on ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                {chip.emoji} {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* bottom bar */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: C.paper,
        borderTop: `1px solid ${C.lineSoft}`,
        padding: '16px 22px 28px',
      }}>
        <Button variant="primary" fullWidth onClick={handleGenerate}>
          <SparkleIcon size={18} color="#fff"/>
          えほんをつくる ✨
        </Button>
      </div>
    </div>
  )
}
