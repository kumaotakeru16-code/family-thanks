'use client'

import { useState } from 'react'
import { Copy, Check, Smartphone, Landmark } from 'lucide-react'
import { type SettlementResult, type SettlementConfig, formatYen } from '@/app/lib/settlement'
import { type OrganizerSettings, hasPaymentInfo, hasBankInfo } from '@/app/lib/organizer-settings'

type Props = {
  result: SettlementResult
  config: SettlementConfig
  message: string
  organizerSettings?: OrganizerSettings
  onBack: () => void
  onShare: () => void // LINE共有に使用
  onDone: () => void  // 完了（ホームへ）
}

const ROLE_BADGE: Record<string, string> = {
  主賓: 'bg-amber-100 text-amber-700',
  上長: 'bg-stone-100 text-stone-700',
  先輩: 'bg-stone-100 text-stone-600',
  通常: '',
}

export function SettlementSummaryTable({ result, config, message, organizerSettings, onBack, onShare, onDone }: Props) {
  const [copied, setCopied] = useState(false)

  const hasMultiParty =
    result.partyResults.filter((pr) => pr.totalAmount > 0).length > 1

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      alert('コピーに失敗しました')
    }
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
          Confirm &amp; Share
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">清算の確認と共有</h2>
        <p className="mt-1 text-sm text-stone-400">内容を確認して、共有文を送りましょう。</p>
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

      {/* 差額情報（パーティごと） */}
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

      {/* 共有文プレビュー */}
      <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-stone-100">
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-stone-500">共有文</p>
        <div className="rounded-xl bg-stone-50 px-4 py-3">
          <p className="whitespace-pre-line text-sm leading-7 text-stone-700">{message}</p>
        </div>
      </div>

      {/* CTA — LINE + コピー横並び・戻る */}
      <div className="space-y-2.5">
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
            onClick={onShare}
            className="inline-flex items-center justify-center rounded-2xl bg-[#06C755] px-4 py-3.5 text-sm font-black text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            LINEで送る
          </button>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-sm text-stone-400 underline"
        >
          戻る
        </button>
      </div>
    </div>
  )
}
