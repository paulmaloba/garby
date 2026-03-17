import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import type { ScanRecord } from '../types'

/**
 * POST /api/scan
 * T-014 — Backend Upload Endpoint (scaffold)
 * Full implementation wired in Day 8 of Sprint 1.
 *
 * Currently returns a mock pending scan job for scaffolding purposes.
 * Will be replaced with: multipart upload → S3 storage → Hive API call → DB persistence.
 */
export async function createScan(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // TODO T-014: parse multipart/form-data with multer
    // TODO T-015: upload to S3/R2, get CDN URL
    // TODO T-016: check rate limit for user tier
    // TODO T-017/T-018: call Hive detection API
    // TODO T-020: persist scan record to DB

    const scanId = uuidv4()

    res.status(202).json({
      success: true,
      data: {
        id: scanId,
        status: 'pending',
        message: 'Scan job created. Poll GET /api/scan/:id for result.',
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/scan/:id
 * T-021 — Async Processing & Status Polling (scaffold)
 * Full implementation wired in Day 11 of Sprint 1.
 */
export async function getScanById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params

    // TODO T-021: query DB for scan by id and return real result

    // Mock response for scaffold — will be replaced
    const mockScan: Partial<ScanRecord> = {
      id,
      status: 'pending',
      scanned_at: new Date().toISOString(),
    }

    res.status(200).json({
      success: true,
      data: mockScan,
    })
  } catch (error) {
    next(error)
  }
}
