/**
 * local-storage-adapter.ts
 *
 * StorageAdapter の localStorage 実装。
 *
 * localStorage の実装詳細はすべてこのファイルに閉じ込める。
 * user-settings / organizer-settings / event-store からは直接 localStorage を触らない。
 *
 * CLOUD-MIGRATION:
 *   このファイルを cloud-storage-adapter.ts に差し替えることで
 *   保存先を Supabase に移行できる。
 *   storage/index.ts の export 先を変えるだけで切り替わる。
 */

import type { StorageAdapter, StorageKey } from './storage-adapter'

export const localStorageAdapter: StorageAdapter = {
  read<T>(key: StorageKey): T | null {
    // SSR（Next.js サーバーサイド実行）では window が存在しないため null を返す
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      // JSON.parse 失敗 / localStorage アクセス拒否（プライベートブラウジング等）
      return null
    }
  },

  write<T>(key: StorageKey, value: T): boolean {
    if (typeof window === 'undefined') return false
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      // QuotaExceededError（容量不足）などを false で返す
      // 呼び出し側でリトライ戦略（写真ストリップ等）を持てる
      return false
    }
  },

  remove(key: StorageKey): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(key)
    } catch {
      // 削除失敗は無視（データが残っても致命的ではない）
    }
  },
}
