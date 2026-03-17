/**
 * sightengine.service.ts — Sightengine fallback detection provider
 * Task: T-019 | Sprint 1 Day 10
 *
 * Sightengine API: https://sightengine.com/docs/ai-generated-content-detection
 * Used automatically when Hive times out or returns an error.
 */

import type { Classification, DetectionSignal } from '../types'
import type { DetectionResult } from './hive.service'

const SIGHTENGINE_API_URL = 'https://api.sightengine.com/1.0/check.json'

/**
 * detectWithSightengine — Fallback detection provider.
 * Called automatically by the detection pipeline if Hive fails.
 */
export async function detectWithSightengine(imageUrl: string): Promise<DetectionResult> {
  const start = Date.now()

  const params = new URLSearchParams({
    url:     imageUrl,
    models:  'genai',
    api_user: process.env.SIGHTENGINE_USER ?? '',
    api_secret: process.env.SIGHTENGINE_SECRET ?? '',
  })

  const response = await fetch(`${SIGHTENGINE_API_URL}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Sightengine API error: ${response.status}`)
  }

  const data = await response.json() as SightengineResponse
  return mapSightengineResponse(data, Date.now() - start)
}

// ── Sightengine response types ────────────────────────────────────────────────

interface SightengineResponse {
  status: string
  genai: {
    score: number       // 0.0 = definitely real, 1.0 = definitely AI
  }
  type?: {
    photo?: number
    illustration?: number
    deepfake?: number
  }
}

// ── Response mapping ──────────────────────────────────────────────────────────

function mapSightengineResponse(data: SightengineResponse, durationMs: number): DetectionResult {
  const aiScore = data.genai?.score ?? 0

  const classification: Classification =
    aiScore >= 0.6  ? 'AI_GENERATED' :
    aiScore <= 0.35 ? 'REAL'         : 'UNCERTAIN'

  const confidence =
    classification === 'AI_GENERATED' ? aiScore :
    classification === 'REAL'         ? 1 - aiScore : 0.5

  const signals: DetectionSignal[] = classification === 'AI_GENERATED'
    ? [{ label: 'AI generation detected', description: `Sightengine GenAI model returned a score of ${(aiScore * 100).toFixed(1)}%.`, severity: 'high' }]
    : []

  if (data.type?.deepfake && data.type.deepfake > 0.5) {
    signals.push({
      label: 'Deepfake indicators',
      description: 'Face manipulation or deepfake artifacts detected.',
      severity: 'high',
    })
  }

  return {
    classification,
    confidence,
    provider: 'sightengine',
    signals,
    duration_ms: durationMs,
  }
}
