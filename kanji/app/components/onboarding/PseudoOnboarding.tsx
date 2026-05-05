'use client'

import { useState, useEffect } from 'react'

// ─── Design tokens (kanji-tokens.jsx) ────────────────────────────────────────
const G    = '#3CC55A'
const INK  = '#000000'
const SURF = '#0B0D0B'
const LINE = '#1B1F1B'
const PE_FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif'
const PE_NUM  = '"Inter", "Helvetica Neue", "Hiragino Kaku Gothic ProN", sans-serif'

// ─── Types ───────────────────────────────────────────────────────────────────
type Props = { onClose: () => void }

// ─── Hook ────────────────────────────────────────────────────────────────────
function usePhase(intervalMs = 1700, total = 8) {
  const [p, setP] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setP(x => (x + 1) % total), intervalMs)
    return () => clearInterval(id)
  }, [paused, intervalMs, total])
  return [p, setP, paused, setPaused] as const
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function KanjiMark({ size = 22, color = G }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M5 7 H22 M27 12 V27 H5 V7" stroke={color} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" fill="none"/>
      <path d="M11 16 L15 20 L24 9" stroke={color} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" fill="none"/>
    </svg>
  )
}

function FadeWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ animation: 'peFadeIn 0.4s ease', height: '100%' }}>
      {children}
    </div>
  )
}

