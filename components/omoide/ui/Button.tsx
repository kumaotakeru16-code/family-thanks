'use client'

import { type ReactNode } from 'react'

const C = {
  peach: '#F4B5B0',
  peachDeep: '#E89B95',
  peachSoft: '#FBDDD7',
  paper: '#FFFCF6',
  ink: '#3B2F22',
  inkSoft: '#6E5E4D',
  line: '#E9DEC8',
}

type Variant = 'primary' | 'ghost' | 'text' | 'icon'

interface ButtonProps {
  children: ReactNode
  variant?: Variant
  onClick?: () => void
  disabled?: boolean
  fullWidth?: boolean
  style?: React.CSSProperties
  className?: string
  type?: 'button' | 'submit'
}

export function Button({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  fullWidth = false,
  style = {},
  className = '',
  type = 'button',
}: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
    transition: 'transform 0.15s ease, box-shadow 0.18s ease, opacity 0.15s',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
    outline: 'none',
  }

  const variants: Record<Variant, React.CSSProperties> = {
    primary: {
      background: C.peach,
      color: '#fff',
      borderRadius: 999,
      padding: '14px 28px',
      fontSize: 16,
      boxShadow: '0 6px 16px rgba(232,155,149,0.30)',
    },
    ghost: {
      background: C.paper,
      color: C.ink,
      borderRadius: 999,
      padding: '12px 22px',
      fontSize: 15,
      border: `1px solid ${C.line}`,
    },
    text: {
      background: 'transparent',
      color: C.inkSoft,
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
    },
    icon: {
      background: C.paper,
      color: C.ink,
      borderRadius: 999,
      padding: 0,
      width: 44,
      height: 44,
      border: `1px solid ${C.line}`,
    },
  }

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      className={className}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={e => {
        if (disabled) return
        const el = e.currentTarget
        if (variant === 'primary') {
          el.style.transform = 'translateY(-1px)'
          el.style.boxShadow = '0 10px 24px rgba(232,155,149,0.36)'
        } else {
          el.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform = ''
        if (variant === 'primary') {
          el.style.boxShadow = '0 6px 16px rgba(232,155,149,0.30)'
        }
      }}
    >
      {children}
    </button>
  )
}

interface IconButtonProps {
  children: ReactNode
  onClick?: () => void
  accent?: boolean
  size?: number
  style?: React.CSSProperties
}

export function IconButton({ children, onClick, accent = false, size = 44, style = {} }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 999,
        border: accent ? 'none' : `1px solid ${C.line}`,
        background: accent ? C.peach : C.paper,
        color: accent ? '#fff' : C.ink,
        cursor: 'pointer',
        boxShadow: accent ? '0 6px 14px rgba(232,155,149,0.28)' : 'none',
        transition: 'transform 0.15s, box-shadow 0.15s',
        WebkitTapHighlightColor: 'transparent',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      {children}
    </button>
  )
}
