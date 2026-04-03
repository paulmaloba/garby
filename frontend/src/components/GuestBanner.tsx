/**
 * GuestBanner.tsx
 * Task: T-011 — Guest Mode & Scan Limits
 *
 * Persistent banner shown to non-authenticated users.
 * Tracks remaining guest scans via sessionStorage.
 * Prompts registration when limit is hit.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGuestScans } from '@/hooks/useAuth'
import { useAuth } from '@/hooks/useAuth'

export default function GuestBanner() {
  const { user } = useAuth()
  const { remaining, limit, hasReachedLimit } = useGuestScans()
  const [dismissed, setDismissed] = useState(false)

  // Don't show to logged-in users or if dismissed
  if (user || dismissed) return null

  // Limit reached — show blocking upgrade prompt
  if (hasReachedLimit()) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-red-500/30 bg-garby-dark/95 backdrop-blur-md px-4 py-4">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-white text-sm">
              You've used all {limit} free guest scans
            </p>
            <p className="text-garby-grey text-xs mt-0.5">
              Create a free account to get 20 scans per month — no credit card needed.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/login" className="text-sm text-garby-grey hover:text-white transition-colors whitespace-nowrap">
              Sign in
            </Link>
            <Link
              to="/register"
              className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
            >
              Create free account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show warning when 1 scan remaining
  if (remaining() > 1) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-yellow-500/30 bg-garby-dark/95 backdrop-blur-md px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm text-yellow-400">
          <span className="font-semibold">1 guest scan remaining.</span>{' '}
          <span className="text-garby-grey">Sign up free for 20 scans/month.</span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-garby-grey hover:text-white transition-colors"
          >
            Dismiss
          </button>
          <Link to="/register" className="btn-primary text-xs py-1.5 px-3">
            Sign up free
          </Link>
        </div>
      </div>
    </div>
  )
}
