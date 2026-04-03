/**
 * RegisterPage.tsx
 * Task: T-008 — Register UI
 *
 * Full registration flow:
 * - Display name, email, password, confirm password
 * - Client-side validation with inline error states
 * - Google OAuth option
 * - Loading states
 * - Redirect to /dashboard on success
 */

import { useState, type FormEvent, useEffect } from 'react'
// import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface FormState {
  displayName: string
  email: string
  password: string
  confirmPassword: string
}

interface FormErrors {
  displayName?: string
  email?: string
  password?: string
  confirmPassword?: string
  general?: string
}

export default function RegisterPage() {
//   const { signUpWithEmail, signInWithGoogle } = useAuth()
//   const navigate = useNavigate()
  const { signUpWithEmail, signInWithGoogle, user, initialized } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && initialized) navigate('/dashboard', { replace: true })
  }, [user, initialized, navigate])

  const [form, setForm] = useState<FormState>({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): FormErrors {
    const e: FormErrors = {}

    if (!form.displayName.trim()) {
      e.displayName = 'Name is required'
    } else if (form.displayName.trim().length < 2) {
      e.displayName = 'Name must be at least 2 characters'
    }

    if (!form.email.trim()) {
      e.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Please enter a valid email address'
    }

    if (!form.password) {
      e.password = 'Password is required'
    } else if (form.password.length < 8) {
      e.password = 'Password must be at least 8 characters'
    } else if (!/[A-Z]/.test(form.password)) {
      e.password = 'Include at least one uppercase letter'
    } else if (!/[0-9]/.test(form.password)) {
      e.password = 'Include at least one number'
    }

    if (!form.confirmPassword) {
      e.confirmPassword = 'Please confirm your password'
    } else if (form.password !== form.confirmPassword) {
      e.confirmPassword = 'Passwords do not match'
    }

    return e
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validation = validate()
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      return
    }
    setErrors({})
    setLoading(true)

    const { error } = await signUpWithEmail(
      form.email.trim(),
      form.password,
      form.displayName.trim()
    )

    setLoading(false)

    if (error) {
      setErrors({ general: error.message })
      return
    }

    // Supabase sends a confirmation email — show success state
    setSuccess(true)
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    if (error) {
      setErrors({ general: error.message })
      setGoogleLoading(false)
    }
    // On success, browser redirects to /auth/callback — no need to setLoading(false)
  }

  function handleChange(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  // ── Success state ────────────────────────────────────────────────────────────

  if (success) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-garby-green/20 border border-garby-green/40 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>
          <p className="text-garby-grey text-sm mb-6">
            We've sent a confirmation link to <strong className="text-white">{form.email}</strong>.
            Click it to activate your account.
          </p>
          <Button variant="secondary" onClick={() => navigate('/login')} fullWidth>
            Back to sign in
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
        <p className="text-garby-grey text-sm">Start detecting AI-generated content for free.</p>
      </div>

      {/* Google OAuth */}
      <Button
        variant="secondary"
        fullWidth
        loading={googleLoading}
        onClick={handleGoogleSignIn}
        className="mb-6"
      >
        {!googleLoading && (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        Continue with Google
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-garby-grey">or sign up with email</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* General error */}
      {errors.general && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {errors.general}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Your name"
          type="text"
          placeholder="Paul Maloba"
          value={form.displayName}
          onChange={e => handleChange('displayName', e.target.value)}
          error={errors.displayName}
          autoComplete="name"
          autoFocus
        />
        <Input
          label="Email address"
          type="email"
          placeholder="paul@garby.app"
          value={form.email}
          onChange={e => handleChange('email', e.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <Input
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={e => handleChange('password', e.target.value)}
          error={errors.password}
          hint="Must include an uppercase letter and a number"
          autoComplete="new-password"
        />
        <Input
          label="Confirm password"
          type="password"
          placeholder="Repeat your password"
          value={form.confirmPassword}
          onChange={e => handleChange('confirmPassword', e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-6">
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-garby-grey mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-garby-green hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

// ── Auth layout shell ─────────────────────────────────────────────────────────

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-garby-dark flex">
      {/* Left panel — form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mb-10 group">
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

      {/* Right panel — brand (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 bg-garby-mid border-l border-white/5 flex-col justify-center items-center px-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-garby-green/5 rounded-full blur-3xl" />
        </div>
        <div className="relative text-center max-w-xs">
          <p className="text-xs font-semibold tracking-widest text-garby-green uppercase mb-6">
            Garby
          </p>
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Drawing the line between real and generated.
          </h2>
          <p className="text-garby-grey text-sm leading-relaxed">
            Scan any image. Get the truth instantly. Built to protect human creativity in the age of AI.
          </p>

          {/* Mock result card */}
          <div className="mt-10 bg-garby-dark border border-white/10 rounded-xl p-4 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="badge-ai text-xs">AI GENERATED</span>
              <span className="text-xs font-mono text-garby-green">94.3%</span>
            </div>
            <div className="space-y-1.5">
              {['GAN texture artifacts', 'Diffusion fingerprint', 'Lighting inconsistency'].map(s => (
                <div key={s} className="flex items-center gap-2 text-xs text-garby-grey">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
