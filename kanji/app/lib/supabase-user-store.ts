/**
 * supabase-user-store.ts
 *
 * favorite_stores / past_events テーブルおよび写真 Storage への
 * Supabase アクセスをすべてここに集約する。
 *
 * 設計方針:
 *   - このファイルだけが Supabase クライアントを触る
 *   - page.tsx / event-actions.ts はこのファイルを直接 import しない
 *   - user-settings.ts 経由でのみ呼び出される
 *   - anon_user_id による行・パス スコープ（Supabase Auth 導入前の仮識別子）
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
 *   photo_url    text,       -- Storage path（base64 は保存しない）
 *   created_at   timestamptz NOT NULL DEFAULT now()
 * );
 * ALTER TABLE past_events ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "anon open" ON past_events FOR ALL USING (true) WITH CHECK (true);
 *
 * ── Storage バケット ─────────────────────────────────────────────────────────
 *
 * バケット名: past-event-photos
 * 種別: private（直接 URL 公開なし）
 * 表示時: createSignedUrl で期限付き URL を生成する（getPastEventPhotoSignedUrl）
 *
 * パス規則: past-events/{anon_user_id}/{event_id}-{timestamp}.jpg
 *   - anon_user_id プレフィックスでユーザー単位に分離
 *   - event_id + timestamp で同一イベントの再アップロード衝突を回避
 *   - Auth 移行時: anon_user_id → auth.uid() に置き換えるだけ
 *
 * Supabase Dashboard > Storage > past-event-photos > Policies に追加:
 *   -- アップロード許可（anon フェーズは全許可、Auth 導入後は絞ること）
 *   CREATE POLICY "anon upload"
 *     ON storage.objects FOR INSERT
 *     WITH CHECK (bucket_id = 'past-event-photos');
 *
 *   -- 読み取り許可（signed URL 経由でのみアクセス可能なため SELECT は不要）
 *   -- signed URL 生成には service_role or anon key で ok
 *
 * ── セキュリティ補足 ──────────────────────────────────────────────────────────
 *   現在は "anon open" ポリシー（全行アクセス可）。
 *   Supabase Auth 導入後は以下に変更する:
 *     テーブル: USING (anon_user_id = auth.uid()::text)
 *     Storage:  WITH CHECK (name LIKE 'past-events/' || auth.uid() || '/%')
 *
 * CLOUD-MIGRATION:
 *   getAnonId() を auth.getUser().id に差し替えれば正規認証に移行できる。
 */

import { createClient } from '@supabase/supabase-js'
import type { FavoriteStore, PastEventRecord } from './user-settings'
import { getAnonId } from './storage/anonymous-id'
import { dataUrlToBlob } from './image'

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
    // Storage path（base64 は DB に保存しないため photoDataUrl は常に undefined）
    // 表示時は photoUrl → getPastEventPhotoSignedUrl() で signed URL を生成する
    photoUrl: (r.photo_url as string | null) ?? undefined,
    photoDataUrl: undefined,
    createdAt: (r.created_at as string) ?? '',
  }))
}

/**
 * 完了済みの会の記録を INSERT する（event_id が重複する場合は上書き）。
 *
 * 写真付きの場合:
 *   1. uploadPastEventPhoto で Storage に PUT → path を取得
 *   2. photo_url に path を保存
 *   アップロード失敗時は photo_url = null で記録だけ保存する。
 *
 * 写真なしの場合: photo_url = null で保存。
 *
 * base64（photoDataUrl）は DB に保存しない。
 */
export async function insertPastEventCloud(record: PastEventRecord): Promise<void> {
  const anonId = getAnonId()
  if (!anonId) return

  // 写真アップロード（失敗しても記録は保存を続ける）
  let photoStoragePath: string | null = null
  if (record.photoDataUrl) {
    photoStoragePath = await uploadPastEventPhoto(anonId, record.id, record.photoDataUrl)
    if (!photoStoragePath) {
      // アップロード失敗は警告のみ。has_photo: true のまま photo_url: null で保存する。
      // 将来の再アップロードは record.id で特定できる。
      console.warn('[kanji] 写真アップロード失敗。写真なしで past_events を保存します。id=', record.id)
    }
  }

  const { error } = await supabase.from('past_events').upsert(
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
      photo_url: photoStoragePath, // Storage path または null（base64 は保存しない）
      created_at: record.createdAt,
    },
    { onConflict: 'event_id' },
  )

  if (error) {
    console.warn('[kanji] past_events 保存失敗:', error.message)
  }
}

// ── 写真 Storage ──────────────────────────────────────────────────────────────

const PHOTO_BUCKET = 'past-event-photos'

/**
 * Storage パスを組み立てる。
 *
 * パス規則: past-events/{anonId}/{eventId}-{timestamp}.jpg
 *   - anonId プレフィックスでユーザー単位に分離
 *   - eventId + timestamp で同一イベントの再アップロード衝突を回避
 *   - Auth 移行時: anonId → auth.uid() に差し替えるだけ
 */
export function buildPastEventPhotoPath(anonId: string, eventId: string): string {
  const timestamp = Date.now()
  return `past-events/${anonId}/${eventId}-${timestamp}.jpg`
}

/**
 * 写真（base64 data URL）を Supabase Storage にアップロードする。
 *
 * @returns アップロード成功時は Storage path、失敗時は null
 *
 * 失敗しても呼び出し元（insertPastEventCloud）は会の記録保存を続ける。
 */
export async function uploadPastEventPhoto(
  anonId: string,
  eventId: string,
  dataUrl: string,
): Promise<string | null> {
  try {
    const path = buildPastEventPhotoPath(anonId, eventId)
    const blob = dataUrlToBlob(dataUrl)

    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false, // timestamp 付きパスのため重複しない
      })

    if (error) {
      console.warn('[kanji] Storage upload エラー:', error.message)
      return null
    }

    return data.path
  } catch (e) {
    console.warn('[kanji] Storage upload 例外:', e)
    return null
  }
}

/**
 * Storage path から期限付き signed URL を生成する。
 *
 * 用途: 完了済みの会一覧・詳細画面で写真を表示するときに呼ぶ。
 *   - private bucket のため直接 URL では表示できない
 *   - 生成した URL はブラウザのキャッシュが効く間だけ有効
 *
 * @param storagePath buildPastEventPhotoPath で生成したパス
 * @param expiresIn   有効秒数（デフォルト 7 日）
 * @returns signed URL（失敗時は null）
 *
 * CLOUD-MIGRATION: Auth 導入後も API は変わらない（path 規則だけが変わる）
 */
export async function getPastEventPhotoSignedUrl(
  storagePath: string,
  expiresIn = 60 * 60 * 24 * 7, // 7 days
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error || !data) {
    console.warn('[kanji] signed URL 生成失敗:', error?.message)
    return null
  }

  return data.signedUrl
}

/**
 * Storage から写真を削除する。
 *
 * 用途: 将来、会の記録削除時に合わせて呼ぶ（現在は未使用）。
 */
export async function deletePastEventPhoto(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([storagePath])
  if (error) {
    console.warn('[kanji] Storage 削除失敗:', error.message)
  }
}
