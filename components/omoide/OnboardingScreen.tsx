'use client'

import { Button } from './ui/Button'
import { SparkleIcon } from './ui/Icons'

const C = {
  bg: '#FBF4E8',
  paper: '#FFFCF6',
  ink: '#3B2F22',
  inkSoft: '#6E5E4D',
  inkMute: '#A89685',
  peach: '#F4B5B0',
  peachDeep: '#E89B95',
  peachSoft: '#FBDDD7',
  line: '#E9DEC8',
}

function Logo({ size = 72 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'inline-block' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: C.paper,
        border: `1.5px solid ${C.line}`,
        borderRadius: size * 0.18,
        boxShadow: '0 4px 16px rgba(120,80,40,0.10)',
      }}/>
      <div style={{
        position: 'absolute',
        left: '50%', top: size * 0.12, bottom: size * 0.12,
        width: 1.5,
        background: C.line,
        transform: 'translateX(-50%)',
      }}/>
      {/* star */}
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" style={{
        position: 'absolute', left: size * 0.10, top: size * 0.14,
      }}>
        <path d="M12 2.5L14.7 9L21.5 9.6L16.3 14L18 20.5L12 17L6 20.5L7.7 14L2.5 9.6L9.3 9Z"
          fill="#F2D27C" stroke="#D9B658" strokeWidth="1" strokeLinejoin="round"/>
      </svg>
      {/* music note */}
      <svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24" style={{
        position: 'absolute', right: size * 0.10, bottom: size * 0.14,
      }}>
        <circle cx="8" cy="18" r="3" fill={C.peach}/>
        <path d="M11 18V6L18 4V8L11 10" fill="none" stroke={C.peach} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="15" cy="16" r="2.2" fill={C.peach} opacity="0.6"/>
      </svg>
    </div>
  )
}

function Sparkle({ x, y, delay = 0, color = C.peach }: { x: number; y: number; delay?: number; color?: string }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      width: 10, height: 10,
      background: `radial-gradient(closest-side, ${color} 30%, transparent 70%)`,
      borderRadius: '50%',
      pointerEvents: 'none',
      animation: `twinkle 2.4s ease-in-out ${delay}s infinite`,
    }}/>
  )
}

export default function OnboardingScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: '60px 28px 40px',
    }}>
      {/* main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 24,
      }}>
        <div style={{ position: 'relative' }}>
          <Logo size={88}/>
          <Sparkle x={-14} y={4} delay={0.2}/>
          <Sparkle x={92} y={28} delay={0.8} color="#F2D27C"/>
          <Sparkle x={80} y={-8} delay={1.4} color="#A8C9B8"/>
        </div>

        <div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.5,
            color: C.ink,
            margin: 0,
          }}>
            子どもの思い出が、<br/>
            <span style={{ color: C.peachDeep }}>英語の絵本</span>になる
          </h1>
          <p style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontSize: 15,
            color: C.inkMute,
            marginTop: 10,
            marginBottom: 0,
          }}>
            My Story, My English.
          </p>
        </div>

        <div style={{
          maxWidth: 320,
          background: C.paper,
          borderRadius: 22,
          padding: '20px 24px',
          border: `1px solid ${C.line}`,
          boxShadow: '0 4px 16px rgba(120,80,40,0.07)',
        }}>
          <p style={{
            fontSize: 15,
            lineHeight: 1.8,
            color: C.inkSoft,
            margin: 0,
          }}>
            写真と おもいでメモから、<br/>
            AIが <span style={{ color: C.peachDeep, fontWeight: 600 }}>子どもだけの英語絵本</span>を<br/>
            作ってくれます
          </p>
        </div>

        {/* feature pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['📸 写真をえらぶ', '✏️ メモをかく', '🤖 AIが絵本に'].map((t, i) => (
            <div key={i} style={{
              padding: '7px 14px',
              borderRadius: 999,
              background: i === 1 ? C.peachSoft : C.paper,
              border: `1px solid ${i === 1 ? C.peach : C.line}`,
              fontSize: 13,
              color: i === 1 ? C.peachDeep : C.inkSoft,
              fontWeight: i === 1 ? 600 : 400,
            }}>{t}</div>
          ))}
        </div>
      </div>

      {/* bottom actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" fullWidth onClick={onStart}>
          <SparkleIcon size={18} color="#fff"/>
          はじめる
        </Button>
        <Button variant="ghost" fullWidth onClick={onStart}>
          すでにお使いの方はこちら
        </Button>

        {/* step dots */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
          marginTop: 8,
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: i === 0 ? 18 : 6,
              height: 6,
              borderRadius: 999,
              background: i === 0 ? C.peach : C.line,
            }}/>
          ))}
        </div>
      </div>
    </div>
  )
}
