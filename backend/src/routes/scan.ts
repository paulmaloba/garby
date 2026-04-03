/**
 * scan.ts — Scan routes
 * Task: T-014 — Backend Upload Endpoint
 * Task: T-016 — Rate Limiting
 */

import { Router } from 'express'
import { createScan, getScanById } from '../controllers/scanController'
import { optionalAuth } from '../middleware/authMiddleware'
import { upload } from '../middleware/upload'
import { ipScanLimiter, checkScanQuota } from '../middleware/rateLimiter'

export const scanRouter = Router()

/**
 * POST /api/scan
 * Pipeline: IP limit → parse file → optional auth → quota check → controller
 */
scanRouter.post(
  '/',
  ipScanLimiter,
  upload.single('image'),
  optionalAuth,
  checkScanQuota,
  createScan
)

/**
 * GET /api/scan/:id
 * Public — anyone with the ID can view a completed scan result.
 */
scanRouter.get('/:id', getScanById)
