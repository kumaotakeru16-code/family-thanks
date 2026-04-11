'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, User, CreditCard } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  type SettlementConfig,
  type GradientConfig,
  type ParticipantRole,
  ROLES,
} from '@/app/lib/settlement'
import {
  type OrganizerSettings,
  saveOrganizerSettings,
  hasPaymentInfo,
  toGradientConfig,
} from '@/app/lib/organizer-settings'

type Person = { id: string; name: string }

type Props = {
  participants: Person[]
  organizerSettings: OrganizerSettings
  onSaveSettings: (s: OrganizerSettings) => void
  onSubmit: (config: SettlementConfig) => void
  onBack: () => void
}

// ── 内部コンポーネント: 会設定セクション ─────────────────────────────────────

function PartySection({
  label,
  participants,
  selectedIds,
  onToggle,
  amount,
  onAmountChange,
  useGradient,
  onGradientToggle,
}: {
  label: string
  participants: Person[]
  selectedIds: string[]
  onToggle: (id: string) => void
  amount: string
  onAmountChange: (v: string) => void
  useGradient: boolean
  onGradientToggle: (v: boolean) => void
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
      <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-stone-500">{label}</p>

      {/* 参加者チェック */}
      <div className="mb-4 flex flex-wrap gap-2">
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

      {/* 合計会計 */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-bold text-stone-500">合計会計</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="50000"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none focus:border-stone-400 focus:bg-white"
          />
          <span className="shrink-0 text-sm text-stone-500">円</span>
        </div>
      </div>

      {/* 傾斜トグル */}
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
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            useGradient ? 'bg-stone-900' : 'bg-stone-200'
          }`}
          aria-pressed={useGradient}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              useGradient ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  )
}

// ── 幹事設定カード（インライン折りたたみ） ────────────────────────────────────

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
      {/* ヘッダー行 */}
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
              {/* 幹事名 */}
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-500">幹事名</label>
                <input
                  type="text"
                  value={form.organizerName}
                  onChange={(e) => setForm((f) => ({ ...f, organizerName: e.target.value }))}
                  placeholder="山田太郎"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-400 focus:bg-white"
                />
              </div>

              {/* PayPay ID */}
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-500">
                  PayPay ID（任意）
                </label>
                <input
                  type="text"
                  value={form.paypayId}
                  onChange={(e) => setForm((f) => ({ ...f, paypayId: e.target.value }))}
                  placeholder="yamada_taro"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-stone-400 focus:bg-white"
                />
              </div>

              {/* 銀行口座（折りたたみ） */}
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
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
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

export function SettlementStep({ participants, organizerSettings, onSaveSettings, onSubmit, onBack }: Props) {
  // ── 1次会 ──
  const [party1Ids, setParty1Ids] = useState<string[]>(participants.map((p) => p.id))
  const [party1Amount, setParty1Amount] = useState('')
  const [party1Gradient, setParty1Gradient] = useState(true)

  // ── 2次会 ──
  const [showParty2, setShowParty2] = useState(false)
  const [party2Ids, setParty2Ids] = useState<string[]>([])
  const [party2Amount, setParty2Amount] = useState('')
  const [party2Gradient, setParty2Gradient] = useState(false)

  // ── 役割（初期値は通常） ──
  const [roles, setRoles] = useState<Record<string, ParticipantRole>>(() => {
    const r: Record<string, ParticipantRole> = {}
    participants.forEach((p) => { r[p.id] = '通常' })
    return r
  })

  // ── 傾斜設定（保存済み defaultGradient を反映） ──
  const [gradient, setGradient] = useState<GradientConfig>(() =>
    toGradientConfig(organizerSettings.defaultGradient)
  )
  const [showGradient, setShowGradient] = useState(false)

  const toggle = (id: string, ids: string[], setIds: (v: string[]) => void) => {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  const canSubmit =
    party1Amount.trim() !== '' &&
    parseInt(party1Amount, 10) > 0 &&
    party1Ids.length > 0

  const handleSubmit = () => {
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
    onSubmit({ parties, roles, gradient })
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
          Settlement
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">
          清算をまとめる
        </h2>
        <p className="mt-1 text-sm text-stone-400">会計を入れて、幹事の仕事を終わらせましょう。</p>
      </div>

      {/* 幹事設定カード */}
      <OrganizerSettingsCard settings={organizerSettings} onSave={onSaveSettings} />

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
      />

      {/* 2次会 追加 / 表示 */}
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
        <div>
          <PartySection
            label="2次会"
            participants={participants}
            selectedIds={party2Ids}
            onToggle={(id) => toggle(id, party2Ids, setParty2Ids)}
            amount={party2Amount}
            onAmountChange={setParty2Amount}
            useGradient={party2Gradient}
            onGradientToggle={setParty2Gradient}
          />
          <button
            type="button"
            onClick={() => { setShowParty2(false); setParty2Ids([]) }}
            className="mt-1.5 text-xs text-stone-400 underline"
          >
            2次会を削除
          </button>
        </div>
      )}

      {/* 役割設定 */}
      <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
        <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-stone-500">
          役割設定
        </p>
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
      </div>

      {/* 傾斜設定（折りたたみ） */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
        <button
          type="button"
          onClick={() => setShowGradient((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3.5"
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">
              傾斜配分の係数
            </p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              主賓 0 ／ 上長 {gradient.上長.toFixed(1)} ／ 先輩 {gradient.先輩.toFixed(1)} ／ 通常{' '}
              {gradient.通常.toFixed(1)}
            </p>
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
              <div className="space-y-4 border-t border-stone-100 px-4 pb-4 pt-3">
                <p className="text-[10px] text-stone-400">主賓は常に 0（無料）です。</p>
                {(['上長', '先輩', '通常'] as const).map((role) => (
                  <div key={role}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-stone-700">{role}</span>
                      <span className="text-sm font-black text-stone-900">
                        {gradient[role].toFixed(1)}
                      </span>
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
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-stone-900 px-4 py-4 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
      >
        計算して確認する →
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm text-stone-400 underline"
      >
        ← 戻る
      </button>
    </div>
  )
}
