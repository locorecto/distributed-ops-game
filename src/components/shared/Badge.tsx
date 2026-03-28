import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  color?: string
  className?: string
}

export function Badge({ children, color, className }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium', className)}
      style={color ? { backgroundColor: color + '22', color, border: `1px solid ${color}44` } : {}}
    >
      {children}
    </span>
  )
}