function Slot({ show, order, children }: { show: boolean; order: number; children: React.ReactNode }) {
  return (
    <div style={{
      maxHeight: show ? 80 : 0,
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0)' : 'translateY(-6px)',
      transition: `all 0.5s cubic-bezier(.2,.7,.2,1) ${order * 0.05}s`,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

// MiniPhone (kanji-pseudo.jsx の MiniPhone)
function MiniPhone({ children, role, dim = false }: { children: React.ReactNode; role: string; dim?: boolean }) {
  return (
    <div style={{
      width: 248, height: 520, background: INK,
      borderRadius: 26, position: 'relative',
      boxShadow: dim
        ? '0 20px 50px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)'
        : `0 24px 60px -16px rgba(60,197,90,0.25), 0 0 0 1px rgba(60,197,90,0.18)`,
      overflow: 'hidden',
      transition: 'box-shadow 0.6s ease',
      display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: PE_FONT,
    }}>
      {/* role tag */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 5,
        fontSize: 8, fontWeight: 800, letterSpacing: 2,
        padding: '3px 9px', borderRadius: 99,
        background: dim ? 'rgba(255,255,255,0.06)' : 'rgba(60,197,90,0.12)',
        color: dim ? 'rgba(255,255,255,0.5)' : G,
        border: `1px solid ${dim ? 'rgba(255,255,255,0.08)' : 'rgba(60,197,90,0.3)'}`,
        whiteSpace: 'nowrap' as const,
      }}>{role}</div>

      {/* status bar */}
      <div style={{
        height: 24, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
        flexShrink: 0,
      }}>
        <span>9:41</span>
        <span style={{ display: 'flex', gap: 3 }}>
          <svg width="11" height="7" viewBox="0 0 17 11"><g fill="currentColor"><rect x="0" y="7" width="3" height="4"/><rect x="5" y="5" width="3" height="6"/><rect x="10" y="3" width="3" height="8"/></g></svg>
        </span>
      </div>

      {/* content wrapper — flex column so flex-1 works inside */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Organizer scenes ─────────────────────────────────────────────────────────

function OrgScene_Home() {
  return (
    <FadeWrap>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>イベント作成</div>
        <div style={{
          background: 'rgba(60,197,90,0.08)',
          border: `1px dashed rgba(60,197,90,0.4)`,
          borderRadius: 12, padding: '36px 16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>＋</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>新しい会をつくる</div>
        </div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_Calendar() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  return (
    <FadeWrap>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>候補日を選ぶ</div>
        <div style={{
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 10, padding: '10px 8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 6, padding: '0 4px' }}>
            <span>2025年 4月</span>
            <span style={{ color: G, fontWeight: 700 }}>3日選択中</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {['日','月','火','水','木','金','土'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 8, color: 'rgba(255,255,255,0.45)', padding: '3px 0' }}>{d}</div>
            ))}
            {days.map(d => {
              const isSel = [28, 30].includes(d)
              const isBest = d === 30
              return (
                <div key={d} style={{
                  textAlign: 'center', fontSize: 10, padding: '5px 0',
                  borderRadius: 6,
                  fontFamily: PE_NUM, fontWeight: 600,
                  background: isBest ? G : isSel ? 'rgba(60,197,90,0.18)' : 'transparent',
                  color: isBest ? '#000' : isSel ? G : 'rgba(255,255,255,0.7)',
                  animation: isBest ? 'pePulse 1.4s ease-in-out infinite' : 'none',
                }}>{d}</div>
              )
            })}
          </div>
        </div>
        <div style={{
          marginTop: 10, padding: '10px 12px',
          background: G, color: '#000',
          borderRadius: 10, textAlign: 'center',
          fontSize: 11, fontWeight: 700,
        }}>会をつくる</div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_Share() {
  return (
    <FadeWrap>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>みんなに送る</div>
        <div style={{
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 10, padding: '10px 12px',
          fontFamily: PE_NUM, fontSize: 9,
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 8,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>kanji.app/</span>
          <span style={{ color: G, fontWeight: 700 }}>tanaka-welcome</span>
          <div style={{ flex: 1 }} />
          <div style={{
            fontSize: 8, padding: '2px 6px', background: 'rgba(60,197,90,0.18)',
            color: G, borderRadius: 4, fontWeight: 700,
          }}>コピー</div>
        </div>
        <div style={{
          background: '#06C755', color: '#fff',
          borderRadius: 10, padding: '11px',
          textAlign: 'center', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>💬</span>
          LINEで送る
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <svg width="24" height="40" viewBox="0 0 24 40">
              <path d="M12 2 V36 M6 30 L12 36 L18 30" stroke={G} strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="3 4">
                <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="0.8s" repeatCount="indefinite"/>
              </path>
            </svg>
            <div style={{ fontSize: 8, color: G, fontWeight: 700, letterSpacing: 2 }}>送信中</div>
          </div>
        </div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_AnswerTable() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT(x => Math.min(x + 1, 12)), 220)
    return () => clearInterval(id)
  }, [])
  const dates = [{ d: '4/28', dy: '火' }, { d: '4/30', dy: '木', best: true }, { d: '5/3', dy: '日' }]
  const members = ['田中', '佐藤', '山田', '鈴木']
  const ans = [
    ['o', 'o', 'x'],
    ['x', 'o', 'o'],
    ['t', 'o', 'o'],
    ['o', 'o', 'x'],
  ]
  const colorOf = (v: string) => v === 'o' ? G : v === 'x' ? '#C75348' : '#C9A23A'
  const glyph  = (v: string) => v === 'o' ? '○' : v === 'x' ? '×' : '△'
  return (
    <FadeWrap>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          回答が集まっています
          <div style={{ width: 5, height: 5, borderRadius: 99, background: G, boxShadow: `0 0 6px ${G}`, animation: 'pePulse 1.2s ease-in-out infinite' }} />
        </div>
        <div style={{
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 10, padding: '8px 8px 4px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(3, 1fr)', gap: 4, paddingBottom: 5, borderBottom: `1px solid ${LINE}` }}>
            <div />
            {dates.map(d => (
              <div key={d.d} style={{ textAlign: 'center', fontSize: 9, fontFamily: PE_NUM, fontWeight: 700, color: d.best ? G : 'rgba(255,255,255,0.55)' }}>
                <div>{d.d}</div>
                <div style={{ fontSize: 7, opacity: 0.7 }}>{d.dy}</div>
              </div>
            ))}
          </div>
          {members.map((m, r) => (
            <div key={m} style={{
              display: 'grid', gridTemplateColumns: '38px repeat(3, 1fr)', gap: 4,
              padding: '5px 0', alignItems: 'center',
              borderBottom: r < 3 ? `1px solid ${LINE}` : 'none',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>{m}</div>
              {ans[r].map((v, c) => {
                const idx = r * 3 + c
                const show = idx < t
                return (
                  <div key={c} style={{
                    textAlign: 'center', fontSize: 13, fontWeight: 700, fontFamily: PE_NUM,
                    color: show ? colorOf(v) : 'transparent',
                    background: show && c === 1 ? 'rgba(60,197,90,0.1)' : 'transparent',
                    borderRadius: 4,
                    transform: show ? 'scale(1)' : 'scale(0.5)',
                    transition: 'all 0.25s ease',
                  }}>{glyph(v)}</div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_BestDate() {
  return (
    <FadeWrap>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>日程が決まった</div>
        <div style={{
          background: G, color: '#000', borderRadius: 14, padding: '14px 16px',
          position: 'relative', overflow: 'hidden',
          boxShadow: `0 16px 40px -14px rgba(60,197,90,0.6)`,
          animation: 'peSnap 0.6s cubic-bezier(.2,.7,.2,1.5)',
        }}>
          <div style={{ position: 'absolute', right: -10, top: -10, opacity: 0.12 }}>
            <KanjiMark size={70} color="#000" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1.5, padding: '2px 6px', background: '#000', color: G, borderRadius: 99 }}>✓ 確定</div>
            <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.7 }}>4/4 OK</div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6, position: 'relative' }}>
            <div style={{ fontFamily: PE_NUM, fontSize: 38, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>4/30</div>
            <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>（木）19:00</div>
          </div>
        </div>
        <div style={{
          marginTop: 14, padding: '8px 12px',
          background: 'rgba(60,197,90,0.08)',
          border: `1px solid rgba(60,197,90,0.25)`,
          borderRadius: 8,
          fontSize: 9, color: G, fontWeight: 700,
          letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6L5 9L10 3" stroke={G} strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          条件を引き継ぐ → 店探しへ
        </div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_Store() {
  return (
    <FadeWrap>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>お店の提案</div>
        <div style={{
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 12, overflow: 'hidden',
          animation: 'peSlide 0.5s ease',
        }}>
          <div style={{ height: 64, position: 'relative', background: 'linear-gradient(135deg, #2b1f0e, #0a0a0a)' }}>
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(220,140,60,0.45), transparent 50%), radial-gradient(circle at 70% 60%, rgba(180,90,40,0.4), transparent 60%)',
            }}/>
            <div style={{
              position: 'absolute', top: 6, left: 8,
              fontSize: 7, fontWeight: 800, letterSpacing: 1.5,
              padding: '2px 6px', background: G, color: '#000', borderRadius: 99,
            }}>✓ BEST</div>
          </div>
          <div style={{ padding: '8px 12px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: -0.3, marginBottom: 3, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              good spoon pizzeria 横浜店
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
              {['4人席', '¥3-5k', '個室'].map(tag => (
                <div key={tag} style={{
                  fontSize: 7, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                  background: 'rgba(60,197,90,0.10)',
                  color: '#7FE89A',
                  border: `1px solid rgba(60,197,90,0.25)`,
                }}>{tag}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_Pay() {
  const rows = [
    { n: '幹事', v: 30000, p: 0 },
    { n: '田中', v: 0, p: 7500 },
    { n: '佐藤', v: 0, p: 7500 },
    { n: '山田', v: 0, p: 7500 },
    { n: '鈴木', v: 0, p: 7500 },
  ]
  return (
    <FadeWrap>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>会計精算</div>
        <div style={{
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 10, padding: '9px 11px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid ${LINE}` }}>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>合計</span>
            <span style={{ fontFamily: PE_NUM, fontWeight: 700, color: G }}>¥30,000</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, padding: '3px 0',
            }}>
              <span style={{ color: i === 0 ? G : 'rgba(255,255,255,0.85)', fontWeight: i === 0 ? 700 : 500 }}>
                {r.n}{i === 0 && <span style={{ fontSize: 7, opacity: 0.7, marginLeft: 4 }}>立替</span>}
              </span>
              <span style={{ fontFamily: PE_NUM, fontWeight: 700, color: i === 0 ? G : 'rgba(255,255,255,0.85)' }}>
                {i === 0 ? `+¥${r.v.toLocaleString()}` : `¥${r.p.toLocaleString()}`}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 8, padding: '8px 11px',
          background: G, color: '#000',
          borderRadius: 8, textAlign: 'center',
          fontSize: 10, fontWeight: 700,
        }}>請求URLを送る</div>
      </div>
    </FadeWrap>
  )
}

function OrgScene_Record() {
  return (
    <FadeWrap>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>会の記録</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
          {[
            'linear-gradient(135deg, #4a3a25, #2a1810)',
            'linear-gradient(135deg, #2a3a25, #102810)',
            'linear-gradient(135deg, #3a2540, #20102a)',
            'linear-gradient(135deg, #4a2530, #2a1015)',
          ].map((g, i) => (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: 6, background: g,
              position: 'relative',
              animation: `peFadeIn 0.4s ease ${i * 0.1}s both`,
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,200,140,0.3), transparent 70%)',
                borderRadius: 6,
              }}/>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
          4/30 田中さん歓迎会・写真4枚
        </div>
      </div>
    </FadeWrap>
  )
}

// ─── Guest scenes ─────────────────────────────────────────────────────────────

function GuestScene_Empty() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 8, opacity: 0.4,
    }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="3 4"/>
      </svg>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>待っています</div>
    </div>
  )
}

function GuestScene_Notification() {
  return (
    <FadeWrap>
      <div style={{ padding: '8px 14px' }}>
        <div style={{
          background: SURF, border: `1px solid rgba(60,197,90,0.4)`,
          borderRadius: 10, padding: '9px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'peSlide 0.4s ease',
          boxShadow: `0 8px 20px -8px rgba(60,197,90,0.4)`,
        }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11 }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>幹事 太郎</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>kanji.app/tanaka-welcome</div>
          </div>
        </div>
        <div style={{
          marginTop: 10,
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 10, overflow: 'hidden',
          animation: 'peFadeIn 0.5s ease 0.2s both',
        }}>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>田中さん歓迎会</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>都合のよい日を教えて</div>
          </div>
          <div style={{
            background: 'rgba(60,197,90,0.06)',
            borderTop: `1px solid ${LINE}`,
            padding: '8px 12px',
            display: 'flex', justifyContent: 'space-around',
            fontFamily: PE_NUM,
          }}>
            {['4/28', '4/30', '5/3'].map(d => (
              <div key={d} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, opacity: 0.5 }}>{d}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>—</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FadeWrap>
  )
}

function GuestScene_Answer() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT(x => Math.min(x + 1, 3)), 320)
    return () => clearInterval(id)
  }, [])
  const dates = [
    { d: '4/28', dy: '火', a: 'x' },
    { d: '4/30', dy: '木', a: 'o' },
    { d: '5/3',  dy: '日', a: 'o' },
  ]
  const colorOf = (v: string) => v === 'o' ? G : v === 'x' ? '#C75348' : '#C9A23A'
  const glyph  = (v: string) => v === 'o' ? '○' : v === 'x' ? '×' : '△'
  return (
    <FadeWrap>
      <div style={{ padding: '8px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>都合を教えて</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {dates.map((d, i) => {
            const answered = i < t
            return (
              <div key={d.d} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 5,
                padding: '8px 10px',
                background: answered && d.a === 'o' ? 'rgba(60,197,90,0.08)' : SURF,
                border: `1px solid ${answered && d.a === 'o' ? 'rgba(60,197,90,0.3)' : LINE}`,
                borderRadius: 8, alignItems: 'center',
                transition: 'all 0.3s ease',
              }}>
                <div style={{ fontSize: 10 }}>
                  <span style={{ fontFamily: PE_NUM, fontWeight: 700 }}>{d.d}</span>
                  <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.6 }}>（{d.dy}）</span>
                </div>
                {(['o', 't', 'x'] as const).map(opt => {
                  const isThis = answered && d.a === opt
                  return (
                    <div key={opt} style={{
                      width: 20, height: 20, borderRadius: 99,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontFamily: PE_NUM, fontWeight: 700,
                      background: isThis ? colorOf(opt) : 'transparent',
                      color: isThis ? '#000' : 'rgba(255,255,255,0.25)',
                      border: isThis ? `1px solid ${colorOf(opt)}` : `1px solid rgba(255,255,255,0.15)`,
                      transition: 'all 0.3s ease',
                      transform: isThis ? 'scale(1.1)' : 'scale(1)',
                    }}>{glyph(opt)}</div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </FadeWrap>
  )
}

function GuestScene_EvolvingURL({ phase }: { phase: number }) {
  const has = (n: number) => phase >= n
  return (
    <FadeWrap>
      <div style={{ padding: '6px 12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* URL bar */}
        <div style={{
          fontFamily: PE_NUM, fontSize: 8,
          padding: '5px 8px',
          background: SURF, border: `1px solid ${LINE}`,
          borderRadius: 6, marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <div style={{ width: 4, height: 4, borderRadius: 99, background: G, boxShadow: `0 0 4px ${G}`, flexShrink: 0 }} />
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>kanji.app/</span>
          <span style={{ color: G, fontWeight: 700 }}>tanaka-welcome</span>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>田中さん歓迎会</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
          {/* 1. date */}
          <Slot show={has(4)} order={0}>
            <div style={{ background: G, color: '#000', borderRadius: 8, padding: '6px 10px' }}>
              <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1, opacity: 0.6 }}>① 日程</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
                <div style={{ fontFamily: PE_NUM, fontSize: 18, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>4/30</div>
                <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.7 }}>（木）19:00</div>
              </div>
            </div>
          </Slot>

          {/* 2. store */}
          <Slot show={has(5)} order={1}>
            <div style={{
              background: SURF, border: `1px solid ${LINE}`, borderRadius: 8,
              padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 5,
                background: 'linear-gradient(135deg, #3a2814, #0a0a0a)',
                flexShrink: 0, position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(220,140,60,0.4), transparent 70%)',
                  borderRadius: 5,
                }}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 7, color: G, fontWeight: 700, letterSpacing: 1 }}>② 店</div>
                <div style={{ fontSize: 9, fontWeight: 700, marginTop: 1, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  good spoon pizzeria 横浜店
                </div>
              </div>
            </div>
          </Slot>

          {/* 3. pay */}
          <Slot show={has(6)} order={2}>
            <div style={{
              background: SURF, border: `1px solid ${LINE}`, borderRadius: 8,
              padding: '6px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 7, color: G, fontWeight: 700, letterSpacing: 1 }}>③ あなたの精算</div>
                <div style={{ fontFamily: PE_NUM, fontSize: 12, fontWeight: 800, color: G }}>¥7,500</div>
              </div>
              <div style={{ marginTop: 4, fontSize: 7, color: 'rgba(255,255,255,0.5)' }}>幹事へ送金 →</div>
            </div>
          </Slot>

          {/* 4. record */}
          <Slot show={has(7)} order={3}>
            <div style={{
              background: SURF, border: `1px solid ${LINE}`, borderRadius: 8,
              overflow: 'hidden',
            }}>
              <div style={{
                height: 36, position: 'relative',
                background: 'linear-gradient(135deg, #4a3a25 0%, #2a1810 50%, #1a1208 100%)',
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1,
              }}>
                {[
                  'radial-gradient(ellipse 40% 60% at 50% 50%, rgba(255,200,140,0.5), transparent 70%)',
                  'radial-gradient(ellipse 40% 60% at 50% 50%, rgba(255,180,200,0.5), transparent 70%)',
                  'radial-gradient(ellipse 40% 60% at 50% 50%, rgba(180,255,200,0.4), transparent 70%)',
                ].map((bg, i) => (
                  <div key={i} style={{ backgroundImage: bg, backgroundColor: '#1a1208' }}/>
                ))}
                <div style={{
                  position: 'absolute', top: 4, left: 6,
                  fontSize: 7, color: G, fontWeight: 700, letterSpacing: 1,
                  padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.6)',
                }}>④ 写真</div>
              </div>
            </div>
          </Slot>
        </div>
      </div>
    </FadeWrap>
  )
}

// ─── Panes ────────────────────────────────────────────────────────────────────

function OrganizerPane({ phase }: { phase: number }) {
  return (
    <MiniPhone role="幹事">
      <div style={{ padding: '4px 14px 6px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <KanjiMark size={11} color={G} />
        <div style={{ fontFamily: PE_NUM, fontSize: 9, fontWeight: 700, letterSpacing: 3 }}>KANJI</div>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {phase === 0 && <OrgScene_Home />}
        {phase === 1 && <OrgScene_Calendar />}
        {phase === 2 && <OrgScene_Share />}
        {phase === 3 && <OrgScene_AnswerTable />}
        {phase === 4 && <OrgScene_BestDate />}
        {phase === 5 && <OrgScene_Store />}
        {phase === 6 && <OrgScene_Pay />}
        {phase === 7 && <OrgScene_Record />}
      </div>
    </MiniPhone>
  )
}

function GuestPane({ phase }: { phase: number }) {
  const showSomething = phase >= 2
  return (
    <MiniPhone role="参加者" dim={!showSomething}>
      <div style={{ padding: '4px 14px 6px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <KanjiMark size={11} color={showSomething ? G : 'rgba(255,255,255,0.2)'} />
        <div style={{ fontFamily: PE_NUM, fontSize: 9, fontWeight: 700, letterSpacing: 3, color: showSomething ? '#fff' : 'rgba(255,255,255,0.3)' }}>KANJI</div>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {phase < 2  && <GuestScene_Empty />}
        {phase === 2 && <GuestScene_Notification />}
        {phase === 3 && <GuestScene_Answer />}
        {phase >= 4  && <GuestScene_EvolvingURL phase={phase} />}
      </div>
    </MiniPhone>
  )
}

// ─── Connector ────────────────────────────────────────────────────────────────

function ConnectorFlow({ phase }: { phase: number }) {
  const dirToGuest = [2, 4, 5, 6, 7].includes(phase)
  const dirToOrg   = phase === 3
  const active     = dirToGuest || dirToOrg
  const label      = phase === 2 ? 'URL送信'
    : phase === 3 ? '回答'
    : phase === 4 ? '日程確定'
    : phase === 5 ? '店追加'
    : phase === 6 ? '会計追加'
    : phase === 7 ? '写真追加'
    : ''

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* line */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 1,
        background: active
          ? `linear-gradient(90deg, transparent, ${G}, transparent)`
          : 'rgba(255,255,255,0.08)',
        transition: 'background 0.4s ease',
      }} />

      {/* flowing dots */}
      {active && (
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 0 }}>
          {[0, 0.3, 0.6].map((d, i) => (
            <div key={i} style={{
              position: 'absolute', top: -3, width: 6, height: 6,
              borderRadius: 99, background: G,
              boxShadow: `0 0 8px ${G}`,
              left: dirToGuest ? '0%' : '100%',
              animation: `${dirToGuest ? 'peFlowGo' : 'peFlowGoBack'} 1.4s ease-in-out infinite ${d}s`,
            }} />
          ))}
        </div>
      )}

      {/* label pill */}
      {label && (
        <div key={phase} style={{
          position: 'absolute', top: 'calc(50% - 28px)',
          fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: G,
          padding: '3px 8px', borderRadius: 99,
          background: 'rgba(60,197,90,0.14)',
          border: `1px solid rgba(60,197,90,0.35)`,
          whiteSpace: 'nowrap' as const,
          animation: 'peFadeIn 0.4s ease',
        }}>{label}</div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PseudoOnboarding({ onClose }: Props) {
  const [phase, setPhase, paused, setPaused] = usePhase(1700, 8)

  const captions = [
    { lead: '幹事の仕事は',         body: '日程調整から始まる。' },
    { lead: '候補日を選ぶだけ。',   body: 'カレンダーから3タップ。' },
    { lead: 'URLを送る。',          body: 'LINEでもコピーでも。' },
    { lead: '回答が集まる。',       body: 'リアルタイムで決まっていく。' },
    { lead: '日程が決まった。',     body: '一瞬で。理由つきで。' },
    { lead: 'で、',                 body: '幹事の仕事は終わらない。', accent: 'お店を探さないと。' },
    { lead: '会計も…',             body: '精算しないといけないし。', accent: '一人ひとり確認するの？' },
    { lead: 'KANJIなら、',         body: '全部1本のURLで終わる。', accent: '幹事の仕事、もう1本で終わる。' },
  ] as { lead: string; body: string; accent?: string }[]

  const c     = captions[phase]
  const steps = ['作成', '共有', '回答', '集計', '日程', '店', '会計', '記録']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #0a1208 0%, #000 60%)',
      color: '#fff', fontFamily: PE_FONT,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 24px 40px',
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      <style>{`
        @keyframes pePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
        @keyframes peSnap {
          0% { transform: scale(0.92); opacity: 0; }
          60% { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes peSlide {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes peFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes peFlowGo {
          0%   { transform: translateX(-8px); opacity: 0; }
          30%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translateX(60px); opacity: 0; }
        }
        @keyframes peFlowGoBack {
          0%   { transform: translateX(8px); opacity: 0; }
          30%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translateX(-60px); opacity: 0; }
        }
      `}</style>

      {/* スキップ */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 20,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600,
        fontFamily: PE_FONT, padding: '6px 10px',
      }}>スキップ</button>

      {/* Brand line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <KanjiMark size={20} color={G} />
        <div style={{ fontFamily: PE_NUM, fontSize: 14, fontWeight: 700, letterSpacing: 5 }}>KANJI</div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 28 }}>
        EXPERIENCE PREVIEW · 30 SEC
      </div>

      {/* Caption */}
      <div key={phase} style={{
        textAlign: 'center', marginBottom: 28,
        animation: 'peFadeIn 0.5s ease',
        minHeight: 90,
      }}>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: -0.3 }}>
          {c.lead}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1, lineHeight: 1.3, marginTop: 4 }}>
          {c.body}
        </div>
        {c.accent && (
          <div style={{
            marginTop: 10, fontSize: 13, fontWeight: 700,
            color: phase === 7 ? G : '#C9A23A',
            letterSpacing: 0.5,
          }}>{c.accent}</div>
        )}
      </div>

      {/* Dual phones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, position: 'relative' }}>
        <OrganizerPane phase={phase} />
        <div style={{ width: 60, height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <ConnectorFlow phase={phase} />
        </div>
        <GuestPane phase={phase} />
      </div>

      {/* Timeline scrubber */}
      <div style={{
        marginTop: 36,
        display: 'flex', alignItems: 'center', gap: 6,
        background: SURF, border: `1px solid ${LINE}`,
        padding: '8px 12px', borderRadius: 99,
        flexWrap: 'wrap' as const, justifyContent: 'center',
      }}>
        {steps.map((s, i) => (
          <button key={s}
            onClick={() => { setPhase(i); setPaused(true) }}
            style={{
              padding: '6px 10px', borderRadius: 99,
              border: 'none', cursor: 'pointer',
              background: i === phase ? G : 'transparent',
              color: i === phase ? '#000' : i < phase ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              fontFamily: PE_FONT,
              transition: 'all 0.3s ease',
            }}>
            <span style={{ fontFamily: PE_NUM, marginRight: 4, fontSize: 9, opacity: 0.7 }}>{String(i + 1).padStart(2, '0')}</span>
            {s}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: LINE, margin: '0 4px' }}/>
        <button onClick={() => setPaused(!paused)} style={{
          width: 26, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
          background: 'rgba(60,197,90,0.15)', color: G,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {paused ? (
            <svg width="9" height="10" viewBox="0 0 9 10"><path d="M1 1L8 5L1 9Z" fill={G}/></svg>
          ) : (
            <svg width="9" height="10" viewBox="0 0 9 10"><rect x="1" y="1" width="2.5" height="8" fill={G}/><rect x="5.5" y="1" width="2.5" height="8" fill={G}/></svg>
          )}
        </button>
      </div>

      {/* CTA */}
      <div style={{
        marginTop: 32,
        opacity: phase === 7 ? 1 : 0.4,
        transform: phase === 7 ? 'translateY(0)' : 'translateY(8px)',
        transition: 'all 0.6s cubic-bezier(.2,.7,.2,1)',
      }}>
        <button onClick={onClose} style={{
          padding: '15px 36px',
          background: G, color: '#000',
          border: 'none', borderRadius: 14,
          fontSize: 15, fontWeight: 800, letterSpacing: 0.5,
          fontFamily: PE_FONT, cursor: 'pointer',
          boxShadow: `0 18px 48px -14px rgba(60,197,90,0.7), 0 0 0 1px rgba(127,232,154,0.4)`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <KanjiMark size={16} color="#000" />
          KANJIで会をつくる
          <svg width="14" height="11" viewBox="0 0 14 12"><path d="M1 6H13M9 1L13 6L9 11" stroke="#000" strokeWidth="2.2" fill="none" strokeLinecap="square"/></svg>
        </button>
      </div>
    </div>
  )
}
