/**
 * auth.ts — Auth routes
 * Task: T-007 — Supabase Auth Integration
 */

import { Router } from 'express'
import { getMe } from '../controllers/authController'
import { requireAuth } from '../middleware/authMiddleware'

export const authRouter = Router()

/**
 * GET /api/auth/me
 * Returns the authenticated user's Garby profile.
 * Requires a valid Supabase JWT in Authorization header.
 */
authRouter.get('/me', requireAuth, getMe)
