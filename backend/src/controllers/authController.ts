/**
 * authController.ts — Auth controller
 * Task: T-007
 */

import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

/**
 * GET /api/auth/me
 * Returns the full Garby user profile from the database.
 * req.user is already populated by requireAuth middleware.
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' })
      return
    }

    // Fetch full profile from our users table
    const { data, error } = await supabase
      .from('users')
      .select('id, email, display_name, tier, scans_used_this_month, created_at')
      .eq('id', req.user.id)
      .single()

    if (error || !data) {
      // Profile row may not exist yet if the trigger hasn't run — return auth user data
      res.status(200).json({
        success: true,
        data: req.user,
      })
      return
    }

    res.status(200).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}
