'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
  CloudOff,
  Cloud,
  HardDrive,
  Heart,
  Trash2,
  ChevronRight,
  UtensilsCrossed,
  Info,
  LogIn,
} from 'lucide-react'
import {
  type UserSettings,
  type SaveMode,
  saveUserSettings,
  saveModeLabel,
  saveModeDescription,
} from '@/app/lib/user-settings'

type Props = {
  settings: UserSettings
  onSettingsChange: (s: UserSettings) => void
  /** 幹事名（organizerSettings と共有） */
  organizerName: string
  onOrganizerNameChange: (name: string) => void
}

// ── セクションカード ────────────────────────────────────────────────────────────

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-stone-100 ${className ?? ''}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">
      {children}
    </p>
  )
}

// ── 保存状態バッジ ─────────────────────────────────────────────────────────────

function SaveModeBadge({ mode }: { mode: SaveMode }) {
  if (mode === 'cloud') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
        <Cloud size={9} strokeWidth={2.5} />
        連携済み
      </span>
    )
  }
  if (mode === 'local') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-600 ring-1 ring-stone-200">
        <HardDrive size={9} strokeWidth={2.5} />
        端末保存中
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-400 ring-1 ring-stone-200">
      <CloudOff size={9} strokeWidth={2.5} />
      未設定
    </span>
  )
}

// ── メインコンポーネント ───────────────────────────────────────────────────────

export function SettingsScreen({ settings, onSettingsChange, organizerName, onOrganizerNameChange }: Props) {
  const [displayNameInput, setDisplayNameInput] = useState(
    settings.displayName || organizerName
  )
  const [displayNameSaved, setDisplayNameSaved] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch }
    saveUserSettings(next)
    onSettingsChange(next)
  }

  const handleSaveDisplayName = () => {
    const name = displayNameInput.trim()
    update({ displayName: name })
    onOrganizerNameChange(name)
    setDisplayNameSaved(true)
    setTimeout(() => setDisplayNameSaved(false), 1800)
  }

  const handleSetLocalMode = () => {
    update({ saveMode: 'local' })
  }

  const handleDeleteAll = () => {
    update({
      saveMode: 'none',
      displayName: '',
      favoriteStores: [],
      pastEventRecords: [],
    })
    setShowDeleteConfirm(false)
  }

  return (
    <motion.div
      className="space-y-6 pb-12"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* ヘッダー */}
      <div className="px-0.5">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900">
            <Settings size={13} className="text-white" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-[22px] font-black tracking-tight text-stone-900">設定</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-400">
          保存設定や表示名を管理します。
        </p>
      </div>

      {/* ── A. データ保存 ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionLabel>データの保存設定</SectionLabel>
        <SectionCard>
          {/* 現在の状態 */}
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-4">
            <div>
              <p className="text-sm font-bold text-stone-900">{saveModeLabel(settings.saveMode)}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-stone-400">
                {saveModeDescription(settings.saveMode)}
              </p>
            </div>
            <SaveModeBadge mode={settings.saveMode} />
          </div>

          {/* 説明 */}
          <div className="flex items-start gap-2 px-4 py-3">
            <Info size={11} className="mt-0.5 shrink-0 text-stone-300" strokeWidth={2} />
            <p className="text-[11px] leading-5 text-stone-400">
              お気に入りや会の記録をあとで見返せるようにできます。端末変更時の引き継ぎにも使えます。
            </p>
          </div>

          {/* 保存設定ボタン群 */}
          <div className="space-y-2 border-t border-stone-100 px-4 pb-4 pt-3">
            {/* メールで保存設定（将来実装） */}
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-between rounded-xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100 opacity-50"
            >
              <div className="flex items-center gap-2.5">
                <LogIn size={14} className="text-stone-500" strokeWidth={2} />
                <div className="text-left">
                  <p className="text-sm font-bold text-stone-700">メールアドレスで保存設定</p>
                  <p className="text-[10px] text-stone-400">準備中</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-stone-300" />
            </button>

            {/* Googleで保存設定（将来実装） */}
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-between rounded-xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100 opacity-50"
            >
              <div className="flex items-center gap-2.5">
                <Cloud size={14} className="text-stone-500" strokeWidth={2} />
                <div className="text-left">
                  <p className="text-sm font-bold text-stone-700">Googleで保存設定</p>
                  <p className="text-[10px] text-stone-400">準備中</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-stone-300" />
            </button>

            {/* この端末に保存（今すぐ有効） */}
            {settings.saveMode === 'none' && (
              <button
                type="button"
                onClick={handleSetLocalMode}
                className="flex w-full items-center justify-between rounded-xl bg-stone-900 px-4 py-3.5 transition hover:opacity-90 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <HardDrive size={14} className="text-white/70" strokeWidth={2} />
                  <p className="text-sm font-bold text-white">この端末に保存する</p>
                </div>
                <ChevronRight size={14} className="text-white/40" />
              </button>
            )}

            {settings.saveMode !== 'none' && (
              <p className="text-center text-[11px] text-stone-400">
                保存設定済みです
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── B. 表示名 ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionLabel>表示名</SectionLabel>
        <SectionCard className="px-4 py-4">
          <p className="mb-2 text-[11px] leading-5 text-stone-400">
            幹事として共有文や記録に使われます。未設定でも動きます。
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              placeholder="例：山田"
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-base text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
            />
            <button
              type="button"
              onClick={handleSaveDisplayName}
              className="shrink-0 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 active:scale-95"
            >
              {displayNameSaved ? '保存済 ✓' : '保存'}
            </button>
          </div>
        </SectionCard>
      </div>

      {/* ── C. お気に入り ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionLabel>お気に入りのお店</SectionLabel>
        <SectionCard>
          {settings.favoriteStores.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-50">
                <Heart size={18} className="text-stone-300" strokeWidth={1.8} />
              </div>
              <p className="text-sm font-bold text-stone-500">まだお気に入りはありません</p>
              <p className="mt-1.5 text-[11px] leading-5 text-stone-400">
                お店を選んだとき、お気に入りに登録できるようになります。
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {settings.favoriteStores.map((store) => (
                <div key={store.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-50">
                    <UtensilsCrossed size={13} className="text-stone-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-900">{store.name}</p>
                    <p className="text-[11px] text-stone-400">{store.area}</p>
                  </div>
                  {store.link && (
                    <a
                      href={store.link}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-[11px] font-bold text-stone-400 underline"
                    >
                      開く
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── D. データ管理 ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionLabel>データ管理</SectionLabel>
        <SectionCard>
          {/* 保存状態サマリー */}
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <HardDrive size={13} className="text-stone-400" strokeWidth={2} />
              <p className="text-sm font-bold text-stone-700">この端末に保存中</p>
            </div>
            <SaveModeBadge mode={settings.saveMode} />
          </div>

          {/* 削除 */}
          <div className="px-4 py-3.5">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-sm font-bold text-red-400 transition hover:text-red-600"
              >
                <Trash2 size={13} strokeWidth={2} />
                すべてのデータを削除する
              </button>
            ) : (
              <div className="space-y-2.5 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
                <p className="text-xs font-bold text-red-700">
                  本当にすべてのデータを削除しますか？この操作は元に戻せません。
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-black text-white transition hover:opacity-90 active:scale-95"
                  >
                    削除する
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 rounded-xl bg-white py-2 text-xs font-bold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* バージョン情報 */}
      <p className="text-center text-[10px] text-stone-300">KANJI v0.1 — 設定はこの端末に保存されます</p>
    </motion.div>
  )
}

