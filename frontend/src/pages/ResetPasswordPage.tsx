/**
 * ResetPasswordPage.tsx
 * Task: T-029 — Password Reset Flow (step 2)
 *
 * Supabase redirects here after the user clicks the email link.
 * The URL contains the recovery token in the hash — Supabase reads it automatically.
 */

import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  const [ready, setReady]         = useState(false)
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(false)

  // Supabase fires PASSWORD_RECOVERY event when it reads the token from URL hash
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  function validate(): string {
    if (!password)             return 'Password is required'
    if (password.length < 8)   return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(password)) return 'Include at least one uppercase letter'
    if (!/[0-9]/.test(password)) return 'Include at least one number'
    if (password !== confirm)  return 'Passwords do not match'
    return ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }

    setError(''); setLoading(true)

    const { error: supaErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (supaErr) { setError(supaErr.message); return }

    setSuccess(true)
    setTimeout(() => navigate('/dashboard', { replace: true }), 2500)
  }

  // ── Not yet ready — waiting for Supabase token ────────────────────────────
  if (!ready) return (
    <PageShell>
      <div className="text-center py-4">
        <svg viewBox="0 0 64 64" fill="none" className="w-10 h-10 animate-spin mx-auto mb-4">
          <path d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
            stroke="#2ECC71" strokeWidth="4" strokeLinecap="round"/>
        </svg>
        <p className="text-garby-grey text-sm">Verifying your reset link...</p>
        <p className="text-garby-grey text-xs mt-2">
          If this takes too long,{' '}
          <Link to="/forgot-password" className="text-garby-green hover:underline">
            request a new link
          </Link>
        </p>
      </div>
    </PageShell>
  )

  // ── Success ───────────────────────────────────────────────────────────────
  if (success) return (
    <PageShell>
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-garby-green/20 border border-garby-green/30
          flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Password updated</h2>
        <p className="text-garby-grey text-sm">Redirecting you to your dashboard...</p>
      </div>
    </PageShell>
  )

  // ── Reset form ────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-white mb-1">Set new password</h1>
        <p className="text-garby-grey text-sm">Choose a strong password for your Garby account.</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="New password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          hint="Must include an uppercase letter and a number"
          autoComplete="new-password"
          autoFocus
        />
        <Input
          label="Confirm new password"
          type="password"
          placeholder="Repeat your password"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setError('') }}
          autoComplete="new-password"
        />
        <Button type="submit" loading={loading} fullWidth size="lg">
          Update password
        </Button>
      </form>
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
