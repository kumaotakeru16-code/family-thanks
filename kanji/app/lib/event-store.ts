/**
 * event-store.ts
 *
 * 進行中の会（SavedEvent）の永続化を一元管理する。
 *
 * 設計方針:
 *   - localStorage への直接アクセスはすべてここに集約する
 *   - page.tsx 側では loadSavedEvents / persistSavedEvent などのみ使う
 *   - 将来 Supabase へ移行するときは、write 関数の実装を差し替えるだけでよい
 *
 * CLOUD-MIGRATION: loadSavedEvents → Supabase organizer_events テーブルの SELECT
 * CLOUD-MIGRATION: writeSavedEvents → Supabase organizer_events テーブルの UPSERT / DELETE
 */

const STORAGE_KEY = 'kanji_events'

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
  status?: 'date_pending' | 'store_pending' | 'store_confirmed'
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

export function loadSavedEvents(): SavedEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedEvent[]) : []
  } catch {
    return []
  }
}

/** 内部向け: state → localStorage に書き込む */
function writeSavedEvents(events: SavedEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // QuotaExceededError などは無視（進行中一覧は軽量なので実質ヒットしない）
  }
}

// ── 更新関数（前の state を受け取り、新 state を返す） ───────────────────────
// setSavedEvents(prev => persistSavedEvent(prev, ...)) のように使う。
// localStorage への書き込みも内部で行う。

/**
 * 会を新規追加または既存を上書きする（最大3件）。
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
