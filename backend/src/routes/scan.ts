import { Router } from 'express'
import { createScan, getScanById, getScanHistory } from '../controllers/scanController'
import { upload } from '../middleware/upload'
import { optionalAuth } from '../middleware/authMiddleware'

export const scanRouter = Router()

// POST /api/scan — create new scan (image or video)
// optionalAuth populates req.user from the Authorization header when present
// (attaching the scan to the account) and req.isGuest otherwise. Without this,
// createScan's `req.user?.id` was always undefined, so every scan was written
// with user_id = NULL regardless of login state — which is why scan history
// ever appeared empty.
scanRouter.post('/', optionalAuth, upload.single('image'), createScan)

// GET /api/scan/history — authenticated user's scan history (MUST be before /:id)
scanRouter.get('/history', getScanHistory)

// GET /api/scan/:id — get scan by ID (public — for shareable links)
scanRouter.get('/:id', getScanById)
