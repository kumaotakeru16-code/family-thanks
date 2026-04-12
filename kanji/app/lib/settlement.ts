// app/lib/settlement.ts
// 清算機能のすべての型と計算ロジックを集約する

export type ParticipantRole = '主賓' | '上長' | '先輩' | '通常'

export const ROLES: readonly ParticipantRole[] = ['主賓', '上長', '先輩', '通常']

export type GradientConfig = {
  主賓: number
  上長: number
  先輩: number
  通常: number
}

export type SettlementMode = 'gradient' | 'fixed_amount'

export const DEFAULT_GRADIENT: GradientConfig = {
  主賓: 0,
  上長: 1.5,
  先輩: 1.3,
  通常: 1.0,
}

export type PartyConfig = {
  id: string          // '1次会' | '2次会'
  participantIds: string[]
  totalAmount: number // 合計会計（円）
  useGradient: boolean
}

export type SettlementConfig = {
  parties: PartyConfig[]
  roles: Record<string, ParticipantRole> // participantId → role
  gradient: GradientConfig
  mode?: SettlementMode                          // default: 'gradient'
  fixedAmounts?: Record<string, number | null>   // participantId → 固定金額（null = 自動割り）
}

// ── 計算結果の型 ────────────────────────────────────────────────────────────

export type PersonPartyAmount = {
  participantId: string
  roundedAmount: number // 100円切り上げ後
}

export type PartyResult = {
  id: string
  totalAmount: number
  useGradient: boolean
  perPerson: PersonPartyAmount[]
  roundedTotal: number // 丸め後の合計
  remainder: number   // roundedTotal - totalAmount（差額）
}

export type PersonResult = {
  participantId: string
  name: string
  role: ParticipantRole
  partyAmounts: number[] // 各会ごとの支払額（その会に不参加なら 0）
  total: number           // 合計支払額
}

export type SettlementResult = {
  partyResults: PartyResult[]
  personResults: PersonResult[]
}

// ── ユーティリティ関数 ───────────────────────────────────────────────────────

/** 100円単位で切り上げ */
export function roundUp100(n: number): number {
  if (n <= 0) return 0
  return Math.ceil(n / 100) * 100
}

/** 金額を日本語フォーマット（コンマ区切り） */
export function formatYen(n: number): string {
  return n.toLocaleString('ja-JP')
}

// ── メイン計算関数 ───────────────────────────────────────────────────────────

