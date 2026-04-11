/**
 * organizer-settings.ts
 * 幹事の定型情報を localStorage に保存・読み込みするユーティリティ。
 *
 * 設計方針:
 *   - localStorage への直接アクセスはすべてここに集約する
 *   - page.tsx / component 内では loadOrganizerSettings / saveOrganizerSettings のみ使う
 *   - 将来的に匿名ID保存や Supabase 連携に変えるときは、この関数を差し替えるだけでOK
 */

/** 傾斜配分係数（英語キーで保存 → 日本語UIへの変換は utilityで行う） */
export type OrganizerGradient = {
  guestOfHonor: number // 主賓
  boss: number         // 上長
  senior: number       // 先輩
  standard: number     // 通常
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

const STORAGE_KEY = 'kanji_organizer_settings'

export function loadOrganizerSettings(): OrganizerSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_ORGANIZER_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ORGANIZER_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<OrganizerSettings>
    return {
      ...DEFAULT_ORGANIZER_SETTINGS,
      ...parsed,
      defaultGradient: {
        ...DEFAULT_ORGANIZER_SETTINGS.defaultGradient,
        ...(parsed.defaultGradient ?? {}),
      },
    }
  } catch {
    return { ...DEFAULT_ORGANIZER_SETTINGS }
  }
}

export function saveOrganizerSettings(settings: OrganizerSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

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
