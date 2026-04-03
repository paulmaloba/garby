/**
 * profileController.ts
 * Task: T-010 — User Profile Page
 */

import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

/**
 * GET /api/profile
 * Returns the authenticated user's profile from the users table.
 */
export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, display_name, tier, scans_used_this_month, created_at')
      .eq('id', req.user!.id)
      .single()

    if (error) {
      res.status(404).json({ success: false, message: 'Profile not found.' })
      return
    }

    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/profile
 * Updates allowed profile fields. Currently: display_name only.
 * Validates and sanitises input before writing to DB.
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { display_name } = req.body as { display_name?: string }

    // Validate
    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        res.status(400).json({ success: false, message: 'display_name must be a string.' })
        return
      }
      const trimmed = display_name.trim()
      if (trimmed.length < 2 || trimmed.length > 80) {
        res.status(400).json({ success: false, message: 'display_name must be 2–80 characters.' })
        return
      }
    }

    const updates: Record<string, string> = {}
    if (display_name) updates.display_name = display_name.trim()

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields to update.' })
      return
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user!.id)
      .select('id, email, display_name, tier, scans_used_this_month, created_at')
      .single()

    if (error) {
      res.status(500).json({ success: false, message: 'Failed to update profile.' })
      return
    }

    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
