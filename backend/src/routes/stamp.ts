/**
 * stamp.ts — Stamp routes
 * Task: T-028 — Garby Stamp
 * Sprint 2
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { generateStamp, type StampVariant } from '../services/stamp.service'
import { uploadImageToS3 } from '../services/storage.service'
import type { ScanRecord } from '../types'

export const stampRouter = Router()

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

/**
 * GET /api/stamp/:scanId?variant=border|overlay
 *
 * Generates a Garby stamp for a completed scan.
 * Returns JSON with the stamped image URL.
 * Caches the result in the DB — second call returns cached URL instantly.
 */
stampRouter.get('/:scanId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scanId } = req.params
    const variant = (req.query.variant as StampVariant) ?? 'border'

    if (!['border', 'overlay'].includes(variant)) {
      res.status(400).json({
        success: false,
        message: 'Invalid variant. Use "border" or "overlay".',
      })
      return
    }

    // 1. Fetch the scan record
    const { data: scan, error } = await supabase
      .from('scans')
      .select('id, image_url, classification, confidence, scanned_at, status, stamp_url_border, stamp_url_overlay')
      .eq('id', scanId)
      .single()

    if (error || !scan) {
      res.status(404).json({ success: false, message: 'Scan not found.' })
      return
    }

//     if (scan.status !== 'complete') {
//       res.status(400).json({ success: false, message: 'Scan is not yet complete.' })
//       return
//     }

    if (!scan) {
      res.status(404).json({ success: false, message: 'Scan not found.' })
      return
    }
    if (error) {
      console.error('[Stamp] DB error:', error.message)
      res.status(500).json({ success: false, message: `Database error: ${error.message}` })
      return
    }

    // 2. Return cached stamp if already generated
    const cacheField = variant === 'border' ? 'stamp_url_border' : 'stamp_url_overlay'
    if (scan[cacheField]) {
      res.status(200).json({ success: true, data: { url: scan[cacheField], cached: true } })
      return
    }

    // 3. Download original image from R2
    const imageRes = await fetch(scan.image_url)
    if (!imageRes.ok) {
      res.status(502).json({ success: false, message: 'Could not fetch original image.' })
      return
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer())

    // 4. Generate stamp
    const result = await generateStamp({
      scanId:         scan.id,
      imageBuffer,
      classification: scan.classification,
      confidence:     scan.confidence,
      scannedAt:      scan.scanned_at,
      variant,
    })

    // 5. Cache stamp URL in DB
    await supabase
      .from('scans')
      .update({ [cacheField]: result.url })
      .eq('id', scanId)

    res.status(200).json({
      success: true,
      data: { url: result.url, cached: false, width: result.width, height: result.height },
    })

  } catch (err) {
    next(err)
  }
})
