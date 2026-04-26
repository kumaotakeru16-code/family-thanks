// FeatureIcon — brand PNG アセットを使う機能アイコン
// public/brand/ 配下の PNG ファイルを参照する
import type React from 'react'

type FeatureIconType =
  | 'schedule'
  | 'participants'
  | 'store'
  | 'settlement'
  | 'complete'
  | 'thanks'

type Props = {
  type: FeatureIconType
  size?: number
  className?: string
  style?: React.CSSProperties
  /** フレーム（黒丸角背景）を表示するか。デフォルト false */
  framed?: boolean
}

const ICON_SRC: Record<FeatureIconType, string> = {
  schedule:     '/brand/icon-schedule.png',
  participants: '/brand/icon-participants.png',
  store:        '/brand/icon-store.png',
  settlement:   '/brand/icon-settlement.png',
  complete:     '/brand/icon-complete.png',
  thanks:       '/brand/icon-thanks.png',
}

const ICON_ALT: Record<FeatureIconType, string> = {
  schedule:     '日程調整',
  participants: '参加者',
  store:        'お店選び',
  settlement:   '清算',
  complete:     '完了',
  thanks:       '完了・お疲れさま',
}

export function FeatureIcon({ type, size = 28, className = '', style, framed = false }: Props) {
  const src = ICON_SRC[type]
  const alt = ICON_ALT[type]

  if (framed) {
    const frameSize = Math.round(size * 1.6)
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl bg-black/80 ${className}`}
        style={{ width: frameSize, height: frameSize }}
      >
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          style={{ objectFit: 'contain' }}
          draggable={false}
        />
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', ...style }}
      draggable={false}
    />
  )
}
