'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Check, Smartphone, Landmark,
  Sparkles, Heart, ChevronDown, ChevronUp,
  ImagePlus, X, AlertCircle,
} from 'lucide-react'
import { type SettlementResult, type SettlementConfig, formatYen } from '@/app/lib/settlement'
import { type OrganizerSettings, hasPaymentInfo, hasBankInfo } from '@/app/lib/organizer-settings'
import { compressImageToDataUrl } from '@/app/lib/image'

export type CompletionData = {
  memo: string
  isFavorite: boolean
  hasPhoto: boolean
  photoDataUrl?: string
}

/** 保存結果を呼び出し側から受け取る */
export type CompleteResult = 'ok' | 'photo_failed' | 'error'

type Props = {
  result: SettlementResult
  config: SettlementConfig
  message: string
  organizerSettings?: OrganizerSettings
  /** store info for favorite registration */
  storeName?: string
  storeId?: string
  storeLink?: string
  storeArea?: string
  storeGenre?: string
  /** event info for record */
  eventName?: string
  eventDate?: string
  /** ツールモード（独立会計試算）: メモ/完了ボタンを非表示 */
  isToolMode?: boolean
  onBack: () => void
  onShare: (text: string) => void
  /**
   * 完了データを渡し、保存を試みる。
   * 'ok'           → 完全保存成功
   * 'photo_failed' → 写真除きで保存成功（容量超過）
   * 'error'        → 保存失敗
   */
  onComplete: (data: CompletionData) => CompleteResult
  /** 労いアニメーション終了後に呼ばれるナビゲーション */
  onCompleted: () => void
}

const ROLE_BADGE: Record<string, string> = {
  主賓: 'bg-brand/12 text-brand',
  上長: 'bg-stone-100 text-stone-700',
  先輩: 'bg-stone-100 text-stone-600',
  通常: '',
}

