'use client'

import { useRef, useState } from 'react'
import {
  ChevronDown, ChevronUp, CreditCard, Receipt, Users,
  SlidersHorizontal, UserPlus, X, Check,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  type SettlementConfig,
  type SettlementMode,
  type GradientConfig,
  type ParticipantRole,
  ROLES,
  roundUp100,
  formatYen,
} from '@/app/lib/settlement'
import {
  type OrganizerSettings,
  saveOrganizerSettings,
  hasPaymentInfo,
  toGradientConfig,
} from '@/app/lib/organizer-settings'
import { ToggleSwitch } from '@/app/components/ui'

type Person = { id: string; name: string }

export type SettlementDraft = {
  party1Ids: string[]
  party1Amount: string
  party1Gradient: boolean
  party1ExtraMembers: Person[]
  showParty2: boolean
  party2Ids: string[]
  party2Amount: string
  party2Gradient: boolean
  party2ExtraMembers: Person[]
  roles: Record<string, ParticipantRole>
  gradient: GradientConfig
  mode: SettlementMode
  fixedAmounts: Record<string, string>
}

// ─── ロールバッジ色 ────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<ParticipantRole, { active: string; inactive: string }> = {
  主賓: { active: 'bg-amber-500/20 text-amber-400 ring-amber-500/30', inactive: 'bg-white/8 text-white/35 ring-white/8' },
  上長: { active: 'bg-violet-500/20 text-violet-400 ring-violet-500/30', inactive: 'bg-white/8 text-white/35 ring-white/8' },
  先輩: { active: 'bg-sky-500/20 text-sky-400 ring-sky-500/30', inactive: 'bg-white/8 text-white/35 ring-white/8' },
  通常: { active: 'bg-white/15 text-white/80 ring-white/20', inactive: 'bg-white/8 text-white/35 ring-white/8' },
}

// ─── 送金先ボトムシート ────────────────────────────────────────────────────────

