/**
 * image.ts — 画像圧縮ユーティリティ
 *
 * localStorage に base64 で保存する前に圧縮することで容量制限を回避する。
 * 将来 Supabase Storage などへ移行する際は、このファイルだけ差し替えればよい。
 *
 * ⚠️ pastEventRecords に base64 を直接持つ現在の設計は容量制限に弱い。
 *    写真1枚でも圧縮後 200〜400KB 程度になるため、複数枚になると限界が来る。
 *    長期的には Supabase Storage 等への URL 参照方式への移行を推奨。
 */

/**
 * 画像ファイルを canvas で圧縮し JPEG data URL として返す。
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
