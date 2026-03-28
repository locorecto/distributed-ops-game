import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed',
        {
          'bg-blue-600 hover:bg-blue-500 text-white': variant === 'primary',
          'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-600': variant === 'secondary',
          'bg-red-700 hover:bg-red-600 text-white': variant === 'danger',
          'text-slate-300 hover:text-white hover:bg-slate-700': variant === 'ghost',
        },
        {
          'px-2 py-1 text-xs gap-1': size === 'sm',
          'px-3 py-1.5 text-sm gap-1.5': size === 'md',
          'px-4 py-2 text-base gap-2': size === 'lg',
        },
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
