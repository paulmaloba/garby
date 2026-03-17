import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import type { GarbyUser } from '../types'

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: GarbyUser
      isGuest?: boolean
    }
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

/**
 * requireAuth — Hard auth gate. Returns 401 if no valid JWT.
 * Use on routes that require a logged-in user (e.g. /dashboard, /profile).
 * Full implementation: T-007
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required.' })
    return
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      res.status(401).json({ success: false, message: 'Invalid or expired token.' })
      return
    }

    // TODO T-007: fetch full GarbyUser from DB and attach to req.user
    req.user = {
      id: user.id,
      email: user.email ?? '',
      display_name: user.user_metadata?.full_name ?? null,
      tier: 'free',
      scans_used_this_month: 0,
      created_at: user.created_at,
    }

    next()
  } catch {
    res.status(500).json({ success: false, message: 'Auth service error.' })
  }
}

/**
 * optionalAuth — Soft auth gate. Attaches user if JWT present,
 * otherwise marks request as guest. Use on /api/scan (guest scanning allowed).
 * Full implementation: T-007 + T-011
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.isGuest = true
    return next()
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    const { data: { user } } = await supabase.auth.getUser(token)

    if (user) {
      req.user = {
        id: user.id,
        email: user.email ?? '',
        display_name: user.user_metadata?.full_name ?? null,
        tier: 'free',
        scans_used_this_month: 0,
        created_at: user.created_at,
      }
      req.isGuest = false
    } else {
      req.isGuest = true
    }
  } catch {
    req.isGuest = true
  }

  next()
}