function OrganizerSheet({
  settings,
  onSave,
  onClose,
}: {
  settings: OrganizerSettings
  onSave: (s: OrganizerSettings) => void
  onClose: () => void
}) {
  const [form, setForm] = useState(settings)
  const [showBank, setShowBank] = useState(false)

  const handleSave = () => {
    saveOrganizerSettings(form)
    onSave(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
      <motion.div
        className="absolute bottom-0 left-0 right-0 mx-auto max-w-xl rounded-t-3xl pb-10 pt-2"
        style={{ background: '#1a1a1a' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="px-5 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">送金先の設定</p>
            <h3 className="mt-1 text-[18px] font-black text-white">幹事情報</h3>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold text-white/40">幹事名</label>
            <input
              type="text"
              value={form.organizerName}
              onChange={(e) => setForm((f) => ({ ...f, organizerName: e.target.value }))}
              placeholder="山田太郎"
              className="w-full rounded-xl bg-white/8 px-4 py-3 text-base text-white outline-none ring-1 ring-white/10 placeholder:text-white/20 focus:ring-white/20 transition"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold text-white/40">PayPay ID（任意）</label>
            <input
              type="text"
              value={form.paypayId}
              onChange={(e) => setForm((f) => ({ ...f, paypayId: e.target.value }))}
              placeholder="yamada_taro"
              className="w-full rounded-xl bg-white/8 px-4 py-3 text-base text-white outline-none ring-1 ring-white/10 placeholder:text-white/20 focus:ring-white/20 transition"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowBank((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-white/35 underline"
          >
            <CreditCard size={11} />
            {showBank ? '銀行口座を閉じる' : '銀行口座を入力する（任意）'}
          </button>

          {showBank && (
            <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/8">
              {[
                { key: 'bankName', label: '銀行名', placeholder: 'みずほ銀行' },
                { key: 'branchName', label: '支店名', placeholder: '渋谷支店' },
                { key: 'accountNumber', label: '口座番号', placeholder: '1234567' },
                { key: 'accountName', label: '口座名義（カナ）', placeholder: 'ヤマダタロウ' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-[10px] font-bold text-white/35">{label}</label>
                  <input
                    type="text"
                    value={((form as unknown) as Record<string, string>)[key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-xl bg-white/8 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/20 focus:ring-white/20 transition"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[10px] font-bold text-white/35">口座種別</label>
                <div className="flex gap-2">
                  {['普通', '当座'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, accountType: t }))}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
                        form.accountType === t
                          ? 'bg-white/15 text-white ring-white/20'
                          : 'bg-white/5 text-white/35 ring-white/8'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition active:scale-[0.98]"
            style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)' }}
          >
            保存する
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── メンバー追加ミニシート ────────────────────────────────────────────────────

function AddMemberSheet({
  onAdd,
  onClose,
}: {
  onAdd: (name: string) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')

  const handleAdd = () => {
    const names = input
      .split(/[、,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) return
    names.forEach((n) => onAdd(n))
    onClose()
  }

  const preview = input
    .split(/[、,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
      <motion.div
        className="absolute bottom-0 left-0 right-0 mx-auto max-w-xl rounded-t-3xl pb-10 pt-2"
        style={{ background: '#1a1a1a' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="px-5 space-y-3">
          <div>
            <p className="text-sm font-black text-white">メンバーを追加</p>
            <p className="mt-0.5 text-[11px] text-white/35">
              読点（、）またはカンマ（,）で区切ると複数まとめて追加できます
            </p>
          </div>
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            placeholder="例: 田中、伊藤、佐藤"
            className="w-full rounded-xl bg-white/8 px-4 py-3 text-base text-white outline-none ring-1 ring-white/10 placeholder:text-white/20 focus:ring-white/20 transition"
          />
          {/* プレビューチップ */}
          {preview.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {preview.map((n, i) => (
                <span
                  key={i}
                  className="rounded-full bg-emerald-500/15 px-3 py-1 text-[12px] font-bold text-emerald-400 ring-1 ring-emerald-500/25"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={preview.length === 0}
            className="w-full rounded-2xl py-3 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-30"
            style={{ background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)' }}
          >
            {preview.length > 1 ? `${preview.length}人を追加する` : '追加する'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── 傾斜係数スライダー（アコーディオンなし・カード内インライン用） ─────────────

function GradientSliders({
  participantIds,
  roles,
  gradient,
  onGradientChange,
  totalAmount,
}: {
  participantIds: string[]
  roles: Record<string, ParticipantRole>
  gradient: GradientConfig
  onGradientChange: (g: GradientConfig) => void
  totalAmount: number
}) {
  const previewEnabled = totalAmount > 0
  const totalWeight = participantIds.reduce((sum, id) => {
    const role = roles[id] ?? '通常'
    return sum + (gradient[role] ?? 1.0)
  }, 0)
  const activeRoles = new Set(participantIds.map((id) => roles[id] ?? '通常'))

  const previewAmount = (coeff: number): number => {
    if (!previewEnabled || totalWeight <= 0) return 0
    return coeff === 0 ? 0 : roundUp100((totalAmount * coeff) / totalWeight)
  }
  const normalAmt = previewAmount(gradient['通常'])

  const blurActiveInput = () => {
    const el = document.activeElement as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur()
  }

  return (
    <div className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal size={11} className="text-white/35" strokeWidth={2} />
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">傾斜係数</p>
      </div>

      {/* 主賓：固定 0 */}
      <div className={`flex items-center justify-between ${activeRoles.has('主賓') ? '' : 'opacity-25'}`}>
        <span className="text-sm font-bold text-white/70">主賓</span>
        <div className="flex items-baseline gap-3">
          {previewEnabled && activeRoles.has('主賓') && (
            <span className="text-sm font-medium text-amber-400">¥0</span>
          )}
          <span className="w-8 text-right text-sm font-black text-white/30">0.0</span>
        </div>
      </div>

      {(['上長', '先輩', '通常'] as const).map((role) => {
        const isPresent = activeRoles.has(role)
        const amt = previewAmount(gradient[role])
        const diff = amt - normalAmt
        return (
          <div key={role} className={!isPresent ? 'opacity-25 pointer-events-none' : ''}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-white/70">{role}</span>
              <div className="flex items-baseline gap-3">
                {previewEnabled && isPresent && (
                  <span className="text-sm font-bold text-white/80">
                    ¥{formatYen(amt)}
                    {role !== '通常' && diff > 0 && (
                      <span className="ml-1.5 text-[11px] text-white/35">+¥{formatYen(diff)}</span>
                    )}
                  </span>
                )}
                {!isPresent ? (
                  <span className="w-8 text-right text-sm font-black text-white/25">—</span>
                ) : (
                  <span className="w-8 text-right text-sm font-black text-white/80">
                    {gradient[role].toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={2.0}
              step={0.1}
              value={gradient[role]}
              onTouchStart={blurActiveInput}
              onChange={(e) =>
                onGradientChange({ ...gradient, [role]: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.75) ${(gradient[role] / 2.0) * 100}%, rgba(255,255,255,0.12) ${(gradient[role] / 2.0) * 100}%)`,
              }}
            />
            <div className="flex justify-between text-[10px] text-white/20">
              <span>0</span>
              <span>2.0</span>
            </div>
          </div>
        )
      })}

      {!previewEnabled && (
        <p className="text-[11px] text-white/25">金額を入力すると役割ごとの目安が表示されます。</p>
      )}
    </div>
  )
}

// ─── 金額指定セクション ────────────────────────────────────────────────────────

function FixedAmountRows({
  participants,
  selectedIds,
  totalAmount,
  fixedAmounts,
  onFixedAmountChange,
}: {
  participants: Person[]
  selectedIds: string[]
  totalAmount: number
  fixedAmounts: Record<string, string>
  onFixedAmountChange: (id: string, value: string) => void
}) {
  const members = selectedIds
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Person => !!p)

  const fixedSum = members.reduce((sum, m) => {
    const v = fixedAmounts[m.id]
    return sum + (v ? parseInt(v, 10) || 0 : 0)
  }, 0)
  const freeMembers = members.filter((m) => !fixedAmounts[m.id])
  const remaining = Math.max(0, totalAmount - fixedSum)
  const perFree = freeMembers.length > 0 ? roundUp100(remaining / freeMembers.length) : 0
  const overBudget = totalAmount > 0 && fixedSum > totalAmount

  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">金額指定</p>
      <div className="space-y-2.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <span className="w-16 shrink-0 truncate text-sm font-bold text-white/70">{m.name}</span>
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="numeric"
                value={fixedAmounts[m.id] ?? ''}
                onChange={(e) =>
                  onFixedAmountChange(m.id, e.target.value.replace(/[^0-9]/g, ''))
                }
                placeholder="自動で割る"
                className="w-full rounded-xl bg-white/8 px-3 py-2.5 pr-9 text-right text-base font-bold text-white outline-none ring-1 ring-white/10 placeholder:font-normal placeholder:text-white/20 focus:ring-white/20 transition"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-white/30">円</span>
            </div>
          </div>
        ))}
      </div>
      {totalAmount > 0 && (
        <div className={`rounded-xl px-3 py-2 text-xs leading-5 ${
          overBudget ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20' : 'bg-white/5 text-white/40'
        }`}>
          {overBudget ? (
            <p className="font-bold">固定金額の合計（{formatYen(fixedSum)}円）が会計総額を超えています。</p>
          ) : (
            <p>
              残額 <span className="font-bold text-white/65">{formatYen(remaining)}円</span>
              {freeMembers.length > 0 ? (
                <> → {freeMembers.length}人で <span className="font-bold text-white/65">{formatYen(perFree)}円</span>/人（自動）</>
              ) : '（全員指定済み）'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 会カード（1次会 / 2次会）────────────────────────────────────────────────

function PartyCard({
  label,
  isSecond = false,
  baseParticipants,
  extraMembers,
  onAddExtraMember,
  onRemoveExtraMember,
  selectedIds,
  onToggle,
  amount,
  onAmountChange,
  useGradient,
  onGradientToggle,
  mode,
  roles,
  onRoleChange,
  gradient,
  onGradientChange,
  fixedAmounts,
  onFixedAmountChange,
  isToolMode = false,
}: {
  label: string
  isSecond?: boolean
  baseParticipants: Person[]
  extraMembers: Person[]
  onAddExtraMember: (p: Person) => void
  onRemoveExtraMember: (id: string) => void
  selectedIds: string[]
  onToggle: (id: string) => void
  amount: string
  onAmountChange: (v: string) => void
  useGradient: boolean
  onGradientToggle: (v: boolean) => void
  mode: SettlementMode
  roles: Record<string, ParticipantRole>
  onRoleChange: (id: string, role: ParticipantRole) => void
  gradient: GradientConfig
  onGradientChange: (g: GradientConfig) => void
  fixedAmounts: Record<string, string>
  onFixedAmountChange: (id: string, value: string) => void
  isToolMode?: boolean
}) {
  const [showAddMember, setShowAddMember] = useState(false)
  const allParticipants = [...baseParticipants, ...extraMembers]
  const totalAmt = parseInt(amount, 10) || 0
  const hasNoMembers = allParticipants.length === 0

  return (
    <>
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/8" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {/* ヘッダー行 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10">
              <span className="text-[9px] font-black text-white/55">{label[0]}</span>
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45">{label}</p>
          </div>
          {/* ツールモードかつメンバー0のときは大きいCTAを出すのでここは非表示 */}
          {!(isToolMode && hasNoMembers) && (
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1.5 text-[11px] font-bold text-white/40 ring-1 ring-white/10 transition hover:bg-white/12 active:scale-95"
            >
              <UserPlus size={10} strokeWidth={2.5} />
              メンバー追加
            </button>
          )}
        </div>

        {/* ツールモードでメンバー0のとき: 目立つ追加CTA */}
        {isToolMode && hasNoMembers && (
          <div className="mx-4 mb-4 overflow-hidden rounded-xl ring-1 ring-white/12" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="flex w-full items-center justify-center gap-2.5 px-4 py-5 text-white/70 transition hover:text-white active:scale-[0.98]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                <UserPlus size={16} strokeWidth={2} className="text-emerald-400" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-black text-white/80">メンバーを追加する</p>
                <p className="text-[11px] text-white/35">参加人数を入力して計算します</p>
              </div>
            </button>
          </div>
        )}

        {/* メンバーチップ */}
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {allParticipants.map((p) => {
            const active = selectedIds.includes(p.id)
            const isExtra = extraMembers.some((e) => e.id === p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(p.id)}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30'
                    : 'bg-white/5 text-white/30 ring-white/8'
                }`}
              >
                {p.name}
                {isExtra && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveExtraMember(p.id) }}
                    className="ml-0.5 text-white/30 hover:text-white/60"
                  >
                    <X size={9} strokeWidth={2.5} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 合計会計 */}
        <div className="border-t border-white/6 px-4 py-4">
          <p className="mb-2 text-[11px] font-bold text-white/40">合計会計</p>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="例: 10000"
              className="w-full rounded-xl bg-white/8 px-4 py-3.5 pr-10 text-right text-[22px] font-black text-white outline-none ring-1 ring-white/10 placeholder:text-[18px] placeholder:font-normal placeholder:text-white/18 focus:ring-white/22 transition"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/30">円</span>
          </div>
        </div>

        {/* 傾斜 ON/OFF（gradient mode のみ）→ 金額の直後 */}
        {mode === 'gradient' && (
          <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5">
            <div>
              <span className="text-sm font-bold text-white/70">傾斜配分</span>
              <span className="ml-2 text-[11px] text-white/35">
                {useGradient ? '役割で変わる' : '均等割り'}
              </span>
            </div>
            <ToggleSwitch checked={useGradient} onChange={onGradientToggle} />
          </div>
        )}

        {/* 役割設定（傾斜ON時・トグルとスライダーの間） */}
        {mode === 'gradient' && useGradient && selectedIds.length > 0 && (
          <div className="border-t border-white/6 px-4 py-3">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Users size={11} className="text-white/30" strokeWidth={2.5} />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">役割設定</p>
            </div>
            <div className="space-y-2.5">
              {selectedIds
                .map((id) => [...baseParticipants, ...extraMembers].find((p) => p.id === id))
                .filter((p): p is Person => !!p)
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 truncate text-sm font-bold text-white/60">{p.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES.map((role) => {
                        const active = roles[p.id] === role
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => onRoleChange(p.id, role)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition active:scale-95 ${
                              active ? ROLE_COLORS[role].active : ROLE_COLORS[role].inactive
                            }`}
                          >
                            {role}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 傾斜係数（ON 時のみ・インライン） */}
        {mode === 'gradient' && useGradient && (
          <div className="border-t border-white/6">
            <GradientSliders
              participantIds={selectedIds}
              roles={roles}
              gradient={gradient}
              onGradientChange={onGradientChange}
              totalAmount={totalAmt}
            />
          </div>
        )}

        {/* 金額指定（fixed_amount mode） */}
        {mode === 'fixed_amount' && selectedIds.length > 0 && (
          <div className="border-t border-white/6">
            <FixedAmountRows
              participants={allParticipants}
              selectedIds={selectedIds}
              totalAmount={totalAmt}
              fixedAmounts={fixedAmounts}
              onFixedAmountChange={onFixedAmountChange}
            />
          </div>
        )}

        {isSecond && (
          <p className="px-4 pb-3 text-[11px] leading-5 text-white/25">
            2次会は参加しない人も多いので、必要に応じて外してください。
          </p>
        )}
      </div>

      {/* メンバー追加シート */}
      <AnimatePresence>
        {showAddMember && (
          <AddMemberSheet
            onAdd={(name) => onAddExtraMember({ id: `extra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name })}
            onClose={() => setShowAddMember(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

type Props = {
  participants: Person[]
  organizerSettings: OrganizerSettings
  onSaveSettings: (s: OrganizerSettings) => void
  /** config + 全参加者（base + extra）を渡す。calcSettlement の ID→名前解決に使用 */
  onSubmit: (config: SettlementConfig, allParticipants: Person[]) => void
  onBack: () => void
  initialDraft?: SettlementDraft | null
  onSaveDraft?: (draft: SettlementDraft) => void
  isToolMode?: boolean
}

export function SettlementStep({
  participants,
  organizerSettings,
  onSaveSettings,
  onSubmit,
  onBack: _onBack,
  initialDraft,
  onSaveDraft,
  isToolMode = false,
}: Props) {
  // ── 清算モード ──
  const [mode, setMode] = useState<SettlementMode>(initialDraft?.mode ?? 'gradient')

  // ── 1次会 ──
  const [party1Ids, setParty1Ids] = useState<string[]>(
    initialDraft?.party1Ids ?? participants.map((p) => p.id)
  )
  const [party1Amount, setParty1Amount] = useState(initialDraft?.party1Amount ?? '')
  const [party1Gradient, setParty1Gradient] = useState(initialDraft?.party1Gradient ?? true)
  const [party1ExtraMembers, setParty1ExtraMembers] = useState<Person[]>(
    initialDraft?.party1ExtraMembers ?? []
  )

  // ── 2次会 ──
  const [showParty2, setShowParty2] = useState(initialDraft?.showParty2 ?? false)
  const [party2Ids, setParty2Ids] = useState<string[]>(initialDraft?.party2Ids ?? [])
  const [party2Amount, setParty2Amount] = useState(initialDraft?.party2Amount ?? '')
  const [party2Gradient, setParty2Gradient] = useState(initialDraft?.party2Gradient ?? false)
  const [party2ExtraMembers, setParty2ExtraMembers] = useState<Person[]>(
    initialDraft?.party2ExtraMembers ?? []
  )

  // ── 役割 ──
  const [roles, setRoles] = useState<Record<string, ParticipantRole>>(() => {
    if (initialDraft?.roles) return initialDraft.roles
    const r: Record<string, ParticipantRole> = {}
    participants.forEach((p) => { r[p.id] = '通常' })
    return r
  })

  // ── 傾斜設定 ──
  const [gradient, setGradient] = useState<GradientConfig>(() =>
    initialDraft?.gradient ?? toGradientConfig(organizerSettings.defaultGradient)
  )

  // ── 金額指定（fixed_amount モード） ──
  const [fixedAmounts, setFixedAmounts] = useState<Record<string, string>>(
    initialDraft?.fixedAmounts ?? {}
  )
  const setFixedAmount = (id: string, value: string) => {
    setFixedAmounts((prev) => ({ ...prev, [id]: value }))
  }

  // ── 送金先シート ──
  const [showOrganizerSheet, setShowOrganizerSheet] = useState(false)

  // ── helper ──
  const toggle = (id: string, ids: string[], setIds: (v: string[]) => void) => {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  const addExtraMember1 = (p: Person) => {
    setParty1ExtraMembers((prev) => [...prev, p])
    setParty1Ids((prev) => [...prev, p.id])
    setRoles((r) => ({ ...r, [p.id]: '通常' }))
  }
  const removeExtraMember1 = (id: string) => {
    setParty1ExtraMembers((prev) => prev.filter((p) => p.id !== id))
    setParty1Ids((prev) => prev.filter((x) => x !== id))
  }
  const addExtraMember2 = (p: Person) => {
    setParty2ExtraMembers((prev) => [...prev, p])
    setParty2Ids((prev) => [...prev, p.id])
    setRoles((r) => ({ ...r, [p.id]: '通常' }))
  }
  const removeExtraMember2 = (id: string) => {
    setParty2ExtraMembers((prev) => prev.filter((p) => p.id !== id))
    setParty2Ids((prev) => prev.filter((x) => x !== id))
  }

  // ── バリデーション ──
  const party1TotalAmt = parseInt(party1Amount, 10) || 0
  const party1FixedSum = party1Ids.reduce((sum, id) => {
    const v = fixedAmounts[id]
    return sum + (v ? parseInt(v, 10) || 0 : 0)
  }, 0)
  const party1OverBudget = mode === 'fixed_amount' && party1TotalAmt > 0 && party1FixedSum > party1TotalAmt

  const canSubmit =
    party1Amount.trim() !== '' &&
    party1TotalAmt > 0 &&
    party1Ids.length > 0 &&
    !party1OverBudget

  // ── 送信 ──
  const handleSubmit = () => {
    if (!canSubmit) return
    const fixedAmountsNum: Record<string, number | null> = {}
    if (mode === 'fixed_amount') {
      ;[...participants, ...party1ExtraMembers, ...party2ExtraMembers].forEach((p) => {
        const v = fixedAmounts[p.id]
        fixedAmountsNum[p.id] = v ? parseInt(v, 10) : null
      })
    }
    const parties: SettlementConfig['parties'] = [
      {
        id: '1次会',
        participantIds: party1Ids,
        totalAmount: parseInt(party1Amount.replace(/,/g, ''), 10) || 0,
        useGradient: party1Gradient,
      },
    ]
    if (showParty2 && party2Amount.trim() !== '' && party2Ids.length > 0) {
      parties.push({
        id: '2次会',
        participantIds: party2Ids,
        totalAmount: parseInt(party2Amount.replace(/,/g, ''), 10) || 0,
        useGradient: party2Gradient,
      })
    }
    onSaveDraft?.({
      party1Ids, party1Amount, party1Gradient, party1ExtraMembers,
      showParty2, party2Ids, party2Amount, party2Gradient, party2ExtraMembers,
      roles, gradient, mode, fixedAmounts,
    })
    // base + extra を合わせて渡す（ID→名前解決のため）
    const allParticipantsForCalc = [
      ...participants,
      ...party1ExtraMembers,
      ...party2ExtraMembers.filter((p) => !party1ExtraMembers.some((e) => e.id === p.id)),
    ]
    onSubmit({ parties, roles, gradient, mode, fixedAmounts: fixedAmountsNum }, allParticipantsForCalc)
  }

  const isPaid = hasPaymentInfo(organizerSettings)
  const allParty1 = [...participants, ...party1ExtraMembers]
  const allParty2 = [...participants, ...party2ExtraMembers]

  return (
    <>
      <motion.div
        className="space-y-4 pb-28"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {/* ── ヘッダー（送金先チップ右上） ── */}
        <div className="px-0.5">
          <div className="mb-2 flex items-center justify-between">
            {!isToolMode && (
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
                  <Receipt size={13} className="text-white" strokeWidth={2.5} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Step 3 · 会計精算</p>
              </div>
            )}
            {isToolMode && <div />}
            {/* 送金先チップ */}
            <button
              type="button"
              onClick={() => setShowOrganizerSheet(true)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 transition active:scale-95 ${
                isPaid
                  ? 'bg-emerald-500/12 text-emerald-400 ring-emerald-500/25'
                  : 'bg-white/8 text-white/40 ring-white/12 hover:bg-white/12'
              }`}
            >
              <CreditCard size={11} strokeWidth={2.5} />
              {isPaid ? (
                <><Check size={9} strokeWidth={3} />送金先 設定済み</>
              ) : '送金先を設定'}
            </button>
          </div>
          <h2 className="text-[22px] font-black tracking-tight text-white">会計計算</h2>
        </div>

        {/* ── 清算方法セレクター ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-4 ring-1 ring-white/8">
          <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-white/35">清算方法</p>
          <div className="flex rounded-xl bg-white/8 p-0.5">
            {(
              [
                { value: 'gradient', label: '傾斜配分' },
                { value: 'fixed_amount', label: '金額を直接指定' },
              ] as { value: SettlementMode; label: string }[]
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex-1 rounded-[10px] py-2 text-xs font-bold transition ${
                  mode === value
                    ? 'bg-white/12 text-white shadow-sm'
                    : 'text-white/35 hover:text-white/55'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-white/30">
            {mode === 'gradient'
              ? '役割（主賓・上長・先輩）に応じて金額が変わります。'
              : '人ごとに金額を指定できます。未入力の人は残額を自動で割ります。'}
          </p>
        </div>

        {/* ── 1次会カード ── */}
        <PartyCard
          label="1次会"
          baseParticipants={participants}
          extraMembers={party1ExtraMembers}
          onAddExtraMember={addExtraMember1}
          onRemoveExtraMember={removeExtraMember1}
          selectedIds={party1Ids}
          onToggle={(id) => toggle(id, party1Ids, setParty1Ids)}
          amount={party1Amount}
          onAmountChange={setParty1Amount}
          useGradient={party1Gradient}
          onGradientToggle={setParty1Gradient}
          mode={mode}
          roles={roles}
          onRoleChange={(id, role) => setRoles((r) => ({ ...r, [id]: role }))}
          gradient={gradient}
          onGradientChange={setGradient}
          fixedAmounts={fixedAmounts}
          onFixedAmountChange={setFixedAmount}
          isToolMode={isToolMode}
        />

        {/* ── 2次会 ── */}
        {!showParty2 ? (
          <button
            type="button"
            onClick={() => {
              setShowParty2(true)
              setParty2Ids(party1Ids.slice())
            }}
            className="w-full rounded-2xl border border-dashed border-white/15 py-3.5 text-sm font-bold text-white/30 transition hover:border-white/25 hover:text-white/50 active:scale-[0.98]"
          >
            ＋ 2次会を追加する
          </button>
        ) : (
          <div className="space-y-3">
            <PartyCard
              label="2次会"
              isSecond
              baseParticipants={participants}
              extraMembers={party2ExtraMembers}
              onAddExtraMember={addExtraMember2}
              onRemoveExtraMember={removeExtraMember2}
              selectedIds={party2Ids}
              onToggle={(id) => toggle(id, party2Ids, setParty2Ids)}
              amount={party2Amount}
              onAmountChange={setParty2Amount}
              useGradient={party2Gradient}
              onGradientToggle={setParty2Gradient}
              mode={mode}
              roles={roles}
              onRoleChange={(id, role) => setRoles((r) => ({ ...r, [id]: role }))}
              gradient={gradient}
              onGradientChange={setGradient}
              fixedAmounts={fixedAmounts}
              onFixedAmountChange={setFixedAmount}
            />
            <button
              type="button"
              onClick={() => { setShowParty2(false); setParty2Ids([]) }}
              className="text-xs text-white/30 underline"
            >
              2次会を削除
            </button>
          </div>
        )}

        {/* ── CTA（ダーク背景）── */}
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-4" style={{
          background: 'linear-gradient(to top, #171717 60%, rgba(23,23,23,0) 100%)',
        }}>
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-2xl py-4 text-sm font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                background: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)',
                boxShadow: '0 6px 24px rgba(20,83,45,0.5), inset 0 1px 0 rgba(255,255,255,0.14)',
              }}
            >
              計算して確認する →
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── 送金先シート ── */}
      <AnimatePresence>
        {showOrganizerSheet && (
          <OrganizerSheet
            settings={organizerSettings}
            onSave={onSaveSettings}
            onClose={() => setShowOrganizerSheet(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
