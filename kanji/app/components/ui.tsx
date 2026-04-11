'use client'

/**
 * KANJI Design System — shared UI primitives
 *
 * Rules:
 * - StepHeader:   icon-square + step label + h2 + subtitle (every step)
 * - SectionCard:  rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100
 * - InputCard:    same as SectionCard
 * - NoticeCard:   stone-50 bg, subtle ring
 * - CopyLineRow:  grid-cols-2 — copy (secondary/white) | LINE (green)
 * - PrimaryBtn:   bg-stone-900, full-width, py-4, font-black  (managed in page.tsx)
 * - SecondaryBtn: bg-white ring-1 ring-stone-200, font-bold   (copy buttons)
 * - GhostBtn:     text-stone-400 underline                    (back/tertiary)
 */

import { type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

// ─── カード ──────────────────────────────────────────────────────────────────

/** 標準セクションカード */
export function SectionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100 ${className ?? ''}`}>
      {children}
    </div>
  )
}

/** 補足・注意カード */
export function NoticeCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
      {children}
    </div>
  )
}

// ─── StepHeader ──────────────────────────────────────────────────────────────

/**
 * 全Stepで共通のヘッダーパターン。
 * icon は Lucide コンポーネントをそのまま渡す (size/color は内部で管理)。
 */
export function StepHeader({
  icon,
  step,
  title,
  subtitle,
  topRight,
}: {
  icon: ReactNode
  step?: string          // "Step 3 / 10" など
  title: string
  subtitle?: string
  topRight?: ReactNode   // 右上補助リンク用スロット
}) {
  return (
    <div className="px-0.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
            {icon}
          </div>
          {step && (
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">
              {step}
            </p>
          )}
        </div>
        {topRight}
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-stone-900">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-[13px] leading-relaxed text-stone-400">{subtitle}</p>
      )}
    </div>
  )
}

// ─── ボタン ──────────────────────────────────────────────────────────────────

/** コピーボタン（補助アクション — 白+ring） */
export function CopyBtn({
  copied,
  onCopy,
  className,
}: {
  copied: boolean
  onCopy: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98] ${className ?? ''}`}
    >
      {copied
        ? <><Check size={14} className="text-emerald-500" />コピーしました</>
        : <><Copy size={14} />コピー</>}
    </button>
  )
}

/** LINEで送るボタン */
export function LineBtn({
  onClick,
  href,
  className,
}: {
  onClick?: () => void
  href?: string
  className?: string
}) {
  const cls = `inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98] ${className ?? ''}`
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        LINEで送る
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      LINEで送る
    </button>
  )
}

/**
 * コピー＋LINE の横並びペア（全Stepで統一）
 * 主CTAではなく補助アクションとして一段弱いスタイル
 */
export function CopyLineRow({
  copied,
  onCopy,
  onLine,
  lineHref,
}: {
  copied: boolean
  onCopy: () => void
  onLine?: () => void
  lineHref?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <CopyBtn copied={copied} onCopy={onCopy} />
      <LineBtn onClick={onLine} href={lineHref} />
    </div>
  )
}

// ─── セクションラベル ─────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">
      {children}
    </p>
  )
}
