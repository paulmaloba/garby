/**
 * ProtectedRoute.tsx
 * Task: T-009 — Protected Routes
 *
 * Wraps any route that requires authentication.
 * - Shows a loading spinner while auth state initialises
 * - Redirects unauthenticated users to /login
 * - Preserves the originally requested URL so users land back after login
 */

import { Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function ProtectedRoute() {
  const { user, initialized } = useAuth()
  const location = useLocation()

  // Auth state hasn't loaded from Supabase yet — show spinner
  if (!initialized) {
    return (
      <div className="min-h-screen bg-garby-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg viewBox="0 0 64 64" fill="none" className="w-10 h-10 animate-spin">
            <path
              d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
              stroke="#2ECC71" strokeWidth="4" strokeLinecap="round"
            />
          </svg>
          <p className="text-garby-grey text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Not authenticated — redirect to login, preserve intended destination
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Authenticated — render the child route
  return <Outlet />
}
