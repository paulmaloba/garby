/**
 * hooks/useAuth.ts
 * Re-exports useAuth from AuthContext for cleaner imports.
 * Also exports useGuestScans — T-011 guest scan limit tracking.
 */

export { useAuth } from '@/context/AuthContext'

// ── Guest scan tracking — T-011 ───────────────────────────────────────────────

const GUEST_SCAN_KEY = 'garby_guest_scans'
const GUEST_SCAN_LIMIT = 3

export function useGuestScans() {
  const getCount = (): number => {
    try {
      return parseInt(sessionStorage.getItem(GUEST_SCAN_KEY) ?? '0', 10)
    } catch {
      return 0
    }
  }

  const increment = (): number => {
    const next = getCount() + 1
    try {
      sessionStorage.setItem(GUEST_SCAN_KEY, String(next))
    } catch {
      // sessionStorage unavailable — fail silently
    }
    return next
  }

  const hasReachedLimit = (): boolean => getCount() >= GUEST_SCAN_LIMIT
  const remaining = (): number => Math.max(0, GUEST_SCAN_LIMIT - getCount())

  return { getCount, increment, hasReachedLimit, remaining, limit: GUEST_SCAN_LIMIT }
}
