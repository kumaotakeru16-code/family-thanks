'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, User, CreditCard, Receipt, Users, SlidersHorizontal, Info } from 'lucide-react'
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

type Person = { id: string; name: string }

export type SettlementDraft = {
  party1Ids: string[]
  party1Amount: string
  party1Gradient: boolean
  showParty2: boolean
  party2Ids: string[]
  party2Amount: string
  party2Gradient: boolean
  roles: Record<string, ParticipantRole>
  gradient: GradientConfig
  mode: SettlementMode
  fixedAmounts: Record<string, string>
}

type Props = {
  participants: Person[]
  organizerSettings: OrganizerSettings
  onSaveSettings: (s: OrganizerSettings) => void
  onSubmit: (config: SettlementConfig) => void
  onBack: () => void
  initialDraft?: SettlementDraft | null
  onSaveDraft?: (draft: SettlementDraft) => void
}

// ── 会設定セクション ─────────────────────────────────────────────────────────

function PartySection({
  label,
  isSecond,
  participants,
  selectedIds,
  onToggle,
  amount,
  onAmountChange,
  useGradient,
  onGradientToggle,
  hideGradientToggle,
}: {
  label: string
  isSecond?: boolean
  participants: Person[]
  selectedIds: string[]
  onToggle: (id: string) => void
  amount: string
  onAmountChange: (v: string) => void
  useGradient: boolean
  onGradientToggle: (v: boolean) => void
  hideGradientToggle?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
      <div className="mb-3 flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-stone-900">
          <span className="text-[9px] font-black text-white">{label[0]}</span>
        </div>
        <p className="text-[11px] font-black uppercase tracking-wider text-stone-700">{label}</p>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {participants.map((p) => {
          const active = selectedIds.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                active
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {p.name}
            </button>
          )
        })}
      </div>

      {isSecond && (
        <div className="mb-3 flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0 text-stone-300" strokeWidth={2} />
          <p className="text-[11px] leading-5 text-stone-400">
            2次会は参加しない人も多いので、必要に応じて外してください。
          </p>
        </div>
      )}

      <div className="mb-3">
        <label className="mb-1.5 block text-[11px] font-bold text-stone-500">合計会計</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="例: 10000"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 pr-9 text-right text-base font-bold text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-400">円</span>
        </div>
      </div>

      {!hideGradientToggle && (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-stone-700">傾斜配分</span>
            <span className="ml-2 text-[11px] text-stone-400">
              {useGradient ? 'あり（役割で変わる）' : 'なし（均等割り）'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onGradientToggle(!useGradient)}
            className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${
              useGradient ? 'bg-stone-900' : 'bg-stone-200'
            }`}
            aria-pressed={useGradient}
          >
            <span
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                useGradient ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}
    </div>
  )
}

// ── 金額指定セクション ────────────────────────────────────────────────────────

function FixedAmountSection({
  label,
  participants,
  selectedIds,
  totalAmount,
  fixedAmounts,
  onFixedAmountChange,
}: {
  label: string
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
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
      <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-stone-500">
        {label} — 金額指定
      </p>

      <div className="space-y-2.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <span className="w-16 shrink-0 truncate text-sm font-bold text-stone-800">{m.name}</span>
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="numeric"
                value={fixedAmounts[m.id] ?? ''}
                onChange={(e) =>
                  onFixedAmountChange(m.id, e.target.value.replace(/[^0-9]/g, ''))
                }
                placeholder="自動で割る"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 pr-9 text-right text-base font-bold text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white placeholder:font-normal placeholder:text-stone-300"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-400">円</span>
            </div>
          </div>
        ))}
      </div>

      {totalAmount > 0 && (
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs leading-5 ${
            overBudget
              ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
              : 'bg-stone-50 text-stone-500'
          }`}
        >
          {overBudget ? (
            <p className="font-bold">
              固定金額の合計（{formatYen(fixedSum)}円）が会計総額を超えています。金額を見直してください。
            </p>
          ) : (
            <p>
              残額{' '}
              <span className="font-bold text-stone-700">{formatYen(remaining)}円</span>
              {freeMembers.length > 0 ? (
                <>
                  {' '}→ {freeMembers.length}人で{' '}
                  <span className="font-bold text-stone-700">{formatYen(perFree)}円</span>
                  /人（自動）
                </>
              ) : (
                '（全員指定済み）'
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── 幹事設定カード ────────────────────────────────────────────────────────────

function OrganizerSettingsCard({
  settings,
  onSave,
}: {
  settings: OrganizerSettings
  onSave: (s: OrganizerSettings) => void
}) {
  const [open, setOpen] = useState(!settings.organizerName)
  const [form, setForm] = useState(settings)
  const [showBank, setShowBank] = useState(false)

  const isPaid = hasPaymentInfo(settings)

  const handleSave = () => {
    saveOrganizerSettings(form)
    onSave(form)
    setOpen(false)
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2">
          <User size={13} className="text-stone-400" />
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">幹事設定</p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              {settings.organizerName
                ? `${settings.organizerName}${isPaid ? '　送金先 ✓' : '　送金先未設定'}`
                : '名前と送金先を設定しておくと便利です'}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={15} className="shrink-0 text-stone-400" />
        ) : (
          <ChevronDown size={15} className="shrink-0 text-stone-400" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-stone-100 px-4 pb-4 pt-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-500">幹事名</label>
                <input
                  type="text"
                  value={form.organizerName}
                  onChange={(e) => setForm((f) => ({ ...f, organizerName: e.target.value }))}
                  placeholder="山田太郎"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-base text-stone-900 outline-none focus:border-stone-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-500">
                  PayPay ID（任意）
                </label>
                <input
                  type="text"
                  value={form.paypayId}
                  onChange={(e) => setForm((f) => ({ ...f, paypayId: e.target.value }))}
                  placeholder="yamada_taro"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-base text-stone-900 outline-none focus:border-stone-400 focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowBank((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-stone-400 underline"
              >
                <CreditCard size={11} />
                {showBank ? '銀行口座を閉じる' : '銀行口座を入力する（任意）'}
              </button>

              {showBank && (
                <div className="space-y-2.5 rounded-xl bg-stone-50 p-3">
                  {[
                    { key: 'bankName', label: '銀行名', placeholder: 'みずほ銀行' },
                    { key: 'branchName', label: '支店名', placeholder: '渋谷支店' },
                    { key: 'accountNumber', label: '口座番号', placeholder: '1234567' },
                    { key: 'accountName', label: '口座名義（カナ）', placeholder: 'ヤマダタロウ' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="mb-1 block text-[10px] font-bold text-stone-500">
                        {label}
                      </label>
                      <input
                        type="text"
                        value={(form as any)[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-400"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-stone-500">
                      口座種別
                    </label>
                    <div className="flex gap-2">
                      {['普通', '当座'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, accountType: t }))}
                          className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                            form.accountType === t
                              ? 'bg-stone-900 text-white'
                              : 'bg-stone-100 text-stone-500'
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
                className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                保存する
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── ロールバッジ色 ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<ParticipantRole, string> = {
  主賓: 'bg-amber-500 text-white',
  上長: 'bg-stone-700 text-white',
  先輩: 'bg-stone-500 text-white',
  通常: 'bg-stone-900 text-white',
}

// ── メインコンポーネント ───────────────────────────────────────────────────────

export function SettlementStep({
  participants,
  organizerSettings,
  onSaveSettings,
  onSubmit,
  onBack,
  initialDraft,
  onSaveDraft,
}: Props) {
  // ── 清算モード ──
  const [mode, setMode] = useState<SettlementMode>(initialDraft?.mode ?? 'gradient')

  // ── 1次会 ──
  const [party1Ids, setParty1Ids] = useState<string[]>(
    initialDraft?.party1Ids ?? participants.map((p) => p.id)
  )
  const [party1Amount, setParty1Amount] = useState(initialDraft?.party1Amount ?? '')
  const [party1Gradient, setParty1Gradient] = useState(initialDraft?.party1Gradient ?? true)

  // ── 2次会 ──
  const [showParty2, setShowParty2] = useState(initialDraft?.showParty2 ?? false)
  const [party2Ids, setParty2Ids] = useState<string[]>(initialDraft?.party2Ids ?? [])
  const [party2Amount, setParty2Amount] = useState(initialDraft?.party2Amount ?? '')
  const [party2Gradient, setParty2Gradient] = useState(initialDraft?.party2Gradient ?? false)

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
  const [showGradient, setShowGradient] = useState(false)

  // ── 金額指定（fixed_amount モード） ──
  const [fixedAmounts, setFixedAmounts] = useState<Record<string, string>>(
    initialDraft?.fixedAmounts ?? {}
  )

  const setFixedAmount = (id: string, value: string) => {
    setFixedAmounts((prev) => ({ ...prev, [id]: value }))
  }

  const toggle = (id: string, ids: string[], setIds: (v: string[]) => void) => {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
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

  const handleSubmit = () => {
    if (!canSubmit) return

    // fixed_amount 用: string → number | null に変換
    const fixedAmountsNum: Record<string, number | null> = {}
    if (mode === 'fixed_amount') {
      participants.forEach((p) => {
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
      party1Ids, party1Amount, party1Gradient,
      showParty2, party2Ids, party2Amount, party2Gradient,
      roles, gradient, mode, fixedAmounts,
    })
    onSubmit({ parties, roles, gradient, mode, fixedAmounts: fixedAmountsNum })
  }

  return (
    <motion.div
      className="space-y-4 pb-28"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* ヘッダー */}
      <div className="px-0.5">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
            <Receipt size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">Settlement</p>
        </div>
        <h2 className="text-[22px] font-black tracking-tight text-stone-900">清算をまとめる</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-400">会計を入れて、幹事の仕事を終わらせましょう。</p>
      </div>

      {/* 幹事設定 */}
      <OrganizerSettingsCard settings={organizerSettings} onSave={onSaveSettings} />

      {/* 清算方法セレクター */}
      <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
        <p className="mb-2.5 text-[10px] font-black uppercase tracking-wider text-stone-500">清算方法</p>
        <div className="flex rounded-xl bg-stone-100 p-0.5">
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
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'gradient' && (
          <p className="mt-2 text-[11px] leading-5 text-stone-400">
            役割（主賓・上長・先輩）に応じて金額が変わります。
          </p>
        )}
        {mode === 'fixed_amount' && (
          <p className="mt-2 text-[11px] leading-5 text-stone-400">
            人ごとに金額を指定できます。未入力の人は残額を自動で割ります。
          </p>
        )}
      </div>

      {/* 1次会 */}
      <PartySection
        label="1次会"
        participants={participants}
        selectedIds={party1Ids}
        onToggle={(id) => toggle(id, party1Ids, setParty1Ids)}
        amount={party1Amount}
        onAmountChange={setParty1Amount}
        useGradient={party1Gradient}
        onGradientToggle={setParty1Gradient}
        hideGradientToggle={mode === 'fixed_amount'}
      />

      {/* 金額指定セクション（1次会） */}
      {mode === 'fixed_amount' && party1Ids.length > 0 && (
        <FixedAmountSection
          label="1次会"
          participants={participants}
          selectedIds={party1Ids}
          totalAmount={party1TotalAmt}
          fixedAmounts={fixedAmounts}
          onFixedAmountChange={setFixedAmount}
        />
      )}

      {/* 2次会 */}
      {!showParty2 ? (
        <button
          type="button"
          onClick={() => {
            setShowParty2(true)
            setParty2Ids(party1Ids.slice())
          }}
          className="w-full rounded-2xl border border-dashed border-stone-300 py-3.5 text-sm font-bold text-stone-400 transition hover:border-stone-400 hover:text-stone-600 active:scale-[0.98]"
        >
          ＋ 2次会を追加する
        </button>
      ) : (
        <div className="space-y-3">
          <PartySection
            label="2次会"
            isSecond
            participants={participants}
            selectedIds={party2Ids}
            onToggle={(id) => toggle(id, party2Ids, setParty2Ids)}
            amount={party2Amount}
            onAmountChange={setParty2Amount}
            useGradient={party2Gradient}
            onGradientToggle={setParty2Gradient}
            hideGradientToggle={mode === 'fixed_amount'}
          />
          {mode === 'fixed_amount' && party2Ids.length > 0 && (
            <FixedAmountSection
              label="2次会"
              participants={participants}
              selectedIds={party2Ids}
              totalAmount={parseInt(party2Amount, 10) || 0}
              fixedAmounts={fixedAmounts}
              onFixedAmountChange={setFixedAmount}
            />
          )}
          <button
            type="button"
            onClick={() => { setShowParty2(false); setParty2Ids([]) }}
            className="text-xs text-stone-400 underline"
          >
            2次会を削除
          </button>
        </div>
      )}

      {/* 役割設定（傾斜配分モードのみ表示） */}
      {mode === 'gradient' && <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
        <div className="mb-3 flex items-center gap-1.5">
          <Users size={12} className="text-stone-400" strokeWidth={2.5} />
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">役割設定</p>
        </div>
        {participants.length === 0 ? (
          <p className="text-xs text-stone-400">参加者がいません</p>
        ) : (
          <div className="space-y-3">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-sm font-bold text-stone-800">
                  {p.name}
                </span>
                <div className="flex flex-wrap gap-1">
                  {ROLES.map((role) => {
                    const active = roles[p.id] === role
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setRoles((r) => ({ ...r, [p.id]: role }))}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                          active ? ROLE_COLORS[role] : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
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
        )}
      </div>}

      {/* 傾斜設定（gradient モードのみ） */}
      {mode === 'gradient' && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
          <button
            type="button"
            onClick={() => setShowGradient((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3.5"
          >
            <div className="flex items-start gap-2">
              <SlidersHorizontal size={13} className="mt-0.5 shrink-0 text-stone-400" strokeWidth={2} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                  傾斜配分の係数
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  主賓 0 ／ 上長 {gradient.上長.toFixed(1)} ／ 先輩 {gradient.先輩.toFixed(1)} ／ 通常{' '}
                  {gradient.通常.toFixed(1)}
                </p>
              </div>
            </div>
            {showGradient ? (
              <ChevronUp size={16} className="shrink-0 text-stone-400" />
            ) : (
              <ChevronDown size={16} className="shrink-0 text-stone-400" />
            )}
          </button>

          <AnimatePresence>
            {showGradient && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                {(() => {
                  const totalAmt = parseInt(party1Amount, 10) || 0
                  const previewEnabled = party1Gradient && totalAmt > 0

                  const totalWeight = party1Ids.reduce((sum, id) => {
                    const role = roles[id] ?? '通常'
                    return sum + (gradient[role] ?? 1.0)
                  }, 0)

                  const activeRoles = new Set(party1Ids.map((id) => roles[id] ?? '通常'))

                  const previewAmount = (coeff: number): number => {
                    if (!previewEnabled || totalWeight <= 0) return 0
                    return coeff === 0 ? 0 : roundUp100((totalAmt * coeff) / totalWeight)
                  }

                  const normalAmt = previewAmount(gradient['通常'])

                  return (
                    <div className="space-y-4 border-t border-stone-100 px-4 pb-4 pt-3">
                      {(() => {
                        const isPresent = activeRoles.has('主賓')
                        return (
                          <div className={`flex items-center justify-between ${!isPresent ? 'opacity-30' : ''}`}>
                            <span className="text-sm font-bold text-stone-700">主賓</span>
                            <span className="text-sm text-stone-400">
                              {isPresent ? '0.0' : '—'}
                              {previewEnabled && isPresent && (
                                <span className="ml-2 font-medium text-stone-500">¥0</span>
                              )}
                            </span>
                          </div>
                        )
                      })()}

                      {(['上長', '先輩', '通常'] as const).map((role) => {
                        const isPresent = activeRoles.has(role)
                        const amt = previewAmount(gradient[role])
                        const diff = amt - normalAmt
                        return (
                          <div key={role} className={!isPresent ? 'opacity-30 pointer-events-none' : ''}>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-sm font-bold text-stone-700">{role}</span>
                              <div className="flex items-baseline gap-2">
                                {previewEnabled && isPresent && (
                                  <span className="text-right">
                                    <span className="text-sm font-medium text-stone-800">
                                      ¥{formatYen(amt)}
                                    </span>
                                    {role !== '通常' && diff > 0 && (
                                      <span className="ml-1.5 text-[11px] text-stone-400">
                                        +¥{formatYen(diff)}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!isPresent ? (
                                  <span className="w-8 text-right text-sm font-black text-stone-400">—</span>
                                ) : (
                                  <span className="w-8 text-right text-sm font-black text-stone-900">
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
                              onChange={(e) =>
                                setGradient((g) => ({ ...g, [role]: parseFloat(e.target.value) }))
                              }
                              className="w-full accent-stone-900"
                            />
                            <div className="flex justify-between text-[10px] text-stone-300">
                              <span>0</span>
                              <span>2.0</span>
                            </div>
                          </div>
                        )
                      })}

                      {!previewEnabled && (
                        <p className="text-[10px] text-stone-300">
                          1次会の金額を入力すると、係数ごとの目安額が表示されます。
                        </p>
                      )}
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-[#F5F3EF] via-[#F5F3EF]/95 to-transparent px-4 pb-6 pt-4">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-stone-900 px-4 py-4 text-sm font-black text-white shadow-md transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
          >
            計算して確認する →
          </button>
        </div>
      </div>
    </motion.div>
  )
}
