/**
 * organizer-settings.ts
 *
 * 幹事の定型情報（送金先・傾斜係数・幹事名）の型定義と永続化を一元管理する。
 *
 * 設計方針:
 *   - 保存先は storage/index.ts の storageAdapter に委譲する
 *   - page.tsx / component 内では loadOrganizerSettings / saveOrganizerSettings のみ使う
 *
 * 保存責務:
 *   - organizerName   : 幹事名（共有文・清算メッセージに使用）
 *   - paypayId        : PayPay ID（清算共有文に添付）
 *   - bankName 等     : 銀行口座情報（清算共有文に添付）
 *   - defaultGradient : 傾斜配分係数（清算の初期値）
 *
 * CLOUD-MIGRATION:
 *   storage/index.ts で storageAdapter を差し替えるだけで Supabase に移行可能。
 *   Supabase: organizer_settings テーブル (user_id で 1 行 UPSERT)
 */

import { storageAdapter, STORAGE_KEYS } from './storage'

// ── 型 ────────────────────────────────────────────────────────────────────────

/** 傾斜配分係数（英語キーで保存 → 日本語UIへの変換は utility で行う） */
export type OrganizerGradient = {
  guestOfHonor: number  // 主賓
  boss: number          // 上長
  senior: number        // 先輩
  standard: number      // 通常
}

export type OrganizerSettings = {
  organizerName: string
  paypayId: string
  bankName: string
  branchName: string
  accountType: string   // '普通' | '当座'
  accountNumber: string
  accountName: string   // 口座名義（カナ）
  defaultGradient: OrganizerGradient
}

export const DEFAULT_ORGANIZER_SETTINGS: OrganizerSettings = {
  organizerName: '',
  paypayId: '',
  bankName: '',
  branchName: '',
  accountType: '普通',
  accountNumber: '',
  accountName: '',
  defaultGradient: {
    guestOfHonor: 0,
    boss: 1.5,
    senior: 1.3,
    standard: 1.0,
  },
}

// ── 永続化 ────────────────────────────────────────────────────────────────────
// 保存先の実装詳細は storageAdapter に閉じ込める。
// CLOUD-MIGRATION: storage/index.ts で storageAdapter を差し替えるだけで移行可能。

export function loadOrganizerSettings(): OrganizerSettings {
  const data = storageAdapter.read<Partial<OrganizerSettings>>(STORAGE_KEYS.ORGANIZER_SETTINGS)
  if (!data) return { ...DEFAULT_ORGANIZER_SETTINGS }
  return {
    ...DEFAULT_ORGANIZER_SETTINGS,
    ...data,
    defaultGradient: {
      ...DEFAULT_ORGANIZER_SETTINGS.defaultGradient,
      ...(data.defaultGradient ?? {}),
    },
  }
}

export function saveOrganizerSettings(settings: OrganizerSettings): void {
  storageAdapter.write(STORAGE_KEYS.ORGANIZER_SETTINGS, settings)
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

/** 送金先情報が1つ以上入力されているか */
export function hasPaymentInfo(s: OrganizerSettings): boolean {
  return !!(s.paypayId || (s.bankName && s.accountNumber))
}

/** 銀行口座情報が揃っているか */
export function hasBankInfo(s: OrganizerSettings): boolean {
  return !!(s.bankName && s.accountNumber)
}

/** OrganizerGradient → settlement.ts の GradientConfig 形式に変換 */
export function toGradientConfig(g: OrganizerGradient): {
  主賓: number
  上長: number
  先輩: number
  通常: number
} {
  return {
    主賓: g.guestOfHonor,
    上長: g.boss,
    先輩: g.senior,
    通常: g.standard,
  }
}
