type IconProps = { size?: number; color?: string; className?: string }

const s = (size: number, color: string) => ({
  width: size, height: size,
  display: 'inline-block', flexShrink: 0,
  color,
})

export function ChevLeftIcon({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M15 5L8 12L15 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function ChevRightIcon({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function PlusIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  )
}

export function CheckIcon({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M5 12L10 17L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function SpeakerIcon({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M4 9V15H8L13 19V5L8 9Z" fill="currentColor"/>
      <path d="M16 8C18 10 18 14 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M18.5 5.5C22 9 22 15 18.5 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6"/>
    </svg>
  )
}

export function PauseIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1.5"/>
      <rect x="14" y="5" width="4" height="14" rx="1.5"/>
    </svg>
  )
}

export function PlayIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5L19 12L7 19Z"/>
    </svg>
  )
}

export function PrevIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 5L8 12L16 19Z M6 5H8V19H6Z"/>
    </svg>
  )
}

export function NextIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5L16 12L8 19Z M16 5H18V19H16Z"/>
    </svg>
  )
}

export function BookIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M4 5C4 3.9 4.9 3 6 3H19V21H6C4.9 21 4 20.1 4 19V5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M12 3V21" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
      <path d="M8 8H10M8 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function HomeIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M3 11L12 3L21 11V20H14V14H10V20H3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function UserIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M4 21C4 17.134 7.582 14 12 14C16.418 14 20 17.134 20 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function SparkleIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
      <path d="M19 14L19.8 16.8L22.6 17.6L19.8 18.4L19 21.2L18.2 18.4L15.4 17.6L18.2 16.8L19 14Z" opacity="0.6"/>
    </svg>
  )
}

export function XIcon({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function StarIcon({ size = 22, color = '#F2D27C' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24">
      <path d="M12 2.5L14.7 9L21.5 9.6L16.3 14L18 20.5L12 17L6 20.5L7.7 14L2.5 9.6L9.3 9Z"
        fill={color} stroke="#D9B658" strokeWidth="1" strokeLinejoin="round"/>
    </svg>
  )
}

export function CameraIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <path d="M9 3H15L17 5H21C21.6 5 22 5.4 22 6V19C22 19.6 21.6 20 21 20H3C2.4 20 2 19.6 2 19V6C2 5.4 2.4 5 3 5H7L9 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}

export function ImageIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg style={s(size, color)} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 16L8 11L12 15L15 12L21 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
