// RatingIcon — よかった / ふつう / いまいち 評価アイコン
// public/brand/ 配下の PNG ファイルを参照する

type RatingIconType = 'good' | 'normal' | 'bad'

type Props = {
  type: RatingIconType
  size?: number
  className?: string
}

const ICON_SRC: Record<RatingIconType, string> = {
  good:   '/brand/icon-rating-good.png',
  normal: '/brand/icon-rating-normal.png',
  bad:    '/brand/icon-rating-bad.png',
}

const ICON_ALT: Record<RatingIconType, string> = {
  good:   'よかった',
  normal: 'ふつう',
  bad:    'いまいち',
}

export function RatingIcon({ type, size = 32, className = '' }: Props) {
  return (
    <img
      src={ICON_SRC[type]}
      alt={ICON_ALT[type]}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
      draggable={false}
    />
  )
}
