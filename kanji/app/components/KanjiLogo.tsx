// KanjiLogo.tsx
// KanjiMark + "KANJI" テキストのロックアップ

import KanjiMark from './KanjiMark'

type Props = {
  size?: number
  className?: string
}

export default function KanjiLogo({ size = 28, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 text-brand ${className}`}>
      <KanjiMark size={size} />
      <span
        className="font-black tracking-tight text-white"
        style={{
          fontSize: size * 0.75,
          fontFamily: 'var(--font-inter), "Helvetica Neue", sans-serif',
          letterSpacing: '-0.03em',
        }}
      >
        KANJI
      </span>
    </span>
  )
}
