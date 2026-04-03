/**
 * rateLimiter.ts
 * Task: T-016 — Scan Rate Limiting
 *
 * Two layers of rate limiting:
 *
 * 1. IP-based hard limiter — express-rate-limit (in-memory, no Redis needed for MVP)
 *    Blocks abuse from a single IP regardless of auth status.
 *    Limit: 30 requests per 15 minutes per IP.
 *
 * 2. Tier-based monthly scan quota — checked against the DB per authenticated user.
 *    Guest:      3 scans (tracked via session cookie on frontend, enforced here)
 *    Free:       20 scans per calendar month
 *    Pro:        unlimited
 *    Enterprise: unlimited
 */

import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { SCAN_LIMITS } from '../types'

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

// ── 1. IP-based hard limiter ──────────────────────────────────────────────────

export const ipScanLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,   // 15 minutes
  max:              30,               // max 30 scan requests per window per IP
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: 'Too many scan requests from this IP. Please wait 15 minutes before trying again.',
    code:    'RATE_LIMIT_IP',
  },
  skip: req => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test'
  },
})

// ── 2. Tier-based monthly quota ───────────────────────────────────────────────

/**
 * checkScanQuota — Middleware that enforces per-user monthly scan limits.
 * Must run AFTER optionalAuth so req.user / req.isGuest is populated.
 *
 * Flow:
 *   - Guest users: limit enforced on the frontend via sessionStorage.
 *     The backend trusts the guest count header sent by the client (X-Guest-Scans).
 *     If it exceeds the guest limit, return 429.
 *   - Free users: query DB scan count for the current calendar month.
 *   - Pro / Enterprise: pass through immediately.
 */
export async function checkScanQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ── Guest path ────────────────────────────────────────────────────────────
    if (req.isGuest) {
      const guestCount = parseInt(req.headers['x-guest-scans'] as string ?? '0', 10)

      if (guestCount >= SCAN_LIMITS.guest) {
        res.status(429).json({
          success: false,
          message: `Guest scan limit reached (${SCAN_LIMITS.guest} scans). Create a free account for 20 scans per month.`,
          code:    'QUOTA_GUEST_EXCEEDED',
          limit:   SCAN_LIMITS.guest,
        })
        return
      }

      return next()
    }

    // ── Authenticated path ────────────────────────────────────────────────────
    const user = req.user!
    const tier = user.tier

    // Pro and Enterprise — no limit
    if (tier === 'pro' || tier === 'enterprise') return next()

    // Free — check monthly count in DB
    const now            = new Date()
    const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { count, error } = await supabase
      .from('scans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .gte('scanned_at', monthStart)

    if (error) {
      // If we can't check the quota, fail open — don't block the user
      console.error('[RateLimit] Failed to check scan quota:', error.message)
      return next()
    }

    const used  = count ?? 0
    const limit = SCAN_LIMITS[tier]

    if (used >= limit) {
      res.status(429).json({
        success: false,
        message: `Monthly scan limit reached (${limit} scans on the ${tier} plan). Upgrade to Pro for unlimited scans.`,
        code:    'QUOTA_MONTHLY_EXCEEDED',
        used,
        limit,
        reset:   new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      })
      return
    }

    // Attach quota info to request for use downstream
    req.user = { ...user, scans_used_this_month: used }
    next()

  } catch (err) {
    next(err)
  }
}