export function SettlementSummaryTable({
  result, config, message, organizerSettings,
  storeName, storeId: _storeId, storeLink: _storeLink, storeArea, storeGenre: _storeGenre,
  eventName: _eventName, eventDate: _eventDate,
  isToolMode = false,
  onBack, onShare, onComplete, onCompleted,
}: Props) {
  const [editableMessage, setEditableMessage] = useState(message)
  const [copied, setCopied] = useState(false)
  const [showMemo, setShowMemo] = useState(false)
  const [memoText, setMemoText] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [showCongrats, setShowCongrats] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasMultiParty =
    result.partyResults.filter((pr) => pr.totalAmount > 0).length > 1

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      alert('コピーに失敗しました')
    }
  }

  /** 画像選択 → 圧縮 → プレビュー（保存は完了ボタン押下時） */
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSaveError(null)
    setPhotoLoading(true)
    try {
      const compressed = await compressImageToDataUrl(file)
      setPhotoDataUrl(compressed)
    } catch {
      setSaveError('画像の読み込みに失敗しました。別の画像をお試しください。')
    } finally {
      setPhotoLoading(false)
      // same file を再選択できるようリセット
      e.target.value = ''
    }
  }

  const handleComplete = () => {
    setSaveError(null)

    const result = onComplete({
      memo: memoText,
      isFavorite,
      hasPhoto: !!photoDataUrl,
      photoDataUrl: photoDataUrl ?? undefined,
    })

    if (result === 'error') {
      setSaveError(
        'この端末の保存容量に達しているため、記録を保存できませんでした。' +
        '写真を外してもう一度お試しください。'
      )
      return
    }

    // 'ok' または 'photo_failed' — レコードは保存済み
    setShowCongrats(true)
    setTimeout(() => onCompleted(), 1400)
  }

  return (
    <>
      {/* ── 労いオーバーレイ ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCongrats && (
          <motion.div
            key="congrats"
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{ background: '#1C1917' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30"
            >
              <Sparkles size={28} className="text-emerald-400" strokeWidth={1.8} />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.3 }}
              className="text-xl font-black tracking-tight text-white"
            >
              幹事お疲れさまでした！
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.3 }}
              className="mt-2 text-[13px] text-white/40"
            >
              お会計お疲れさまです
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {/* ヘッダー */}
        <div className="px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
            Confirm &amp; Share
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">会計共有</h2>
        </div>

        {/* 明細テーブル */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50">
                <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-stone-500">
                  名前
                </th>
                <th className="px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-stone-500">
                  役割
                </th>
                {config.parties.map((party) => (
                  <th
                    key={party.id}
                    className="px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-stone-500"
                  >
                    {party.id}
                  </th>
                ))}
                {hasMultiParty && (
                  <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-stone-900">
                    合計
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {result.personResults.map((person) => (
                <tr key={person.participantId} className="hover:bg-stone-50">
                  <td className="px-3 py-3 font-bold text-stone-900">{person.name}</td>
                  <td className="px-2 py-3">
                    {person.role !== '通常' ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_BADGE[person.role]}`}
                      >
                        {person.role}
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-400">通常</span>
                    )}
                  </td>
                  {person.partyAmounts.map((amt, i) => (
                    <td key={i} className="px-2 py-3 text-right font-bold text-stone-800">
                      {config.parties[i]?.participantIds.includes(person.participantId)
                        ? `${formatYen(amt)}円`
                        : <span className="text-stone-300">—</span>}
                    </td>
                  ))}
                  {hasMultiParty && (
                    <td className="px-3 py-3 text-right font-black text-stone-900">
                      {formatYen(person.total)}円
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 差額情報 */}
        <div className="space-y-2">
          {result.partyResults.map((pr) => {
            if (pr.totalAmount <= 0) return null
            return (
              <div
                key={pr.id}
                className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-2.5 ring-1 ring-stone-100"
              >
                <span className="text-xs font-bold text-stone-600">{pr.id}</span>
                <div className="text-right">
                  <span className="text-xs text-stone-500">
                    実会計 {formatYen(pr.totalAmount)}円 → 徴収 {formatYen(pr.roundedTotal)}円
                  </span>
                  {pr.remainder > 0 && (
                    <span className="ml-2 text-[11px] text-stone-400">
                      （+{formatYen(pr.remainder)}円 端数）
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 送金先カード */}
        {organizerSettings && hasPaymentInfo(organizerSettings) && (
          <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-stone-500">送金先</p>
            <div className="space-y-2">
              {organizerSettings.paypayId && (
                <div className="flex items-center gap-2">
                  <Smartphone size={13} className="shrink-0 text-stone-400" />
                  <span className="text-sm text-stone-700">
                    <span className="font-bold">PayPay</span>　{organizerSettings.paypayId}
                  </span>
                </div>
              )}
              {hasBankInfo(organizerSettings) && (
                <div className="flex items-start gap-2">
                  <Landmark size={13} className="mt-0.5 shrink-0 text-stone-400" />
                  <span className="text-sm text-stone-700">
                    <span className="font-bold">銀行</span>
                    {'　'}
                    {[
                      organizerSettings.bankName,
                      organizerSettings.branchName,
                      organizerSettings.accountType,
                      organizerSettings.accountNumber,
                      organizerSettings.accountName,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 共有文（編集可能） */}
        <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
          <p className="mb-2 text-xs font-black uppercase tracking-wider text-stone-500">共有文</p>
          <textarea
            value={editableMessage}
            onChange={(e) => setEditableMessage(e.target.value)}
            rows={10}
            className="w-full resize-none rounded-xl bg-stone-50 px-4 py-3 text-base leading-7 text-stone-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-stone-300"
          />
        </div>

        {/* 補足文 */}
        <p className="px-1 text-[11px] leading-5 text-stone-400">
          ※金額は調整のうえ、100円単位で切り上げて計算しています
        </p>

        {/* LINE共有 + コピー */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[0.98]"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            {copied ? 'コピーしました' : 'コピー'}
          </button>
          <button
            type="button"
            onClick={() => onShare(editableMessage)}
            className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            LINEで送る
          </button>
        </div>

        {/* ── メモパネル（フルモードのみ）──────────────────────────────────── */}
        {!isToolMode && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
            <button
              type="button"
              onClick={() => setShowMemo((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3.5"
            >
              <span className="text-sm font-bold text-stone-700">会のメモを残す</span>
              {showMemo
                ? <ChevronUp size={16} className="text-stone-400" />
                : <ChevronDown size={16} className="text-stone-400" />
              }
            </button>

            <AnimatePresence>
              {showMemo && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 border-t border-stone-100 px-4 pb-4 pt-3">
                    {/* ひとことメモ */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-stone-400">
                        ひとことメモ
                      </label>
                      <textarea
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        placeholder="よかった点、次回への引き継ぎなど..."
                        rows={3}
                        className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-base leading-6 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                      />
                    </div>

                    {/* お気に入り登録 */}
                    {storeName && (
                      <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
                        <div>
                          <p className="text-sm font-bold text-stone-800">{storeName}</p>
                          {storeArea && (
                            <p className="text-[11px] text-stone-400">{storeArea}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsFavorite((v) => !v)}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                            isFavorite
                              ? 'bg-rose-100 text-rose-600 ring-1 ring-rose-200'
                              : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                          }`}
                        >
                          <Heart
                            size={11}
                            strokeWidth={2.5}
                            className={isFavorite ? 'fill-rose-500 text-rose-500' : ''}
                          />
                          {isFavorite ? 'お気に入り済み' : 'お気に入り'}
                        </button>
                      </div>
                    )}

                    {/* 写真1枚（圧縮して保存） */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-stone-400">
                        写真
                      </label>
                      {photoLoading ? (
                        <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50">
                          <span className="text-[10px] text-stone-400">処理中…</span>
                        </div>
                      ) : photoDataUrl ? (
                        <div className="relative inline-block">
                          <img
                            src={photoDataUrl}
                            alt="会の写真"
                            className="h-28 w-28 rounded-xl object-cover ring-1 ring-stone-200"
                          />
                          <button
                            type="button"
                            onClick={() => { setPhotoDataUrl(null); setSaveError(null) }}
                            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-stone-700 text-white transition hover:bg-stone-900"
                          >
                            <X size={10} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 bg-stone-50 text-stone-400 transition hover:border-stone-400 hover:text-stone-600 active:scale-95"
                        >
                          <ImagePlus size={18} strokeWidth={1.8} />
                          <span className="text-[9px] font-bold">追加</span>
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 完了CTA */}
        <div className="space-y-2.5 pb-8">
          {/* エラーメッセージ */}
          {saveError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 rounded-2xl bg-red-50 px-4 py-3.5 ring-1 ring-red-100"
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" strokeWidth={2} />
              <p className="text-[12px] leading-5 text-red-700">{saveError}</p>
            </motion.div>
          )}
          {!isToolMode && (
            <button
              type="button"
              onClick={handleComplete}
              className="w-full rounded-2xl px-4 py-4 text-sm font-black text-white transition active:scale-[0.98]"
              style={{ background: 'var(--brand)' }}
            >
              会を完了する
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2.5 text-center text-[12px] font-bold text-white/35 transition hover:text-white/55"
          >
            会計を修正する
          </button>
        </div>
      </div>
    </>
  )
}
