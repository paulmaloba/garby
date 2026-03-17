import { Router } from 'express'
import { createScan, getScanById } from '../controllers/scanController'

export const scanRouter = Router()

/**
 * POST /api/scan
 * Upload an image and initiate a scan job.
 * Full implementation: T-014 (upload endpoint) + T-015 (storage) + T-018 (detection pipeline)
 */
scanRouter.post('/', createScan)

/**
 * GET /api/scan/:id
 * Poll for scan result status.
 * Full implementation: T-021 (async polling)
 */
scanRouter.get('/:id', getScanById)
