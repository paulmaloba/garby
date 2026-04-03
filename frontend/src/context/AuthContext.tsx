/**
 * AuthContext.tsx
 * Task: T-007 — Supabase Auth Integration
 *
 * Provides authentication state and actions to the entire React app.
 * Wraps Supabase Auth — handles session persistence, token refresh,
 * Google OAuth, and email/password flows.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserTier = 'guest' | 'free' | 'pro' | 'enterprise'

export interface GarbyProfile {
  id: string
  email: string
  display_name: string | null
  tier: UserTier
  scans_used_this_month: number
  created_at: string
}

interface AuthState {
  user: User | null
  session: Session | null
  profile: GarbyProfile | null
  loading: boolean
  initialized: boolean
}

interface AuthActions {
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<{ error: AuthError | null }>
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

type AuthContextValue = AuthState & AuthActions

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    initialized: false,
  })

  // Fetch the Garby user profile from our DB (extends Supabase auth.users)
  const fetchProfile = useCallback(async (userId: string): Promise<GarbyProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, display_name, tier, scans_used_this_month, created_at')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[Auth] Failed to fetch profile:', error.message)
        return null
      }

      return data as GarbyProfile
    } catch (err) {
      console.error('[Auth] Profile fetch error:', err)
      return null
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!state.user) return
    const profile = await fetchProfile(state.user.id)
    setState(prev => ({ ...prev, profile }))
  }, [state.user, fetchProfile])

  // Initialise auth state and subscribe to changes
  useEffect(() => {
    // Get initial session (persisted from previous visit)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const profile = session?.user ? await fetchProfile(session.user.id) : null
      setState({
        user: session?.user ?? null,
        session,
        profile,
        loading: false,
        initialized: true,
      })
    })

    // Subscribe to future auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change:', event)

        const profile = session?.user ? await fetchProfile(session.user.id) : null

        setState({
          user: session?.user ?? null,
          session,
          profile,
          loading: false,
          initialized: true,
        })
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // ── Auth actions ────────────────────────────────────────────────────────────

  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName ?? '' },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{
      ...state,
      signUpWithEmail,
      signInWithEmail,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