export function calcSettlement(
  config: SettlementConfig,
  participants: { id: string; name: string }[]
): SettlementResult {
  const { parties, roles, gradient } = config
  const mode = config.mode ?? 'gradient'
  const fixedAmounts = config.fixedAmounts ?? {}
  const byId = new Map(participants.map((p) => [p.id, p]))

  const partyResults: PartyResult[] = parties.map((party) => {
    const members = party.participantIds
      .map((id) => byId.get(id))
      .filter((p): p is { id: string; name: string } => !!p)

    if (members.length === 0 || party.totalAmount <= 0) {
      return {
        id: party.id,
        totalAmount: party.totalAmount,
        useGradient: party.useGradient,
        perPerson: members.map((m) => ({ participantId: m.id, roundedAmount: 0 })),
        roundedTotal: 0,
        remainder: 0,
      }
    }

    const perPerson: PersonPartyAmount[] = []

    if (mode === 'fixed_amount') {
      // ── 金額指定モード ────────────────────────────────────────────────
      // 固定金額の合計を求め、残額を未指定者で均等割り（100円切り上げ）
      let fixedSum = 0
      let freeCount = 0
      for (const m of members) {
        const fixed = fixedAmounts[m.id]
        if (fixed !== null && fixed !== undefined) {
          fixedSum += fixed
        } else {
          freeCount++
        }
      }
      const remaining = Math.max(0, party.totalAmount - fixedSum)
      const perFree = freeCount > 0 ? roundUp100(remaining / freeCount) : 0
      for (const m of members) {
        const fixed = fixedAmounts[m.id]
        if (fixed !== null && fixed !== undefined) {
          perPerson.push({ participantId: m.id, roundedAmount: fixed })
        } else {
          perPerson.push({ participantId: m.id, roundedAmount: perFree })
        }
      }
    } else if (!party.useGradient) {
      // ── 均等割り ─────────────────────────────────────────────────────
      const each = party.totalAmount / members.length
      for (const m of members) {
        perPerson.push({ participantId: m.id, roundedAmount: roundUp100(each) })
      }
    } else {
      // ── 傾斜配分 ─────────────────────────────────────────────────────
      const weights = members.map((m) => gradient[roles[m.id] ?? '通常'] ?? 1.0)
      const totalWeight = weights.reduce((a, b) => a + b, 0)

      for (let i = 0; i < members.length; i++) {
        const w = weights[i]
        if (w === 0) {
          perPerson.push({ participantId: members[i].id, roundedAmount: 0 })
        } else {
          const raw = totalWeight > 0 ? (party.totalAmount * w) / totalWeight : 0
          perPerson.push({ participantId: members[i].id, roundedAmount: roundUp100(raw) })
        }
      }
    }

    const roundedTotal = perPerson.reduce((s, p) => s + p.roundedAmount, 0)
    return {
      id: party.id,
      totalAmount: party.totalAmount,
      useGradient: party.useGradient,
      perPerson,
      roundedTotal,
      remainder: roundedTotal - party.totalAmount,
    }
  })

  // ── 人物ごとの集計 ────────────────────────────────────────────────────────
  const allIds = new Set<string>()
  parties.forEach((p) => p.participantIds.forEach((id) => allIds.add(id)))

  const roleOrder: Record<ParticipantRole, number> = { 主賓: 0, 上長: 1, 先輩: 2, 通常: 3 }

  const personResults: PersonResult[] = [...allIds]
    .map((id) => {
      const p = byId.get(id)
      if (!p) return null
      const partyAmounts = partyResults.map((pr) => {
        const entry = pr.perPerson.find((e) => e.participantId === id)
        return entry?.roundedAmount ?? 0
      })
      return {
        participantId: id,
        name: p.name,
        role: roles[id] ?? '通常',
        partyAmounts,
        total: partyAmounts.reduce((a, b) => a + b, 0),
      } satisfies PersonResult
    })
    .filter((p): p is PersonResult => p !== null)
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name, 'ja'))

  return { partyResults, personResults }
}

// ── 送金先情報の型（organizer-settings から渡す） ────────────────────────────

export type PaymentInfo = {
  paypayId?: string
  bankName?: string
  branchName?: string
  accountType?: string
  accountNumber?: string
  accountName?: string
}

// ── 共有メッセージ生成 ────────────────────────────────────────────────────────

export function generateSettlementMessage(
  result: SettlementResult,
  partyIds: string[],
  storeName?: string,
  payment?: PaymentInfo
): string {
  const lines: string[] = ['会計まとめです。ご確認ください。']
  if (storeName) lines.push(`【${storeName}】`)
  lines.push('')

  const activeParties = result.partyResults.filter((pr) => pr.totalAmount > 0)

  const multiParty = activeParties.length > 1

  for (let i = 0; i < result.partyResults.length; i++) {
    const pr = result.partyResults[i]
    if (pr.totalAmount <= 0) continue
    // 1次会のみなら「合計」、複数次会なら元のラベルを使う
    const label = multiParty ? (partyIds[i] ?? pr.id) : '合計'
    lines.push(`【${label}】`)
    for (const pp of pr.perPerson) {
      const person = result.personResults.find((p) => p.participantId === pp.participantId)
      if (!person) continue
      lines.push(`${person.name}　${formatYen(pp.roundedAmount)}円`)
    }
    lines.push('')
  }

  // 複数次会がある場合のみ合計欄を出す
  if (multiParty) {
    lines.push('【合計】')
    for (const person of result.personResults) {
      if (person.total > 0) {
        lines.push(`${person.name}　${formatYen(person.total)}円`)
      }
    }
    lines.push('')
  }

  lines.push('よろしくお願いします🙏')

  // ── 送金先ブロック ────────────────────────────────────────────────────────
  const hasPaypay = !!(payment?.paypayId)
  const hasBank = !!(payment?.bankName && payment?.accountNumber)

  if (hasPaypay || hasBank) {
    lines.push('')
    lines.push('【送金先】')
    if (hasPaypay) {
      lines.push(`PayPay: ${payment!.paypayId}`)
    }
    if (hasBank) {
      const parts = [
        payment!.bankName,
        payment!.branchName,
        payment!.accountType,
        payment!.accountNumber,
        payment!.accountName,
      ].filter(Boolean)
      lines.push(`銀行: ${parts.join(' ')}`)
    }
  }

  return lines.join('\n')
}
