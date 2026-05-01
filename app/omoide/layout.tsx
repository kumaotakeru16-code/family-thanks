import type { Metadata, Viewport } from 'next'
import { Zen_Maru_Gothic } from 'next/font/google'
import './omoide.css'

const zenMaruGothic = Zen_Maru_Gothic({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-zen-maru',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'おもいで英語えほん',
  description: '子どもの写真と思い出から、あなただけの英語絵本をAIが作ります',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function OmoideLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`omoide-root ${zenMaruGothic.variable}`}
      style={{ fontFamily: 'var(--font-zen-maru), "Hiragino Maru Gothic ProN", system-ui, sans-serif' }}
    >
      {children}
    </div>
  )
}
