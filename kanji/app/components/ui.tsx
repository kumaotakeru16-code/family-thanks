'use client'

/**
 * KANJI Design System — shared UI primitives (dark-mode unified)
 *
 * Color rules:
 *  background  #171717   柔らかいダーク
 *  card        #1e1e1e   背景より少し明るい
 *  hero/BEST   linear-gradient #1e3a22→#0e1c10  森林グリーン
 *  CTA         linear-gradient #22c55e→#14532d  グリーン光沢
 *  text/main   #ffffff
 *  text/sub    rgba(255,255,255,0.55)
 *  text/muted  rgba(255,255,255,0.35)
 *  border      rgba(255,255,255,0.09)
 *
 * Components:
 *  StepHeader   — アイコン + ラベル + h2 + 右上スロット
 *  SectionCard  — 汎用カード
 *  NoticeCard   — 注意カード
 *  SharePanel   — URLのみトグル + テキスト + LINE + コピー（全ボトムシート共通）
 *  CopyBtn      — コピーボタン単体
 *  LineBtn      — LINEボタン単体
 *  CopyLineRow  — コピー + LINE 横並び
 *  SectionLabel — セクションラベル
 *  ToggleSwitch — 小型トグルスイッチ
 */

import { useState, type ReactNode } from 'react'
import { Copy, Check, Link2, AlignLeft } from 'lucide-react'

// ─── ToggleSwitch ──────────────────────────────────────────────────────────────

export function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        checked ? 'bg-emerald-500' : 'bg-white/15'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ─── SharePanel ───────────────────────────────────────────────────────────────
/**
 * 全決定後ボトムシートで共通利用する共有パネル。
 * URLのみトグル / テキストプレビューまたは編集 / LINE + コピー を含む。
 * urlOnly の状態はパネル内部で管理する（グローバル汚染なし）。
 */
export function SharePanel({
  shareText,
  shareUrl,
  onShareTextChange,
  label = '共有する',
  defaultUrlOnly = false,
  hideUrlToggle = false,
}: {
  shareText: string
  shareUrl: string
  /** 渡すと編集可能テキストエリアになる。渡さない場合は読み取り専用。 */
  onShareTextChange?: (text: string) => void
  label?: string
  defaultUrlOnly?: boolean
  /** URLのみトグルを非表示にする（テキストにURLが含まれない場合など） */
  hideUrlToggle?: boolean
}) {
  const [urlOnly, setUrlOnly] = useState(defaultUrlOnly)
  const [copied, setCopied] = useState(false)

  const finalText = urlOnly ? shareUrl : shareText

  const handleCopy = async () => {
    await navigator.clipboard.writeText(finalText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const lineHref = `https://line.me/R/msg/text/?${encodeURIComponent(finalText)}`

  return (
    <div className="space-y-3">
      {/* ラベル + URLのみトグル */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{label}</p>
        {!hideUrlToggle && (
          <label className="flex cursor-pointer items-center gap-2">
            {urlOnly
              ? <Link2 size={11} className="text-emerald-400" strokeWidth={2.5} />
              : <AlignLeft size={11} className="text-white/35" strokeWidth={2.5} />
            }
            <span className="text-[11px] font-bold text-white/45">URLのみ</span>
            <ToggleSwitch checked={urlOnly} onChange={setUrlOnly} />
          </label>
        )}
      </div>

      {/* テキストプレビュー / 編集エリア */}
      {urlOnly ? (
        /* URL表示 */
        <div className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/8">
          <p className="break-all text-[12px] leading-5 text-emerald-400/80">{shareUrl}</p>
        </div>
      ) : onShareTextChange ? (
        /* 編集可能テキストエリア */
        <textarea
          value={shareText}
          onChange={(e) => onShareTextChange(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-xl bg-white/5 px-3 py-2.5 text-[13px] leading-5 text-white/75 ring-1 ring-white/8 outline-none focus:ring-white/20 transition"
        />
      ) : (
        /* 読み取り専用プレビュー */
        <div className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/8">
          <p className="whitespace-pre-wrap text-[12px] leading-5 text-white/55">{shareText}</p>
        </div>
      )}

      {/* LINE + コピー（均等2列、ほぼ同じ重み） */}
      <div className="grid grid-cols-2 gap-2">
        {/* LINE */}
        <a
          href={lineHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#06C755] py-3 text-[14px] font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.48 2 2 6.02 2 11c0 4.07 2.67 7.51 6.44 8.76.47.09.64-.21.64-.46 0-.23-.01-.84-.01-1.65-2.63.57-3.18-1.27-3.18-1.27-.43-1.09-1.05-1.38-1.05-1.38-.86-.59.07-.58.07-.58.95.07 1.45.97 1.45.97.85 1.45 2.22 1.03 2.77.79.09-.62.33-1.03.6-1.27-2.1-.24-4.31-1.05-4.31-4.68 0-1.03.37-1.88.97-2.54-.1-.24-.42-1.2.09-2.5 0 0 .79-.25 2.59.97a9.03 9.03 0 012.36-.32c.8 0 1.61.11 2.36.32 1.8-1.22 2.59-.97 2.59-.97.51 1.3.19 2.26.09 2.5.61.66.97 1.51.97 2.54 0 3.64-2.22 4.44-4.33 4.67.34.29.64.87.64 1.76 0 1.27-.01 2.3-.01 2.61 0 .25.17.55.65.46C19.34 18.5 22 15.06 22 11c0-4.98-4.48-9-10-9z" />
          </svg>
          LINEで送る
        </a>
        {/* コピー */}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white/8 py-3 text-[14px] font-bold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12 active:scale-[0.98]"
        >
          {copied
            ? <><Check size={14} className="text-emerald-400" />コピー済み</>
            : <><Copy size={14} />コピー</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── カード ──────────────────────────────────────────────────────────────────

/** 標準セクションカード（ダーク） */
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
    <div className="flex items-start gap-2 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/8">
      {children}
    </div>
  )
}

// ─── StepHeader ──────────────────────────────────────────────────────────────

export function StepHeader({
  icon,
  step,
  title,
  subtitle,
  topRight,
}: {
  icon: ReactNode
  step?: string
  title: string
  subtitle?: string
  topRight?: ReactNode
}) {
  return (
    <div className="px-0.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
            {icon}
          </div>
          {step && (
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">
              {step}
            </p>
          )}
        </div>
        {topRight}
      </div>
      <h2 className="text-[22px] font-black tracking-tight text-white">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-[13px] leading-relaxed text-white/45">{subtitle}</p>
      )}
    </div>
  )
}

// ─── ボタン（後方互換用 — 既存コードとの互換を保つ） ───────────────────────────

/** コピーボタン単体（後方互換） */
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white/8 py-3 text-sm font-bold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12 active:scale-[0.98] ${className ?? ''}`}
    >
      {copied
        ? <><Check size={14} className="text-emerald-400" />コピー済み</>
        : <><Copy size={14} />コピー</>}
    </button>
  )
}

/** LINEボタン単体（後方互換） */
export function LineBtn({
  onClick,
  href,
  className,
}: {
  onClick?: () => void
  href?: string
  className?: string
}) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#06C755] py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98] ${className ?? ''}`
  if (href) {
    return <a href={href} target="_blank" rel="noreferrer" className={cls}>LINEで送る</a>
  }
  return <button type="button" onClick={onClick} className={cls}>LINEで送る</button>
}

/** コピー + LINE 横並び（後方互換） */
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
    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">
      {children}
    </p>
  )
}
