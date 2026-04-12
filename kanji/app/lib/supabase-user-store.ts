/**
 * supabase-user-store.ts
 *
 * favorite_stores / past_events テーブルへの Supabase CRUD を集約する。
 *
 * 設計方針:
 *   - このファイルだけが Supabase クライアントを触る（user-settings.ts 以外からは呼ばない）
 *   - page.tsx / event-actions.ts はこのファイルを直接 import しない
 *   - anon_user_id による行スコープ（Supabase Auth 導入前の仮識別子）
 *
 * ── テーブル定義 SQL ─────────────────────────────────────────────────────────
 *
 * -- お気に入り店舗
 * CREATE TABLE favorite_stores (
 *   id           bigserial PRIMARY KEY,
 *   anon_user_id text        NOT NULL,
 *   store_id     text        NOT NULL,
 *   name         text        NOT NULL DEFAULT '',
 *   area         text        NOT NULL DEFAULT '',
 *   genre        text        NOT NULL DEFAULT '',
 *   link         text        NOT NULL DEFAULT '',
 *   saved_at     timestamptz NOT NULL DEFAULT now(),
 *   UNIQUE (anon_user_id, store_id)
 * );
 * ALTER TABLE favorite_stores ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "anon open" ON favorite_stores FOR ALL USING (true) WITH CHECK (true);
 *
 * -- 完了済みの会の記録
 * CREATE TABLE past_events (
 *   id           bigserial PRIMARY KEY,
 *   anon_user_id text        NOT NULL,
 *   event_id     text        NOT NULL UNIQUE,
 *   title        text        NOT NULL DEFAULT '',
 *   event_date   text        NOT NULL DEFAULT '',
 *   store_name   text        NOT NULL DEFAULT '',
 *   store_id     text,
 *   store_link   text,
 *   store_area   text,
 *   store_genre  text,
 *   participants text[]      NOT NULL DEFAULT '{}',
 *   memo         text        NOT NULL DEFAULT '',
 *   has_photo    boolean     NOT NULL DEFAULT false,
 *   photo_url    text,            -- base64 は保存しない。将来 Supabase Storage URL に使う。
 *   created_at   timestamptz NOT NULL DEFAULT now()
 * );
 * ALTER TABLE past_events ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "anon open" ON past_events FOR ALL USING (true) WITH CHECK (true);
 *
 * ── セキュリティ補足 ──────────────────────────────────────────────────────────
 *   現在は "anon open" ポリシー（全行アクセス可）。
 *   Supabase Auth 導入後は anon_user_id → auth.uid() に変更し、
 *   USING (anon_user_id = auth.uid()::text) に絞ること。
 *
 * CLOUD-MIGRATION:
 *   getAnonId() を Supabase auth.getUser().id に差し替えれば
 *   正規ユーザー認証に移行できる。
 */

import { createClient } from '@supabase/supabase-js'
import type { FavoriteStore, PastEventRecord } from './user-settings'
import { getAnonId } from './storage/anonymous-id'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── お気に入り店舗 ─────────────────────────────────────────────────────────────

export async function loadFavoriteStoresCloud(): Promise<FavoriteStore[]> {
  const anonId = getAnonId()
  if (!anonId) return []

  const { data, error } = await supabase
    .from('favorite_stores')
    .select('store_id, name, area, genre, link, saved_at')
    .eq('anon_user_id', anonId)
    .order('saved_at', { ascending: false })

  if (error || !data) return []

  return data.map((r) => ({
    id: r.store_id as string,
    name: (r.name as string) ?? '',
    area: (r.area as string) ?? '',
    genre: (r.genre as string) ?? '',
    link: (r.link as string) ?? '',
    savedAt: (r.saved_at as string) ?? '',
  }))
}

/**
 * お気に入り店舗を upsert する（同一 store_id は上書き）。
 */
export async function upsertFavoriteStoreCloud(store: FavoriteStore): Promise<void> {
  const anonId = getAnonId()
  if (!anonId) return

  await supabase.from('favorite_stores').upsert(
    {
      anon_user_id: anonId,
      store_id: store.id,
      name: store.name,
      area: store.area,
      genre: store.genre,
      link: store.link,
      saved_at: store.savedAt,
    },
    { onConflict: 'anon_user_id,store_id' },
  )
}

/**
 * お気に入り店舗を削除する。
 */
export async function deleteFavoriteStoreCloud(storeId: string): Promise<void> {
  const anonId = getAnonId()
  if (!anonId) return

  await supabase
    .from('favorite_stores')
    .delete()
    .eq('anon_user_id', anonId)
    .eq('store_id', storeId)
}

// ── 完了済みの会の記録 ─────────────────────────────────────────────────────────

export async function loadPastEventsCloud(): Promise<PastEventRecord[]> {
  const anonId = getAnonId()
  if (!anonId) return []

  const { data, error } = await supabase
    .from('past_events')
    .select(
      'event_id, title, event_date, store_name, store_id, store_link, store_area, store_genre, participants, memo, has_photo, photo_url, created_at',
    )
    .eq('anon_user_id', anonId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((r) => ({
    id: r.event_id as string,
    title: (r.title as string) ?? '',
    eventDate: (r.event_date as string) ?? '',
    storeName: (r.store_name as string) ?? '',
    storeId: (r.store_id as string | null) ?? undefined,
    storeLink: (r.store_link as string | null) ?? undefined,
    storeArea: (r.store_area as string | null) ?? undefined,
    storeGenre: (r.store_genre as string | null) ?? undefined,
    participants: (r.participants as string[]) ?? [],
    memo: (r.memo as string) ?? '',
    hasPhoto: (r.has_photo as boolean) ?? false,
    // base64 は DB に保存しないため常に undefined
    // CLOUD-MIGRATION: photo_url（Supabase Storage URL）を photoDataUrl の代わりに使う想定
    photoDataUrl: undefined,
    createdAt: (r.created_at as string) ?? '',
  }))
}

/**
 * 完了済みの会の記録を INSERT する（event_id が重複する場合は無視）。
 *
 * CLOUD-MIGRATION: record.photoDataUrl（base64）は保存しない。
 *   将来は compressImageToDataUrl の代わりに Supabase Storage へ PUT して
 *   photo_url に URL を保存する。
 */
export async function insertPastEventCloud(record: PastEventRecord): Promise<void> {
  const anonId = getAnonId()
  if (!anonId) return

  await supabase.from('past_events').upsert(
    {
      anon_user_id: anonId,
      event_id: record.id,
      title: record.title,
      event_date: record.eventDate,
      store_name: record.storeName,
      store_id: record.storeId ?? null,
      store_link: record.storeLink ?? null,
      store_area: record.storeArea ?? null,
      store_genre: record.storeGenre ?? null,
      participants: record.participants ?? [],
      memo: record.memo,
      has_photo: record.hasPhoto,
      photo_url: null, // CLOUD-MIGRATION: Supabase Storage URL に置き換える
      created_at: record.createdAt,
    },
    { onConflict: 'event_id' },
  )
}
