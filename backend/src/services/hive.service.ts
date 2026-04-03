/**
 * hive.service.ts
 * Task: T-034 — Hive Base64 Integration
 * Sprint 2
 *
 * Sends image as base64 directly in the request body instead of a URL.
 * This bypasses R2 domain access restrictions entirely — Hive never
 * needs to fetch from our storage bucket.
 *
 * Hive AI-Generated Image Detection docs:
 * https://docs.thehive.ai/docs/ai-generated-content-detection
 */

import type { Classification, DetectionProvider, DetectionSignal } from '../types'

const HIVE_API_URL     = 'https://api.thehive.ai/api/v2/task/sync'
const HIVE_TIMEOUT_MS  = 12000   // 12s — base64 payloads are larger, need more time

export interface DetectionResult {
  classification: Classification
  confidence:     number           // 0.0 – 1.0
  provider:       DetectionProvider
  signals:        DetectionSignal[]
  duration_ms:    number
}

/**
 * detectWithHive
 * Accepts a raw image Buffer and sends it as base64 to Hive.
 * Falls back gracefully on any error so Sightengine can take over.
 */
export async function detectWithHive(imageBuffer: Buffer, mimeType: string): Promise<DetectionResult> {
  const start      = Date.now()
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), HIVE_TIMEOUT_MS)

  try {
    const base64Data = imageBuffer.toString('base64')

    const response = await fetch(HIVE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.HIVE_API_KEY}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        // Hive sync endpoint expects input array format
        input: [
          {
            image: {
              data: base64Data,
            },
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error(`[Hive] Error response: ${response.status} — ${body}`)
      throw new Error(`Hive API error: ${response.status} ${response.statusText}. ${body}`)
    }

    const data = await response.json() as HiveApiResponse
    return mapHiveResponse(data, Date.now() - start)

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Hive API timeout after ${HIVE_TIMEOUT_MS / 1000}s`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

// ── Hive response types ───────────────────────────────────────────────────────

interface HiveApiResponse {
  status?: { code: number; message: string }
  output?: HiveOutput[]
}

interface HiveOutput {
  time:    number
  classes: HiveClass[]
}

interface HiveClass {
  class: string
  score: number
}

// ── Response mapping ──────────────────────────────────────────────────────────

function mapHiveResponse(data: HiveApiResponse, durationMs: number): DetectionResult {
  const output = data.output?.[0]

  if (!output?.classes?.length) {
    console.warn('[Hive] Empty output received — treating as UNCERTAIN')
    return {
      classification: 'UNCERTAIN',
      confidence:     0.5,
      provider:       'hive',
      signals:        [],
      duration_ms:    durationMs,
    }
  }

  // Hive returns classes like 'ai_generated' and 'not_ai_generated'
  const aiClass   = output.classes.find(c => c.class === 'ai_generated')
  const realClass = output.classes.find(c => c.class === 'not_ai_generated')
  const aiScore   = aiClass?.score   ?? 0
  const realScore = realClass?.score ?? 0

  const classification: Classification =
    aiScore   > 0.5  ? 'AI_GENERATED' :
    realScore > 0.5  ? 'REAL'         : 'UNCERTAIN'

  const confidence =
    classification === 'AI_GENERATED' ? aiScore   :
    classification === 'REAL'         ? realScore : 0.5

  const signals = extractSignals(output.classes, classification)

  return { classification, confidence, provider: 'hive', signals, duration_ms: durationMs }
}

function extractSignals(classes: HiveClass[], classification: Classification): DetectionSignal[] {
  if (classification === 'REAL') return []

  const signalMap: Record<string, DetectionSignal> = {
    'gan':       { label: 'GAN texture artifacts',      description: 'Repeating texture patterns consistent with Generative Adversarial Network output.',                                    severity: 'high'   },
    'diffusion': { label: 'Diffusion model fingerprint', description: 'Statistical pixel distribution matching known diffusion model outputs (Stable Diffusion, DALL·E, Midjourney).',      severity: 'high'   },
    'lighting':  { label: 'Lighting inconsistency',     description: 'Light source direction or shadow angles are physically inconsistent.',                                                severity: 'medium' },
    'faces':     { label: 'Facial synthesis artifacts', description: 'Subtle asymmetries or blending errors around facial features typical of AI face generation.',                        severity: 'high'   },
    'edges':     { label: 'Edge smoothing',             description: 'Unnaturally smooth or over-blended edges inconsistent with camera optics.',                                          severity: 'low'    },
    'metadata':  { label: 'Missing EXIF metadata',     description: 'No camera metadata present. Real photos typically contain EXIF data from the capturing device.',                     severity: 'low'    },
  }

  return classes
    .filter(c => c.score > 0.3 && signalMap[c.class])
    .map(c => signalMap[c.class])
}
