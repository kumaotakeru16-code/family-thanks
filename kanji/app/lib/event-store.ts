/**
 * event-store.ts
 *
 * 進行中の会（SavedEvent）の永続化を一元管理する。
 *
 * 設計方針:
 *   - 保存先は storage/index.ts の storageAdapter に委譲する
 *   - page.tsx 側では loadSavedEvents / persistSavedEvent などのみ使う
 *
 * 保存責務:
 *   - SavedEvent の一覧（最大 3 件）
 *   - 会のフェーズ（date_pending / store_pending / store_confirmed / reserved）
 *   - 確定日程 ID・店舗情報
 *   - 清算完了時に removeSavedEvent で削除し、PastEventRecord として user-settings.ts 側へ移す
 *
 * CLOUD-MIGRATION:
 *   storage/index.ts で storageAdapter を差し替えるだけで Supabase に移行可能。
 *   Supabase: in_progress_events テーブル (user_id + event_id)
 *     loadSavedEvents  → SELECT WHERE user_id = ?
 *     writeSavedEvents → UPSERT / DELETE
 */

import { storageAdapter, STORAGE_KEYS } from './storage'

// ── 型 ──────────────────────────────────────────────────────────────────────

/**
 * 進行中の会の一覧に保持するレコード。
 * 完了（settlementConfirm）時に削除し、PastEventRecord として user-settings.ts 側へ移す。
 */
export type SavedEvent = {
  id: string
  name: string
  eventType: string
  createdAt: number
  /** 会の進行フェーズ */
  status?: 'date_pending' | 'store_pending' | 'store_confirmed' | 'reserved'
  /** 幹事が確定した日程 ID（status が store_pending 以降で設定） */
  confirmedDateId?: string
  /** 自前で入力したお店かどうか */
  isManualStore?: boolean
  storeName?: string
  storeUrl?: string
  storeMemo?: string
  storeId?: string
  storeArea?: string
}

// ── 永続化 ───────────────────────────────────────────────────────────────────
// 保存先の実装詳細は storageAdapter に閉じ込める。
// CLOUD-MIGRATION: storage/index.ts で storageAdapter を差し替えるだけで移行可能。

export function loadSavedEvents(): SavedEvent[] {
  return storageAdapter.read<SavedEvent[]>(STORAGE_KEYS.EVENTS) ?? []
}

/**
 * 内部向け: events 配列をまるごと書き込む。
 * QuotaExceededError は実質起きない（SavedEvent は軽量）ため戻り値は無視する。
 */
function writeSavedEvents(events: SavedEvent[]): void {
  storageAdapter.write(STORAGE_KEYS.EVENTS, events)
}

// ── 更新関数（前の state を受け取り、新 state を返す） ───────────────────────
// setSavedEvents(prev => persistSavedEvent(prev, ...)) のように使う。
// 書き込みも内部で行う。

/**
 * 会を新規追加または既存を上書きする（最大 3 件）。
 */
export function persistSavedEvent(
  events: SavedEvent[],
  id: string,
  name: string,
  eventType: string,
): SavedEvent[] {
  const item: SavedEvent = { id, name, eventType, createdAt: Date.now(), status: 'date_pending' }
  const updated = [item, ...events.filter((e) => e.id !== id)].slice(0, 3)
  writeSavedEvents(updated)
  return updated
}

/**
 * 会のフェーズ・確定日程・店舗情報を更新する。
 */
export function updateSavedEventStatus(
  events: SavedEvent[],
  id: string,
  status: NonNullable<SavedEvent['status']>,
  confirmedDateId?: string,
  storeInfo?: Pick<SavedEvent, 'isManualStore' | 'storeName' | 'storeUrl' | 'storeMemo' | 'storeId' | 'storeArea'>,
): SavedEvent[] {
  const updated = events.map((e) =>
    e.id === id
      ? {
          ...e,
          status,
          ...(confirmedDateId !== undefined ? { confirmedDateId } : {}),
          ...(storeInfo ?? {}),
        }
      : e,
  )
  writeSavedEvents(updated)
  return updated
}

/**
 * 会を一覧から削除する（清算完了後に呼ぶ）。
 */
export function removeSavedEvent(events: SavedEvent[], id: string): SavedEvent[] {
  const updated = events.filter((e) => e.id !== id)
  writeSavedEvents(updated)
  return updated
}
