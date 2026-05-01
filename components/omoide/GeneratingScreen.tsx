'use client'

import { useEffect, useState } from 'react'
import { CheckIcon } from './ui/Icons'

const C = {
  bg: '#FBF4E8',
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
}

const STEPS = [
  { label: '写真をよみとっています', duration: 600 },
  { label: 'おもいでをひろいだしています', duration: 700 },
  { label: '日本語のおはなしをかいています', duration: 800 },
  { label: '英語のおはなしをかいています', duration: 900 },
] as const

function AIMascot() {
  return (
    <div style={{ width: 140, height: 140, position: 'relative', animation: 'bob 2.6s ease-in-out infinite' }}>
      {/* book base */}
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: 'absolute', inset: 0 }}>
        <path d="M14 96 Q14 92 18 92 L66 92 L70 88 L74 92 L122 92 Q126 92 126 96 L126 122 Q126 126 122 126 L18 126 Q14 126 14 122 Z"
          fill="#FFF7E6" stroke="#E9DEC8" strokeWidth="1.5"/>
        <path d="M70 88 L70 122" stroke="#E9DEC8" strokeWidth="1.2"/>
      </svg>
      {/* robot head */}
      <div style={{
        position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)',
        width: 72, height: 70,
      }}>
        <div style={{ position: 'absolute', left: '50%', top: -8, width: 2, height: 10, background: '#9DBFCE', transform: 'translateX(-50%)' }}/>
        <div style={{ position: 'absolute', left: '50%', top: -16, width: 8, height: 8, background: C.peach, borderRadius: '50%', transform: 'translateX(-50%)' }}/>
        <div style={{
          width: 72, height: 66,
          background: '#EAF1F4',
          border: '2px solid #BCD2DA',
          borderRadius: '50% 50% 42% 42%',
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: '#7AA4B8', letterSpacing: 1, fontWeight: 700 }}>AI</div>
          <div style={{ position: 'absolute', top: 24, left: 16, width: 8, height: 10, background: '#3B2F22', borderRadius: 4 }}/>
          <div style={{ position: 'absolute', top: 24, right: 16, width: 8, height: 10, background: '#3B2F22', borderRadius: 4 }}/>
          <div style={{ position: 'absolute', top: 38, left: 8, width: 10, height: 6, background: C.peach, borderRadius: '50%', opacity: 0.7 }}/>
          <div style={{ position: 'absolute', top: 38, right: 8, width: 10, height: 6, background: C.peach, borderRadius: '50%', opacity: 0.7 }}/>
          <div style={{ position: 'absolute', top: 42, left: '50%', width: 14, height: 7, border: '2px solid #3B2F22', borderTop: 'none', borderRadius: '0 0 14px 14px', transform: 'translateX(-50%)' }}/>
        </div>
      </div>
      {/* sparkles */}
      {[
        { left: 6, top: 28, delay: 0, color: C.peach },
        { right: 10, top: 38, delay: 0.6, color: C.butter },
        { right: 20, top: 10, delay: 1.2, color: C.peach },
        { left: 20, top: 68, delay: 0.3, color: C.sage },
      ].map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: s.left,
          right: (s as {right?: number}).right,
          top: s.top,
          width: 10, height: 10,
          background: `radial-gradient(closest-side, ${s.color} 30%, transparent 70%)`,
          borderRadius: '50%',
          animation: `twinkle 2.4s ease-in-out ${s.delay}s infinite`,
        }}/>
      ))}
    </div>
  )
}

interface Props {
  onDone: () => void
}

export default function GeneratingScreen({ onDone }: Props) {
  const [progress, setProgress] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)

  useEffect(() => {
    const totalDuration = STEPS.reduce((acc, s) => acc + s.duration, 0)
    let elapsed = 0

    const intervals = STEPS.map((step, i) => {
      const start = STEPS.slice(0, i).reduce((acc, s) => acc + s.duration, 0)
      return setTimeout(() => {
        setCompletedSteps(i + 1)
      }, start + step.duration)
    })

    const ticker = setInterval(() => {
      elapsed += 50
      setProgress(Math.min(95, (elapsed / totalDuration) * 100))
    }, 50)

    const finish = setTimeout(() => {
      setProgress(100)
      clearInterval(ticker)
      setTimeout(onDone, 400)
    }, totalDuration + 200)

    return () => {
      intervals.forEach(clearTimeout)
      clearInterval(ticker)
      clearTimeout(finish)
    }
  }, [onDone])

  return (
    <div style={{
      minHeight: '100dvh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '70px 28px 40px',
      textAlign: 'center',
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: '0 0 8px' }}>
        えほんをつくっています…
      </h2>
      <p style={{
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        fontSize: 13,
        color: C.inkMute,
        margin: '0 0 32px',
      }}>
        Creating your picture book
      </p>

      <AIMascot/>

      <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.9, margin: '24px 0 20px' }}>
        あなたの思い出を<br/>
        えほんにしていますよ…
      </p>

      {/* progress bar */}
      <div style={{
        width: '100%',
        maxWidth: 320,
        height: 6,
        borderRadius: 999,
        background: C.line,
        overflow: 'hidden',
        marginBottom: 28,
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: C.peach,
          borderRadius: 999,
          transition: 'width 0.3s ease',
        }}/>
      </div>

      {/* steps */}
      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
        {STEPS.map((step, i) => {
          const done = i < completedSteps
          const active = i === completedSteps
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: done || active ? 1 : 0.4,
              transition: 'opacity 0.3s',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: done ? C.peach : active ? C.peachSoft : C.line,
                border: active ? `2px solid ${C.peach}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
              }}>
                {done && <CheckIcon size={12} color="#fff"/>}
                {active && (
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: C.peachDeep,
                    animation: 'twinkle 1.2s ease-in-out infinite',
                  }}/>
                )}
              </div>
              <div style={{
                fontSize: 13,
                color: done ? C.ink : C.inkSoft,
                fontWeight: active ? 600 : 400,
              }}>
                {step.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
