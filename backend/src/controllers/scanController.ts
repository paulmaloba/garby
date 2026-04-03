/**
 * scanController.ts
 * Task: T-039 — Backend Video Upload Endpoint
 * Task: T-041 — Frame Detection Pipeline
 * Sprint 2
 */

import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { uploadImageToS3, deleteFromS3 } from '../services/storage.service'
import { runDetection } from '../services/detection.service'
import { runVideoDetection } from '../services/video.service'
import { createClient } from '@supabase/supabase-js'
import { ACCEPTED_VIDEO_TYPES, getMaxSize } from '../middleware/upload'
import type { ScanRecord } from '../types'

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

export async function createScan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const scanId = uuidv4()
  let s3Key: string | null = null

  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No file provided. Send multipart/form-data with field name "image".',
        code:    'NO_FILE',
      })
      return
    }

    const { buffer, mimetype, originalname, size } = req.file
    const isVideo   = ACCEPTED_VIDEO_TYPES.includes(mimetype)
    const mediaType = isVideo ? 'video' : 'image'
    const maxSize   = getMaxSize(mimetype)

    if (size > maxSize) {
      res.status(400).json({
        success: false,
        message: `File too large. Maximum for ${mediaType} is ${maxSize / 1024 / 1024}MB.`,
        code:    'FILE_TOO_LARGE',
      })
      return
    }

    console.log(`[Scan] New ${mediaType} scan ${scanId} — ${originalname} (${(size / 1024).toFixed(1)}KB)`)

    // Upload to R2
    const upload = await uploadImageToS3(buffer, mimetype, originalname)
    s3Key = upload.key

    // Persist as processing
    const userId    = req.user?.id ?? null
    const sessionId = (req.headers['x-session-id'] as string) ?? null

    await supabase.from('scans').insert({
      id:         scanId,
      user_id:    userId,
      session_id: sessionId,
      image_url:  upload.url,
      media_type: mediaType,
      status:     'processing',
    })

    if (isVideo) {
      // ── Video pipeline ─────────────────────────────────────────────────────
      const result = await runVideoDetection(buffer, mimetype, upload.url)

      await supabase.from('scans').update({
        classification:   result.classification,
        confidence:       result.confidence,
        provider:         result.provider,
        signals:          result.signals,
        scan_duration_ms: result.duration_ms,
        duration_seconds: result.duration_seconds,
        frames_analysed:  result.frames_analysed,
        frame_results:    result.frame_results,
        status:           'complete',
        scanned_at:       new Date().toISOString(),
      }).eq('id', scanId)

      console.log(`[Scan] Video ${scanId} complete — ${result.classification} (${result.frames_analysed} frames)`)
      res.status(200).json({
        success: true,
        data: {
          id: scanId, user_id: userId, image_url: upload.url,
          media_type: 'video', ...result,
          scanned_at: new Date().toISOString(), status: 'complete',
        },
      })
    } else {
      // ── Image pipeline ─────────────────────────────────────────────────────
      const result = await runDetection(buffer, mimetype, upload.url)

      await supabase.from('scans').update({
        classification:   result.classification,
        confidence:       result.confidence,
        provider:         result.provider,
        signals:          result.signals,
        scan_duration_ms: result.duration_ms,
        status:           'complete',
        scanned_at:       new Date().toISOString(),
      }).eq('id', scanId)

      console.log(`[Scan] Image ${scanId} complete — ${result.classification} ${(result.confidence * 100).toFixed(1)}%`)
      res.status(200).json({
        success: true,
        data: {
          id: scanId, user_id: userId ?? undefined,
          image_url: upload.url, media_type: 'image', ...result,
          scanned_at: new Date().toISOString(), status: 'complete',
        },
      })
    }

  } catch (err) {
    if (s3Key) deleteFromS3(s3Key).catch(() => {})
    supabase.from('scans').update({ status: 'failed' }).eq('id', scanId).then(() => {})
    next(err)
  }
}

export async function getScanById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('scans')
      .select('id, user_id, image_url, media_type, classification, confidence, provider, signals, scan_duration_ms, duration_seconds, frames_analysed, frame_results, status, scanned_at, created_at')
      .eq('id', id)
      .single()

    if (error || !data) {
      res.status(404).json({ success: false, message: 'Scan not found.', code: 'SCAN_NOT_FOUND' })
      return
    }

    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
