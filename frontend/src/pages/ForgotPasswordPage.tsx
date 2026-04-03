/**
 * ForgotPasswordPage.tsx
 * Task: T-029 — Password Reset Flow (step 1)
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email'); return }

    setError(''); setLoading(true)

    const { error: supaErr } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` }
    )

    setLoading(false)

    if (supaErr) { setError(supaErr.message); return }
    setSent(true)
  }

  return (
    <PageShell>
      {sent ? (
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-garby-green/20 border border-garby-green/30
            flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Check your inbox</h2>
          <p className="text-garby-grey text-sm mb-6">
            We sent a password reset link to <strong className="text-white">{email}</strong>.
            Check your spam folder if it doesn't arrive within a minute.
          </p>
          <Link to="/login">
            <Button variant="secondary" fullWidth>Back to sign in</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-white mb-1">Reset your password</h1>
            <p className="text-garby-grey text-sm">
              Enter your email and we'll send you a reset link.
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="paul@garby.app"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              autoComplete="email"
              autoFocus
            />
            <Button type="submit" loading={loading} fullWidth size="lg">
              Send reset link
            </Button>
          </form>

          <p className="text-center text-sm text-garby-grey mt-6">
            Remember your password?{' '}
            <Link to="/login" className="text-garby-green hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </>
      )}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-garby-dark flex flex-col items-center justify-center px-4">
      <Link to="/" className="flex items-center gap-2 mb-8 group">
        <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
          <path d="M28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 9.373 9.373 4 16 4"
            stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="4" y1="16" x2="24" y2="16" stroke="#2ECC71" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="24" cy="16" r="2" fill="#2ECC71"/>
        </svg>
        <span className="font-bold text-white group-hover:text-garby-green transition-colors">Garby</span>
      </Link>
      <div className="w-full max-w-md bg-garby-mid border border-white/10 rounded-2xl p-8">
        {children}
      </div>
    </div>
  )
}
