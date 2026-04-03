/**
 * LoginPage.tsx
 * Task: T-008 — Login UI
 *
 * Email/password + Google OAuth sign in.
 * Reads ?error=oauth_failed from URL (set by AuthCallbackPage on failure).
 * Redirects to /dashboard on success (or to the originally requested URL).
 */

import { useState, type FormEvent, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface FormErrors {
  email?: string
  password?: string
  general?: string
}

export default function LoginPage() {
//   const { signInWithEmail, signInWithGoogle, user } = useAuth()
  const { signInWithEmail, signInWithGoogle, user, initialized } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors]     = useState<FormErrors>({})
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // If user is already logged in, redirect
//   useEffect(() => {
//     if (user) navigate('/dashboard', { replace: true })
//   }, [user, navigate])
// ===============================
// Redirect as soon as auth context confirms the user is signed in
useEffect(() => {
  if (user && initialized) {
    navigate('/dashboard', { replace: true })
  }
}, [user, initialized, navigate])

  // Show OAuth error if redirected back with ?error=oauth_failed
  useEffect(() => {
    if (searchParams.get('error') === 'oauth_failed') {
      setErrors({ general: 'Google sign-in failed. Please try again.' })
    }
  }, [searchParams])

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): FormErrors {
    const e: FormErrors = {}
    if (!email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email'
    if (!password) e.password = 'Password is required'
    return e
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

//   async function handleSubmit(e: FormEvent) {
//     e.preventDefault()
//     const validation = validate()
//     if (Object.keys(validation).length > 0) { setErrors(validation); return }
//     setErrors({})
//     setLoading(true)
//
//     const { error } = await signInWithEmail(email.trim(), password)
//     setLoading(false)
//
//     if (error) {
//       // Supabase returns 'Invalid login credentials' — make it friendlier
//       setErrors({
//         general: error.message.includes('Invalid login credentials')
//           ? 'Incorrect email or password. Please try again.'
//           : error.message,
//       })
//       return
//     }
//
//     navigate('/dashboard', { replace: true })
//   }
async function handleSubmit(e: FormEvent) {
  e.preventDefault()
  const validation = validate()
  if (Object.keys(validation).length > 0) { setErrors(validation); return }
  setErrors({})
  setLoading(true)

  const { error } = await signInWithEmail(email.trim(), password)

  if (error) {
    setLoading(false)
    setErrors({
      general: error.message.includes('Invalid login credentials')
        ? 'Incorrect email or password. Please try again.'
        : error.message,
    })
    return
  }

  // Auth state change will trigger the useEffect redirect below
  // setLoading stays true intentionally — spinner shows until navigation completes
}

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    if (error) {
      setErrors({ general: error.message })
      setGoogleLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
        <p className="text-garby-grey text-sm">Sign in to continue to Garby.</p>
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

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-garby-grey">or sign in with email</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {errors.general && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {errors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="paul@garby.app"
          value={email}
          onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: undefined })) }}
          error={errors.email}
          autoComplete="email"
          autoFocus
        />
        <div>
          <Input
            label="Password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={e => { setPassword(e.target.value); if (errors.password) setErrors(p => ({ ...p, password: undefined })) }}
            error={errors.password}
            autoComplete="current-password"
          />
          <div className="flex justify-end mt-1.5">
            <Link to="/forgot-password" className="text-xs text-garby-grey hover:text-garby-green transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-2">
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-garby-grey mt-6">
        Don't have an account?{' '}
        <Link to="/register" className="text-garby-green hover:underline font-medium">
          Sign up free
        </Link>
      </p>
    </AuthLayout>
  )
}

// ── Auth layout (same as RegisterPage) ────────────────────────────────────────

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-garby-dark flex">
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
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
      <div className="hidden lg:flex flex-1 bg-garby-mid border-l border-white/5 flex-col justify-center items-center px-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-garby-green/5 rounded-full blur-3xl" />
        </div>
        <div className="relative text-center max-w-xs">
          <p className="text-xs font-semibold tracking-widest text-garby-green uppercase mb-6">Garby</p>
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Drawing the line between real and generated.
          </h2>
          <p className="text-garby-grey text-sm leading-relaxed">
            Scan any image. Get the truth instantly. Built to protect human creativity in the age of AI.
          </p>
          <div className="mt-10 bg-garby-dark border border-white/10 rounded-xl p-4 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="badge-real text-xs">REAL</span>
              <span className="text-xs font-mono text-garby-green">98.1%</span>
            </div>
            <div className="space-y-1.5">
              {['Natural EXIF metadata present', 'Authentic lens distortion', 'Consistent lighting'].map(s => (
                <div key={s} className="flex items-center gap-2 text-xs text-garby-grey">
                  <div className="w-1.5 h-1.5 rounded-full bg-garby-green shrink-0" />
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
