/**
 * profile.ts — Profile routes
 * Task: T-010 — User Profile Page
 */

import { Router } from 'express'
import { getProfile, updateProfile } from '../controllers/profileController'
import { requireAuth } from '../middleware/authMiddleware'

export const profileRouter = Router()

// All profile routes require authentication
profileRouter.use(requireAuth)

/**
 * GET /api/profile
 * Returns the authenticated user's full Garby profile.
 */
profileRouter.get('/', getProfile)

/**
 * PATCH /api/profile
 * Updates editable profile fields (display_name).
 */
profileRouter.patch('/', updateProfile)
