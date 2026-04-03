/**
 * AuthCallbackPage.tsx
 * Task: T-007 — handles the OAuth redirect from Google after login.
 * Supabase processes the URL hash automatically; we just redirect the user.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase reads the URL hash/query params and sets the session automatically.
    // We listen for the session to be ready, then redirect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/login?error=oauth_failed', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-garby-dark flex items-center justify-center">
      <div className="text-center">
        {/* Animated Garby logo */}
        <div className="flex justify-center mb-6">
          <svg viewBox="0 0 64 64" fill="none" className="w-12 h-12 animate-spin-slow">
            <path
              d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
              stroke="#2ECC71" strokeWidth="4" strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-garby-grey text-sm">Completing sign in...</p>
      </div>
    </div>
  )
}
