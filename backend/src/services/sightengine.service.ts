/**
 * sightengine.service.ts — Sightengine fallback detection provider
 * Sprint 2
 *
 * Uses the public CDN URL from R2 — this approach was confirmed working.
 * Kept URL-based since Sightengine's URL fetch works fine with R2 public domain.
 */

import type { Classification, DetectionSignal } from '../types'
import type { DetectionResult } from './hive.service'

const SIGHTENGINE_API_URL = 'https://api.sightengine.com/1.0/check.json'

export async function detectWithSightengine(
  _imageBuffer: Buffer,
  _mimeType: string,
  imageUrl: string
): Promise<DetectionResult> {
  const start = Date.now()

  const params = new URLSearchParams({
    url:        imageUrl,
    models:     'genai',
    api_user:   process.env.SIGHTENGINE_USER   ?? '',
    api_secret: process.env.SIGHTENGINE_SECRET ?? '',
  })

  const response = await fetch(`${SIGHTENGINE_API_URL}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Sightengine API error: ${response.status}`)
  }

  const data = await response.json() as SightengineResponse

  if (data.status !== 'success') {
    throw new Error(`Sightengine returned status: ${data.status}`)
  }

  return mapSightengineResponse(data, Date.now() - start)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SightengineResponse {
  status: string
  genai?: { score: number }
  type?:  { photo?: number; illustration?: number; deepfake?: number }
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function mapSightengineResponse(data: SightengineResponse, durationMs: number): DetectionResult {
  const aiScore = data.genai?.score ?? 0

  const classification: Classification =
    aiScore >= 0.6  ? 'AI_GENERATED' :
    aiScore <= 0.35 ? 'REAL'         : 'UNCERTAIN'

  const confidence =
    classification === 'AI_GENERATED' ? aiScore :
    classification === 'REAL'         ? 1 - aiScore : 0.5

  const signals: DetectionSignal[] = []

  if (classification === 'AI_GENERATED') {
    signals.push({
      label:       'AI generation detected',
      description: `Sightengine GenAI model returned a score of ${(aiScore * 100).toFixed(1)}%.`,
      severity:    'high',
    })
  }

  if ((data.type?.deepfake ?? 0) > 0.5) {
    signals.push({
      label:       'Deepfake indicators',
      description: 'Face manipulation or deepfake artifacts detected.',
      severity:    'high',
    })
  }

  return { classification, confidence, provider: 'sightengine', signals, duration_ms: durationMs }
}
