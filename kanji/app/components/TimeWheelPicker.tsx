'use client'
import { useRef, useEffect, useCallback } from 'react'

const ITEM_H = 44 // px per row

// ─── Single scrollable column ─────────────────────────────────────────────────

function WheelColumn({
  items,
  value,
  onChange,
  suffix,
}: {
  items: readonly string[]
  value: string
  onChange: (v: string) => void
  suffix: string
}) {
  const scrollRef  = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedIdx = Math.max(0, items.indexOf(value))

  // Jump to initial position without animation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = selectedIdx * ITEM_H
  }, [])

  // Sync when parent changes value from outside
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = selectedIdx * ITEM_H
    if (Math.abs(el.scrollTop - target) > 4) {
      el.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [selectedIdx])

  const handleScroll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const el = scrollRef.current
      if (!el) return
      const clamped = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      // CSS snap may leave a sub-pixel gap; nudge to exact position
      el.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' })
      if (items[clamped] !== value) onChange(items[clamped])
    }, 150)
  }, [items, value, onChange])

  return (
    <div className="relative flex-1 overflow-hidden" style={{ height: ITEM_H * 5 }}>
      {/* Centre-row highlight bar (behind the masked scroll area) */}
      <div
        className="pointer-events-none absolute inset-x-1 rounded-xl"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          height: ITEM_H,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.11)',
        }}
      />

      {/* Masked scroll area — top & bottom 40% fade to transparent */}
      <div
        className="absolute inset-0"
        style={{
          maskImage:       'linear-gradient(to bottom, transparent 0%, black 40%, black 60%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 60%, transparent 100%)',
        }}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="[&::-webkit-scrollbar]:hidden"
          style={{
            height: '100%',
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none',
          }}
        >
          {/* Top spacer: lets first item scroll to the visible centre */}
          <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />

          {items.map((item, i) => {
            const dist    = Math.abs(i - selectedIdx)
            const opacity = dist === 0 ? 1 : dist === 1 ? 0.45 : 0.2
            return (
              <div
                key={item}
                onClick={() => {
                  onChange(item)
                  scrollRef.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
                }}
                style={{
                  height: ITEM_H,
                  scrollSnapAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  color: `rgba(255,255,255,${opacity})`,
                  transition: 'color 0.12s',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {item}{suffix}
              </div>
            )
          })}

          {/* Bottom spacer: lets last item scroll to the visible centre */}
          <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

// ─── Hour / minute constants ──────────────────────────────────────────────────

const HOURS   = ['10','11','12','13','14','15','16','17','18','19','20','21','22','23'] as const
const MINUTES = ['00','15','30','45'] as const

// ─── Public component ─────────────────────────────────────────────────────────

export function TimeWheelPicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
}: {
  hour: string
  minute: string
  onHourChange: (h: string) => void
  onMinuteChange: (m: string) => void
}) {
  return (
    <div className="flex items-center" style={{ height: ITEM_H * 5 }}>
      <WheelColumn items={HOURS}   value={hour}   onChange={onHourChange}   suffix="時" />
      <span
        className="shrink-0 select-none pb-0.5 text-lg font-bold"
        style={{ color: 'rgba(255,255,255,0.25)', width: 14, textAlign: 'center' }}
      >
        :
      </span>
      <WheelColumn items={MINUTES} value={minute} onChange={onMinuteChange} suffix="分" />
    </div>
  )
}
