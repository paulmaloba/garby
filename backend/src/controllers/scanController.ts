/**
 * scanController.ts — Sprint 2 v2
 * Fixed: engine_scores included in GET response
 * Added: history endpoint
 * Added: proper scan_duration_ms storage
 */

import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { uploadImageToS3, deleteFromS3 } from '../services/storage.service'
import { runDetection } from '../services/detection.service'
import { runVideoDetection } from '../services/video.service'
import { createClient } from '@supabase/supabase-js'
import { ACCEPTED_VIDEO_TYPES, getMaxSize } from '../middleware/upload'

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

// All fields we select — keeps GET and history consistent
const SCAN_SELECT = `
  id, user_id, image_url, media_type,
  classification, confidence, provider, signals,
  scan_duration_ms, duration_seconds, frames_analysed, frame_results,
  engine_scores, status, scanned_at, created_at,
  stamp_url_border, stamp_url_overlay
`.trim()

// ── POST /api/scan ─────────────────────────────────────────────────────────────

export async function createScan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const scanId = uuidv4()
  let s3Key: string | null = null

  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file provided.', code: 'NO_FILE' })
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
        code: 'FILE_TOO_LARGE',
      })
      return
    }

    console.log(`[Scan] New ${mediaType} scan ${scanId} — ${originalname} (${(size / 1024).toFixed(1)}KB)`)

    const upload = await uploadImageToS3(buffer, mimetype, originalname)
    s3Key = upload.key

    const userId    = (req as any).user?.id ?? null
    const sessionId = (req.headers['x-session-id'] as string) ?? null

    await supabase.from('scans').insert({
      id: scanId, user_id: userId, session_id: sessionId,
      image_url: upload.url, media_type: mediaType, status: 'processing',
    })

    if (isVideo) {
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
          scan_duration_ms: result.duration_ms,
          scanned_at: new Date().toISOString(), status: 'complete',
        },
      })

    } else {
      const result = await runDetection(buffer, mimetype, upload.url)

      await supabase.from('scans').update({
        classification:   result.classification,
        confidence:       result.confidence,
        provider:         result.provider,
        signals:          result.signals,
        scan_duration_ms: result.duration_ms,
        engine_scores:    result.engine_scores ?? null,
        status:           'complete',
        scanned_at:       new Date().toISOString(),
      }).eq('id', scanId)

      console.log(`[Scan] Image ${scanId} complete — ${result.classification} ${(result.confidence * 100).toFixed(1)}%`)
      res.status(200).json({
        success: true,
        data: {
          id: scanId, user_id: userId ?? undefined,
          image_url: upload.url, media_type: 'image',
          classification:   result.classification,
          confidence:       result.confidence,
          provider:         result.provider,
          signals:          result.signals,
          scan_duration_ms: result.duration_ms,
          engine_scores:    result.engine_scores ?? null,
          scanned_at:       new Date().toISOString(),
          status:           'complete',
        },
      })
    }

  } catch (err) {
    if (s3Key) deleteFromS3(s3Key).catch(() => {})
    supabase.from('scans').update({ status: 'failed' }).eq('id', scanId).then(() => {})
    next(err)
  }
}

// ── GET /api/scan/:id ──────────────────────────────────────────────────────────

export async function getScanById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params
    const { data, error } = await supabase
      .from('scans').select(SCAN_SELECT).eq('id', id).single()

    if (error || !data) {
      res.status(404).json({ success: false, message: 'Scan not found.', code: 'SCAN_NOT_FOUND' })
      return
    }
    res.status(200).json({ success: true, data })
  } catch (err) { next(err) }
}

// ── GET /api/scan/history — authenticated user's scan history ─────────────────

export async function getScanHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Read JWT directly from Authorization header — works without middleware
    const authHeader = req.headers.authorization ?? ''
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required.', code: 'NO_TOKEN' })
      return
    }

    // Verify token and get user ID via Supabase
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      res.status(401).json({ success: false, message: 'Invalid or expired token.', code: 'INVALID_TOKEN' })
      return
    }
    const userId = user.id

    const page  = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20))
    const from  = (page - 1) * limit

    const { data, error, count } = await supabase
      .from('scans')
      .select(SCAN_SELECT, { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('scanned_at', { ascending: false })
      .range(from, from + limit - 1)

    if (error) throw error

    res.status(200).json({
      success: true,
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    })
  } catch (err) { next(err) }
}
