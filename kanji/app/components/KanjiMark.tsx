// KanjiMark.tsx
// カレンダー枠 + 右上へ飛び出す大きなチェック
// ブランドイメージ(image4)の形に忠実: 正方形フレーム・チェックが枠外へ延びる
// strokeLinecap / strokeLinejoin = "square" で直角ジョイント

type Props = {
  size?: number
  color?: string
  className?: string
}

export default function KanjiMark({ size = 32, color = 'currentColor', className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* カレンダー本体（正方形フレーム） */}
      <rect
        x="2"
        y="6"
        width="18"
        height="18"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      />
      {/* ヘッダー区切り線 */}
      <line
        x1="2" y1="12"
        x2="20" y2="12"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="square"
      />
      {/* ピン（左） */}
      <line
        x1="7" y1="3"
        x2="7" y2="9"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="square"
      />
      {/* ピン（右） */}
      <line
        x1="15" y1="3"
        x2="15" y2="9"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="square"
      />
      {/* チェックマーク — 枠内から右上へ飛び出す
          起点(7,20) → 谷(12,25) → 先端(29,5)
          → 枠を突き破って外へ出る形 */}
      <polyline
        points="7,20 12,25 29,5"
        stroke={color}
        strokeWidth="2.8"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  )
}
