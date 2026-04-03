/**
 * Button.tsx — Reusable branded button component
 */

import { type ButtonHTMLAttributes, type ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
  fullWidth?: boolean
}

const variants = {
  primary:   'bg-garby-green text-garby-dark hover:brightness-110 disabled:opacity-50',
  secondary: 'border border-garby-green text-garby-green hover:bg-garby-green hover:text-garby-dark disabled:opacity-50',
  ghost:     'text-garby-grey hover:text-white hover:bg-white/5 disabled:opacity-50',
  danger:    'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50',
}

const sizes = {
  sm: 'text-xs px-3 py-2 rounded-md',
  md: 'text-sm px-5 py-2.5 rounded-lg',
  lg: 'text-base px-8 py-3.5 rounded-lg',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-semibold
        transition-all duration-200 active:scale-95
        cursor-pointer disabled:cursor-not-allowed disabled:active:scale-100
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
