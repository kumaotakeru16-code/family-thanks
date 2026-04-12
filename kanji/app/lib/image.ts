/**
 * image.ts — 画像圧縮ユーティリティ
 *
 * 責務: 画像を軽くする（compress only）
 *
 * このファイルがやること:
 *   - compressImageToDataUrl : File → 圧縮 JPEG data URL（プレビュー表示 / アップロード元）
 *   - dataUrlToBlob          : data URL → Blob（Storage アップロード前変換）
 *
 * このファイルがやらないこと:
 *   - Supabase Storage への PUT
 *   - URL の取得・管理
 *   → それらは supabase-user-store.ts の責務
 *
 * 完了保存フローでの位置づけ:
 *   1. compressImageToDataUrl(file)  → dataUrl（プレビュー & アップロード元）
 *   2. dataUrlToBlob(dataUrl)        → Blob（supabase-user-store.ts 内で呼ぶ）
 *   3. supabase.storage.upload(...)  → Storage path
 *   4. past_events.photo_url に path を保存
 */

/**
 * 画像ファイルを canvas で圧縮し JPEG data URL として返す。
 *
 * 用途:
 *   - UI での即時プレビュー表示
 *   - Supabase Storage アップロード前の圧縮元データ
 *   - localStorage へのフォールバック保存（容量制約に注意）
 *
 * @param file     選択された画像ファイル
 * @param maxSide  長辺の最大ピクセル数（デフォルト 1280px）
 * @param quality  JPEG 品質 0〜1（デフォルト 0.75）
 */
export async function compressImageToDataUrl(
  file: File,
  maxSide = 1280,
  quality = 0.75,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const { naturalWidth: w, naturalHeight: h } = img
      const scale = Math.min(1, maxSide / Math.max(w, h))
      const cw = Math.round(w * scale)
      const ch = Math.round(h * scale)

      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas context unavailable'))
        return
      }

      ctx.drawImage(img, 0, 0, cw, ch)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image load failed'))
    }

    img.src = objectUrl
  })
}

/**
 * base64 data URL を Blob に変換する。
 *
 * 用途: Supabase Storage へアップロードする直前に呼ぶ。
 *   dataUrlToBlob(dataUrl) → supabase.storage.from(...).upload(path, blob)
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}
