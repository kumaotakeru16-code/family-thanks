import Link from 'next/link'

export default function Home() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      color: '#3a3530',
    }}>
      <p style={{ fontSize: 14, color: '#a89685', marginBottom: 24 }}>
        準備中です
      </p>
      <Link
        href="/omoide"
        style={{
          padding: '12px 28px',
          borderRadius: 999,
          background: '#F4B5B0',
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          textDecoration: 'none',
        }}
      >
        おもいで英語えほん →
      </Link>
    </div>
  )
}
