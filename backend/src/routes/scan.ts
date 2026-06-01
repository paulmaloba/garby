import { Router } from 'express'
import multer from 'multer'
import { createScan, getScanById, getScanHistory } from '../controllers/scanController'
import { upload } from '../middleware/upload'

export const scanRouter = Router()

// POST /api/scan — create new scan (image or video)
scanRouter.post('/', upload.single('image'), createScan)

// GET /api/scan/history — authenticated user's scan history (MUST be before /:id)
scanRouter.get('/history', getScanHistory)

// GET /api/scan/:id — get scan by ID (public — for shareable links)
scanRouter.get('/:id', getScanById)
