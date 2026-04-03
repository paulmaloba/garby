/**
 * hive.service.ts — Hive Moderation API wrapper
 * Task: T-017 | Sprint 1 Day 9
 *
 * Hive Moderation API: https://docs.thehive.ai/
 * Detects AI-generated images with high accuracy across GAN, diffusion, and other generative models.
 */

import type { Classification, DetectionProvider, DetectionSignal } from '../types'

const HIVE_API_URL = 'https://api.thehive.ai/api/v2/task/sync'
const HIVE_MODEL   = 'ai_generated_image_detection'
const HIVE_TIMEOUT_MS = 8000

export interface DetectionResult {
  classification: Classification
  confidence: number          // 0.0 – 1.0
  provider: DetectionProvider
  signals: DetectionSignal[]
  duration_ms: number
}

/**
 * detectWithHive — Primary detection provider.
 * Sends image URL to Hive Moderation API and maps response to Garby schema.
 */
export async function detectWithHive(imageUrl: string): Promise<DetectionResult> {
  const start = Date.now()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HIVE_TIMEOUT_MS)

  try {
    const response = await fetch(HIVE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.HIVE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url:   imageUrl,
        model: HIVE_MODEL,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Hive API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as HiveApiResponse
    return mapHiveResponse(data, Date.now() - start)

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Hive API timeout after 5 seconds')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

// ── Hive API response types ───────────────────────────────────────────────────

interface HiveApiResponse {
  status: { code: number; message: string }
  output: HiveOutput[]
}

interface HiveOutput {
  time: number
  classes: HiveClass[]
}

interface HiveClass {
  class: string
  score: number
}

// ── Response mapping ──────────────────────────────────────────────────────────

function mapHiveResponse(data: HiveApiResponse, durationMs: number): DetectionResult {
  const output = data.output?.[0]

  if (!output) {
    throw new Error('Hive API returned empty output')
  }

  // Hive returns classes like 'ai_generated' and 'not_ai_generated'
  const aiClass     = output.classes.find(c => c.class === 'ai_generated')
  const realClass   = output.classes.find(c => c.class === 'not_ai_generated')
  const aiScore     = aiClass?.score    ?? 0
  const realScore   = realClass?.score  ?? 0

  const classification: Classification =
    aiScore > 0.5   ? 'AI_GENERATED' :
    realScore > 0.5 ? 'REAL'         : 'UNCERTAIN'

  const confidence = classification === 'AI_GENERATED' ? aiScore : realScore
  const signals    = extractSignals(output.classes, classification)

  return {
    classification,
    confidence,
    provider: 'hive',
    signals,
    duration_ms: durationMs,
  }
}

function extractSignals(classes: HiveClass[], classification: Classification): DetectionSignal[] {
  if (classification !== 'AI_GENERATED') return []

  // Map Hive's sub-classes to human-readable forensic signals
  const signalMap: Record<string, { label: string; description: string; severity: 'high' | 'medium' | 'low' }> = {
    'gan':       { label: 'GAN texture artifacts',     description: 'Repeating texture patterns consistent with Generative Adversarial Network output.', severity: 'high' },
    'diffusion': { label: 'Diffusion model fingerprint', description: 'Statistical pixel distribution matching known diffusion model outputs (Stable Diffusion, DALL·E, Midjourney).', severity: 'high' },
    'lighting':  { label: 'Lighting inconsistency',    description: 'Light source direction or shadow angles are physically inconsistent.', severity: 'medium' },
    'faces':     { label: 'Facial synthesis artifacts', description: 'Subtle asymmetries or blending errors around facial features typical of AI face generation.', severity: 'high' },
    'edges':     { label: 'Edge smoothing',            description: 'Unnaturally smooth or over-blended edges inconsistent with camera optics.', severity: 'low' },
    'metadata':  { label: 'Missing EXIF metadata',    description: 'No camera metadata present. Real photos typically contain EXIF data.', severity: 'low' },
  }

  return classes
    .filter(c => c.score > 0.3 && signalMap[c.class])
    .map(c => signalMap[c.class])
    .filter(Boolean)
}
