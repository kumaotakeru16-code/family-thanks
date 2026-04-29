'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User } from 'lucide-react'
import { FeatureIcon } from '@/app/components/brand/FeatureIcon'

type Props = { onClose: () => void }
const TOTAL = 3

// ── アニメーションフェーズを管理するフック ────────────────────────
function usePhaseLoop(steps: number, stepMs: number, holdMs: number) {
  const [phase, setPhase] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    function clear() { timers.current.forEach(clearTimeout); timers.current = [] }
    function run() {
      clear()
      setPhase(0)
      for (let i = 1; i <= steps; i++) {
        timers.current.push(setTimeout(() => setPhase(i), i * stepMs))
      }
      timers.current.push(setTimeout(run, steps * stepMs + holdMs))
    }
    run()
    return clear
  }, [steps, stepMs, holdMs])

  return phase
}

// ── 共通: STEP バッジ ────────────────────────────────────────────
function StepBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]"
      style={{ background: 'var(--brand)', color: '#000' }}
    >
      STEP {n}
    </span>
  )
}

// ── メインコンポーネント ─────────────────────────────────────────
export function OnboardingScreen({ onClose }: Props) {
  const [page, setPage] = useState(0)
  const isLast = page === TOTAL - 1
  const next = () => { if (isLast) onClose(); else setPage(p => p + 1) }

  return (
    <motion.div
      className="fixed inset-0 z-[9000] overflow-hidden"
      style={{ background: '#0C0C0C' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mx-auto flex h-full max-w-[430px] flex-col overflow-hidden">

        {/* ヘッダー */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-2">
          <img src="/brand/kanji-logo.png" alt="KANJI"
            style={{ height: 19, width: 'auto', objectFit: 'contain' }} draggable={false} />
          <button type="button" onClick={onClose}
            className="text-[12px] font-bold text-white/30 transition hover:text-white/60">
            スキップ
          </button>
        </div>

        {/* スライドエリア */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex h-full flex-col px-5 pt-2"
            >
              {page === 0 && <Slide1 />}
              {page === 1 && <Slide2 />}
              {page === 2 && <Slide3 />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ページドット */}
        <div className="flex shrink-0 justify-center gap-1.5 py-3">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: i === page ? 22 : 6,
                background: i === page ? 'var(--brand)' : 'rgba(255,255,255,0.13)' }} />
          ))}
        </div>

        {/* CTA */}
        <div className="shrink-0 px-5 pb-9">
          <button type="button" onClick={next}
            className="w-full rounded-2xl py-4 text-[15px] font-black text-black transition active:scale-[0.98]"
            style={{ background: 'var(--brand)' }}>
            {isLast ? '会をつくる →' : '次へ  >'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   STEP 1: 日程を出す
   アニメ: 空の表 → 参加者が1人ずつ回答 → 第一候補カードが緑に変形
═══════════════════════════════════════════════════════════════ */

const PARTICIPANTS = [
  { name: '田中', color: '#3CC55A' },
  { name: '伊藤', color: '#60A5FA' },
  { name: '斎藤', color: '#F97316' },
]

const SCHEDULE = [
  { label: '4/29（水）', answers: ['○', '○', '○'] as const, best: true },
  { label: '4/30（木）', answers: ['○', '△', '○'] as const },
  { label: '5/1（金）',  answers: ['△', '×', '○'] as const },
]

function AnswerCell({ v, show, delay }: { v: '○'|'△'|'×'; show: boolean; delay: number }) {
  const color = v === '○' ? '#3CC55A' : v === '△' ? '#F59E0B' : '#EF4444'
  return (
    <div className="relative flex items-center justify-center h-8">
      {/* 空プレースホルダー */}
      <motion.span
        animate={{ opacity: show ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        className="absolute text-[13px] select-none"
        style={{ color: 'rgba(255,255,255,0.1)' }}
      >—</motion.span>
      {/* 回答 */}
      <motion.span
        initial={false}
        animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0 }}
        transition={{ duration: 0.28, delay: show ? delay : 0, type: 'spring', stiffness: 300, damping: 22 }}
        className="text-[19px] font-black leading-none"
        style={{ color }}
      >{v}</motion.span>
    </div>
  )
}

function Slide1() {
  // phase1=田中, phase2=伊藤, phase3=斎藤, phase4=第一候補カード緑点灯
  const phase = usePhaseLoop(4, 820, 2000)
  const lit = phase >= 4

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="shrink-0 space-y-1 text-center">
        <StepBadge n={1} />
        <h2 className="text-[24px] font-black tracking-tight text-white leading-none">日程を出す</h2>
        <p className="text-[13px] text-white/40">候補日を出して、みんなが回答</p>
      </div>

      {/* 回答表カード */}
      <div className="flex-1 overflow-hidden rounded-3xl bg-white/6 ring-1 ring-white/10">

        {/* テーブルヘッダー */}
        <div className="grid grid-cols-[64px_1fr_1fr_1fr] items-end border-b border-white/8 px-3 py-2.5 gap-x-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/20">名前</p>
          {SCHEDULE.map((s, i) => (
            <div key={i} className="text-center space-y-1">
              <p className={`text-[10px] font-bold leading-none transition-colors duration-500 ${s.best && lit ? 'text-brand' : 'text-white/35'}`}>
                {s.label}
              </p>
              <motion.span
                animate={{ opacity: s.best && lit ? 1 : 0, scale: s.best && lit ? 1 : 0.6 }}
                transition={{ duration: 0.35 }}
                className="inline-block rounded-full px-1.5 py-px text-[8px] font-black"
                style={{ background: 'var(--brand)', color: '#000' }}
              >最多</motion.span>
            </div>
          ))}
        </div>

        {/* 参加者行 */}
        {PARTICIPANTS.map((p, pi) => (
          <div
            key={p.name}
            className={`grid grid-cols-[64px_1fr_1fr_1fr] items-center px-3 gap-x-1 ${pi < PARTICIPANTS.length - 1 ? 'border-b border-white/6' : ''}`}
          >
            <div className="flex h-7 w-[56px] items-center justify-center rounded-lg bg-white/8 my-2.5">
              <span className="text-[12px] font-black text-white/65">{p.name}</span>
            </div>
            {SCHEDULE.map((s, di) => (
              <AnswerCell key={di} v={s.answers[pi]} show={phase > pi} delay={di * 0.07} />
            ))}
          </div>
        ))}

        {/* 第一候補カード（実際のUIと同じグリーンカードに変形） */}
        <motion.div
          className="m-3 overflow-hidden rounded-2xl px-4 pt-3 pb-3.5"
          animate={{
            background: lit ? '#3CC55A' : 'rgba(255,255,255,0.03)',
            borderColor: lit ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)',
          }}
          style={{ border: '1px solid' }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
        >
          {/* 第一候補バッジ */}
          <motion.div className="mb-2.5">
            <motion.span
              animate={{
                background: lit ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)',
                color: lit ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.25)',
              }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold"
            >✓ 第一候補</motion.span>
          </motion.div>

          {/* 日程（中央） */}
          <div className="text-center py-0.5">
            <div className="flex items-baseline justify-center gap-0.5">
              <motion.span
                animate={{ color: lit ? '#000000' : 'rgba(255,255,255,0.15)' }}
                transition={{ duration: 0.5 }}
                className="text-[30px] font-black leading-none"
              >4/29</motion.span>
              <motion.span
                animate={{ color: lit ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.12)' }}
                transition={{ duration: 0.5 }}
                className="text-[16px] font-black"
              >（水）</motion.span>
            </div>
            <motion.p
              animate={{ color: lit ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.1)' }}
              transition={{ duration: 0.5 }}
              className="mt-0.5 text-[14px] font-bold"
            >19:00〜</motion.p>
            <motion.p
              animate={{ opacity: lit ? 1 : 0, color: 'rgba(0,0,0,0.45)' }}
              transition={{ duration: 0.4, delay: 0.12 }}
              className="mt-1 text-[10px]"
            >スムーズに決めやすい候補です</motion.p>
          </div>

          {/* 参加者 */}
          <motion.div
            animate={{ opacity: lit ? 1 : 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="mt-3 flex items-center gap-1.5 pt-2.5"
            style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}
          >
            <span className="text-[9px] font-bold" style={{ color: 'rgba(0,0,0,0.4)' }}>参加</span>
            <div className="flex -space-x-1">
              {PARTICIPANTS.map((p, i) => (
                <div
                  key={i}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[7px] font-black text-white ring-1 ring-white"
                  style={{ background: p.color }}
                >{p.name[0]}</div>
              ))}
            </div>
            <span className="text-[10px] font-bold" style={{ color: 'rgba(0,0,0,0.45)' }}>
              {PARTICIPANTS.length}人
            </span>
          </motion.div>
        </motion.div>
      </div>

      <p className="shrink-0 pb-1 text-center text-[11px] text-white/35">みんなの都合がひと目でわかる</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2: 条件がそのまま使われる
   アニメ: 参加者チップ → 流れるインジケータ → 実際のお店カード画像
═══════════════════════════════════════════════════════════════ */

const PARTICIPANT_CHIPS = ['8人', '洋食', '個室あり', '割り勘']

function Slide2() {
  // phase1=チップ, phase2=フロー, phase3=お店カード
  const phase = usePhaseLoop(3, 960, 2200)

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="shrink-0 space-y-1 text-center">
        <StepBadge n={2} />
        <h2 className="text-[24px] font-black tracking-tight text-white leading-none">条件がそのまま使われる</h2>
        <p className="text-[13px] text-white/40">人数や希望から、お店を提案</p>
      </div>

      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {/* 参加者情報チップ */}
        <motion.div
          animate={{ opacity: phase >= 1 ? 1 : 0.12, y: phase >= 1 ? 0 : -10 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="shrink-0 rounded-2xl bg-white/6 ring-1 ring-white/10 px-4 pt-3.5 pb-4"
        >
          <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/25">参加者情報</p>
          <div className="flex flex-wrap gap-2">
            {PARTICIPANT_CHIPS.map((chip, i) => (
              <motion.span
                key={chip}
                animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.8 }}
                transition={{ duration: 0.3, delay: phase >= 1 ? i * 0.1 : 0 }}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white/85"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}
              >{chip}</motion.span>
            ))}
          </div>
        </motion.div>

        {/* フロー: 条件として引き継がれる */}
        <motion.div
          animate={{ opacity: phase >= 2 ? 1 : 0 }}
          transition={{ duration: 0.4 }}
          className="shrink-0 flex flex-col items-center gap-1"
        >
          <div className="h-5 w-px"
            style={{ background: 'linear-gradient(to bottom, rgba(60,197,90,0.1), rgba(60,197,90,0.5))' }} />
          <div
            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5"
            style={{ background: 'rgba(60,197,90,0.10)', border: '1px solid rgba(60,197,90,0.28)' }}
          >
            <motion.div
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: 'var(--brand)' }}
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.45, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: 'var(--brand)' }}>
              条件として引き継がれる
            </span>
          </div>
          <div className="h-5 w-px"
            style={{ background: 'linear-gradient(to bottom, rgba(60,197,90,0.5), rgba(60,197,90,0.1))' }} />
        </motion.div>

        {/* BEST お店カード（実際のスクリーンショット画像） */}
        <motion.div
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
          transition={{ duration: 0.45, type: 'spring', stiffness: 200, damping: 22 }}
          className="min-h-0 flex-1 overflow-hidden rounded-2xl"
          style={{ background: '#111' }}
        >
          <img
            src="/onboarding/store-best.png"
            alt="good spoon pizzeria&cheese 横浜モアーズ店"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </motion.div>
      </div>

      <p className="shrink-0 pb-1 text-center text-[11px] text-white/35">もう一度入力しなくていい</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   STEP 3: 送るだけでいい
   アニメ: 幹事→参加者ライン → URLバー → 日程→店→清算→写真 が積み上がる
═══════════════════════════════════════════════════════════════ */

const URL_ROWS = [
  { icon: 'schedule'   as const, label: '決まった日程', value: '4/29（水）19:00〜'       },
  { icon: 'store'      as const, label: '予約したお店', value: 'good spoon 横浜モアーズ店' },
  { icon: 'settlement' as const, label: '清算の結果',   value: '¥4,500 / 人'             },
]


function Slide3() {
  // phase 0,1 → 日程調整ビュー
  // phase 2   → 共有ページへ切り替え（空）
  // phase 3   → 日程 行
  // phase 4   → 店 行
  // phase 5   → 清算 行
  // phase 6   → 写真 行
  const phase = usePhaseLoop(6, 900, 1500)
  const showSchedule = phase < 2

  return (
    <div className="flex h-full flex-col gap-2.5">

      {/* タイトル */}
      <div className="shrink-0 space-y-1 text-center">
        <StepBadge n={3} />
        <h2 className="text-[24px] font-black tracking-tight text-white leading-none">送るだけでいい</h2>
        <p className="text-[13px] text-white/40">同じURLが、どんどん完成していく</p>
      </div>

      {/* ① 幹事 → 参加者 */}
      <div className="shrink-0 flex items-center gap-2">
        {/* 幹事: 一人アイコン + サブラベル */}
        <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-white/10">
          <User size={18} className="text-white/65" strokeWidth={2} />
          <span className="text-[8px] font-bold text-white/35">幹事</span>
        </div>

        {/* アニメーションライン */}
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <span className="text-[8px] font-bold text-brand/60">URLを送るだけ</span>
          <div className="relative h-px w-full overflow-hidden rounded-full"
            style={{ background: 'rgba(60,197,90,0.15)' }}>
            <motion.div
              className="absolute top-0 h-px rounded-full"
              style={{ background: 'var(--brand)', width: '40%' }}
              animate={{ left: ['-40%', '140%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </div>

        {/* 参加者: icon-participants + サブラベル */}
        <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-white/10">
          <FeatureIcon type="participants" size={18} />
          <span className="text-[8px] font-bold text-white/35">参加者</span>
        </div>
      </div>

      {/* ② URLバー（常に同じ） */}
      <motion.div
        className="shrink-0 flex items-center gap-2.5 rounded-xl px-4 py-3 ring-1"
        animate={{
          background: showSchedule ? 'rgba(255,255,255,0.05)' : 'rgba(60,197,90,0.08)',
          borderColor: showSchedule ? 'rgba(255,255,255,0.08)' : 'rgba(60,197,90,0.3)',
        }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: 'var(--brand)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="flex-1 font-mono text-[13px] font-bold text-white/80">
          kanji.app/e/abc123
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold ring-1"
          style={{ background: 'rgba(60,197,90,0.10)', color: 'var(--brand)', borderColor: 'rgba(60,197,90,0.22)' }}
        >同じURL</span>
      </motion.div>

      {/* ページ種別ラベル（切り替わりをここで明示） */}
      <div className="shrink-0 relative h-4">
        <AnimatePresence mode="wait">
          {showSchedule ? (
            <motion.div
              key="lbl-s"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center gap-2"
            >
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-[9px] font-bold text-white/28">参加者が回答するページ</span>
              <div className="h-px flex-1 bg-white/8" />
            </motion.div>
          ) : (
            <motion.div
              key="lbl-c"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, type: 'spring', stiffness: 260, damping: 22 }}
              className="absolute inset-0 flex items-center gap-2"
            >
              <div className="h-px flex-1" style={{ background: 'rgba(60,197,90,0.35)' }} />
              <span className="text-[9px] font-bold" style={{ color: 'var(--brand)' }}>✓ 共有ページが完成</span>
              <div className="h-px flex-1" style={{ background: 'rgba(60,197,90,0.35)' }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ③ 切り替わるコンテンツ */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {showSchedule ? (
            /* 日程調整ビュー */
            <motion.div
              key="schedule"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.22 } }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-white/6 ring-1 ring-white/10"
            >
              {/* ページラベル */}
              <div className="flex shrink-0 items-center gap-1.5 border-b border-white/8 px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }} />
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">日程調整ページ</p>
              </div>

              {/* テーブルヘッダー */}
              <div className="shrink-0 grid grid-cols-[52px_1fr_1fr_1fr] gap-x-1 border-b border-white/6 px-3 py-2">
                <div />
                {SCHEDULE.map((s, i) => (
                  <div key={i} className="space-y-0.5 text-center">
                    <p className={`text-[9px] font-bold leading-none ${s.best ? 'text-brand' : 'text-white/30'}`}>
                      {s.label}
                    </p>
                    {s.best && (
                      <span className="inline-block rounded-full px-1.5 py-px text-[7px] font-black text-black"
                        style={{ background: 'var(--brand)' }}>最多</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 参加者行 */}
              {PARTICIPANTS.map((p, pi) => (
                <div
                  key={p.name}
                  className={`shrink-0 grid grid-cols-[52px_1fr_1fr_1fr] items-center gap-x-1 px-3 py-2 ${pi < PARTICIPANTS.length - 1 ? 'border-b border-white/5' : ''}`}
                >
                  <div className="flex h-6 w-[46px] items-center justify-center rounded-md bg-white/8">
                    <span className="text-[11px] font-black text-white/60">{p.name}</span>
                  </div>
                  {SCHEDULE.map((s, di) => {
                    const v = s.answers[pi]
                    const color = v === '○' ? '#3CC55A' : v === '△' ? '#F59E0B' : '#EF4444'
                    return (
                      <div key={di} className="flex items-center justify-center">
                        <span className="text-[17px] font-black" style={{ color }}>{v}</span>
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* 第一候補カード（残りスペースを緑カードで埋める） */}
              <div className="min-h-0 flex-1 overflow-hidden p-2.5 pt-2">
                <div className="flex h-full flex-col rounded-xl px-4 py-3" style={{ background: '#3CC55A' }}>
                  <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold text-black/65"
                    style={{ background: 'rgba(0,0,0,0.12)' }}>✓ 第一候補</span>
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[26px] font-black leading-none text-black">4/29</span>
                      <span className="text-[15px] font-black text-black/75">（水）</span>
                    </div>
                    <p className="mt-0.5 text-[13px] font-bold text-black/55">19:00〜</p>
                    <p className="mt-1 text-[9px] text-black/40">スムーズに決めやすい候補です</p>
                  </div>
                  <div className="flex items-center gap-1.5 border-t pt-2" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                    <span className="text-[8px] font-bold text-black/40">参加</span>
                    <div className="flex -space-x-1">
                      {PARTICIPANTS.map((p, i) => (
                        <div key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[7px] font-black text-white ring-1 ring-white"
                          style={{ background: p.color }}
                        >{p.name[0]}</div>
                      ))}
                    </div>
                    <span className="text-[9px] font-bold text-black/45">3人</span>
                  </div>
                </div>
              </div>
            </motion.div>

          ) : (
            /* 会の共有ページ（中身が育っていく） */
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.22 } }}
              transition={{ duration: 0.32, type: 'spring', stiffness: 220, damping: 24 }}
              className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10"
            >
              {/* カードヘッダー */}
              <div className="shrink-0 border-b border-white/8 px-4 py-2.5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/22">会の共有ページ</p>
                <p className="mt-0.5 text-[14px] font-black text-white">田中さん歓迎会</p>
              </div>

              {/* URL行（shrink-0で固定高さ） */}
              <div className="shrink-0 divide-y divide-white/6">
                {URL_ROWS.map((row, i) => (
                  <motion.div
                    key={row.icon}
                    initial={false}
                    animate={{ opacity: phase > i + 2 ? 1 : 0, y: phase > i + 2 ? 0 : -8 }}
                    transition={{ duration: 0.3, type: 'spring', stiffness: 260, damping: 26 }}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <FeatureIcon type={row.icon} size={17} />
                    <div>
                      <p className="text-[9px] font-bold text-white/30">{row.label}</p>
                      <p className="text-[13px] font-black text-white/80">{row.value}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* 写真: 残りスペースをすべて埋める */}
              <motion.div
                initial={false}
                animate={{ opacity: phase > 5 ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                className="min-h-0 flex-1 overflow-hidden border-t border-white/6"
              >
                <img
                  src="/onboarding/event-photo.png"
                  alt="会の写真"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="shrink-0 pb-1 text-center text-[11px] text-white/35">
        送るだけで、会の情報が揃っていく
      </p>
    </div>
  )
}
