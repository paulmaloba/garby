/**
 * GuestGuard.tsx
 * Task: T-011 — Guest Mode & Scan Limits
 *
 * Wraps the scan action. Checks guest scan count before allowing submission.
 * If limit is hit, shows an inline upgrade prompt instead of running the scan.
 * Used inside ScanPage (T-012) when it's built.
 */

import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useGuestScans } from '@/hooks/useAuth'

interface GuestGuardProps {
  onAllow: () => void
  children: (props: { onScan: () => void; blocked: boolean }) => React.ReactNode
}

export default function GuestGuard({ onAllow, children }: GuestGuardProps) {
  const { user } = useAuth()
  const guestScans = useGuestScans()

  function handleScanAttempt() {
    // Logged-in users always pass through
    if (user) { onAllow(); return }

    // Guest — check limit
    if (guestScans.hasReachedLimit()) return  // GuestBanner handles the UI

    // Increment guest count then allow
    guestScans.increment()
    onAllow()
  }

  const blocked = !user && guestScans.hasReachedLimit()

  return <>{children({ onScan: handleScanAttempt, blocked })}</>
}

/**
 * GuestLimitReached — Inline upgrade prompt shown inside the scan area
 * when a guest has exhausted their 3 free scans.
 */
export function GuestLimitReached() {
  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="font-semibold text-white mb-2">Guest scans used up</h3>
      <p className="text-garby-grey text-sm mb-5">
        You've used all 3 free guest scans. Create a free account to get 20 scans per month — no credit card required.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/register" className="btn-primary text-sm py-2.5 px-6">
          Create free account
        </Link>
        <Link to="/login" className="btn-secondary text-sm py-2.5 px-6">
          Sign in
        </Link>
      </div>
    </div>
  )
}
