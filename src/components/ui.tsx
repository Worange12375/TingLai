// 通用 UI 原子组件：Card / Button / Badge / SectionTitle / Modal / EmptyState
import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

/* ---------------------------------- Card ---------------------------------- */

export function Card({
  children,
  className = '',
  hoverable = false,
  as: As = 'div',
  style,
}: {
  children: ReactNode
  className?: string
  hoverable?: boolean
  as?: 'div' | 'section' | 'article'
  style?: CSSProperties
}) {
  return (
    <As
      style={style}
      className={[
        'rounded-3xl bg-paper-light/85 backdrop-blur-[2px] sketch-border shadow-card paper-texture watercolor',
        hoverable ? 'transition duration-300 hover:-translate-y-1 hover:shadow-lift' : '',
        className,
      ].join(' ')}
    >
      {children}
    </As>
  )
}

/* --------------------------------- Button --------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-sunset text-ink hover:bg-sunset-dark hover:text-paper-light shadow-soft',
  secondary: 'bg-moss text-paper-light hover:bg-moss-dark shadow-soft',
  soft: 'bg-wood-light/60 text-ink hover:bg-wood-light sketch-border',
  ghost: 'bg-transparent text-ink-soft hover:bg-wood-light/40',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-[15px]',
  lg: 'px-7 py-3.5 text-base',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...rest}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
        'transition duration-200 active:scale-[0.97]',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-feather focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/* --------------------------------- Badge ---------------------------------- */

export function Badge({
  children,
  tone = 'moss',
  className = '',
  title,
}: {
  children: ReactNode
  tone?: 'moss' | 'sunset' | 'feather' | 'blossom' | 'wood'
  className?: string
  /** 悬浮提示，用于展示更详细的状态说明 */
  title?: string
}) {
  const tones: Record<string, string> = {
    moss: 'bg-moss/18 text-leaf',
    sunset: 'bg-sunset/25 text-sunset-dark',
    feather: 'bg-feather/20 text-feather-dark',
    blossom: 'bg-blossom/28 text-ink-soft',
    wood: 'bg-wood/25 text-ink-soft',
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/* ------------------------------ SectionTitle ------------------------------ */

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string
  sub?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-ink flex items-center gap-2">
          <span className="inline-block w-2 h-6 rounded-full bg-sunset" />
          {title}
        </h2>
        {sub && <p className="text-sm text-ink-soft mt-1.5">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/* --------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm animate-fadeUp"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto animate-popIn no-scrollbar">
        {children}
      </div>
    </div>
  )
}

/* ------------------------------- EmptyState ------------------------------- */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto w-20 h-20 grid place-items-center rounded-full bg-wood-light/40 text-3xl mb-4">
        {icon ?? '🍃'}
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {desc && <p className="text-sm text-ink-soft mt-2 max-w-md mx-auto leading-relaxed">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------ DevBanner -------------------------------- */

/**
 * "建设中"提示条：初稿阶段，对尚未完整实现的功能做诚实标注。
 * 用法：放在页面顶部 SectionTitle 下方，children 写"为什么还没做 / 当前能做到哪一步"。
 */
export function DevBanner({
  children,
  title = '本模块仍在开发中',
}: {
  children: ReactNode
  title?: string
}) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-2xl border-2 border-dashed border-amber-400/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 animate-fadeUp"
      role="status"
    >
      <span className="text-lg shrink-0 leading-none" aria-hidden="true">🚧</span>
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="leading-relaxed text-amber-800/90 mt-0.5">{children}</p>
      </div>
    </div>
  )
}

/* -------------------------------- Progress -------------------------------- */

/** 置信度进度条 */
export function ConfidenceBar({ value, delay = 0 }: { value: number; delay?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  const tone = pct >= 70 ? 'bg-moss' : pct >= 40 ? 'bg-blossom' : 'bg-wood'
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2.5 rounded-full bg-wood-light/45 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone} transition-[width] duration-[900ms] ease-out`}
          style={{ width: `${pct}%`, transitionDelay: `${delay}ms` }}
        />
      </div>
      <span className="text-sm font-bold tabular-nums text-ink-soft w-11 text-right">{pct}%</span>
    </div>
  )
}
