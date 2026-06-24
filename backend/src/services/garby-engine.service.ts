/**
 * garby-engine.service.ts
 * Sprint 2 — Detection Engine Integration
 *
 * HTTP client that calls the Garby Python detection microservice.
 * The microservice runs the 5-layer detection stack:
 *   Layer 1: FFT Frequency Domain Fingerprinting
 *   Layer 2: PRNU Noise Residual Analysis
 *   Layer 3: Statistical Distribution (Benford, GLCM, Histogram)
 *   Layer 4: Semantic Inconsistency Detection
 *   Layer 5: NPR + DWT Hybrid (SOTA CVPR 2024)
 */

import type { Classification, DetectionSignal } from '../types'

const ENGINE_URL     = process.env.GARBY_ENGINE_URL ?? 'http://localhost:8001'
const ENGINE_TIMEOUT = 180000   // 180s — Windows NumPy/SciPy is slow on first real image

export interface EngineResult {
  verdict:        string     // "AI-Generated" | "Likely Real" | "Inconclusive"
  confidence:     string     // "High" | "Medium" | "Low"
  ai_probability: number     // 0.0 – 1.0
  ensemble_score: number
  layers_agreeing: number
  processing_ms:  number
  layer_scores: {
    layer1_fft:      number
    layer2_noise:    number
    layer3_stats:    number
    layer4_semantic: number
    layer5_npr_dwt:  number
  }
  signals: Record<string, string>
  findings: string[]
}

export interface EngineFrameResult {
  frame_number:   number
  timestamp_ms:   number
  classification: string
  confidence:     number
  ai_probability: number
}

export interface EngineVideoResult {
  classification:  string
  confidence:      number
  ai_probability:  number
  frames_analysed: number
  ai_frame_count:  number
  ai_fraction:     number
  frame_results:   EngineFrameResult[]
  layer_scores:    Record<string, number>
  signals:         Record<string, string>
  processing_ms:   number
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function isEngineAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Single image analysis ──────────────────────────────────────────────────────

export async function analyseWithEngine(
  imageBuffer: Buffer
): Promise<EngineResult | null> {
  try {
    const base64 = imageBuffer.toString('base64')
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), ENGINE_TIMEOUT)

    const res = await fetch(`${ENGINE_URL}/analyse`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_b64: base64, filename: 'image.jpg' }),
      signal:  controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[GarbyEngine] HTTP ${res.status} — engine unavailable`)
      return null
    }

    const json = await res.json() as { success: boolean; data: EngineResult }
    return json.data

  } catch (err) {
    const error = err as Error & { code?: string }
    const url   = `${ENGINE_URL}/analyse`

    console.error(`[GarbyEngine] Fetch failed — URL: ${url}`)
    console.error(`[GarbyEngine] Error type   : ${error.constructor?.name ?? 'Unknown'}`)
    console.error(`[GarbyEngine] Error message: ${error.message}`)

    if (error.code) {
      console.error(`[GarbyEngine] Error code   : ${error.code}`)
    }

    if (error.code === 'ENOTFOUND') {
      console.error('[GarbyEngine] DNS resolution failed — the hostname could not be resolved. Check that the garby-engine service is deployed and the GARBY_ENGINE_URL is correct.')
    } else if (error.code === 'ECONNREFUSED') {
      console.error('[GarbyEngine] Connection refused — the engine is not accepting connections on the target port. Check that garby-engine is running and listening on port 8080.')
    } else if (error.code === 'ECONNRESET') {
      console.error('[GarbyEngine] Connection reset — the engine closed the connection unexpectedly.')
    } else if (error.name === 'AbortError' || error.message.includes('abort') || error.message.includes('timeout')) {
      console.error(`[GarbyEngine] Request timed out after ${ENGINE_TIMEOUT}ms — the engine is alive but took too long to respond.`)
    } else {
      console.error('[GarbyEngine] Unexpected network error — see type/message/code above for details.')
    }

    return null
  }
}

// ── Video frame batch analysis ────────────────────────────────────────────────

export async function analyseFramesWithEngine(
  frames: { frameNumber: number; timestampMs: number; buffer: Buffer }[]
): Promise<EngineVideoResult | null> {
  try {
    const payload = {
      frames: frames.map(f => ({
        frame_number: f.frameNumber,
        timestamp_ms: f.timestampMs,
        image_b64:    f.buffer.toString('base64'),
      })),
      filename: 'video.mp4',
    }

    const controller = new AbortController()
    // Video analysis: 10 frames × ~400ms each = ~4s + overhead
    const timeout    = setTimeout(() => controller.abort(), ENGINE_TIMEOUT * 3)

    const res = await fetch(`${ENGINE_URL}/analyse-frames`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[GarbyEngine] Video analysis HTTP ${res.status}`)
      return null
    }

    const json = await res.json() as { success: boolean; data: EngineVideoResult }
    return json.data

  } catch (err) {
    console.warn('[GarbyEngine] Video analysis error:', (err as Error).message)
    return null
  }
}

// ── Map engine verdict to Garby classification ────────────────────────────────

export function mapEngineVerdict(engineResult: EngineResult): {
  classification: Classification
  confidence:     number
  signals:        DetectionSignal[]
} {
  const classification: Classification =
    engineResult.verdict === 'AI-Generated' ? 'AI_GENERATED' :
    engineResult.verdict === 'Likely Real'  ? 'REAL'         : 'UNCERTAIN'

  const confidence =
    classification === 'AI_GENERATED' ? engineResult.ai_probability :
    classification === 'REAL'         ? 1 - engineResult.ai_probability : 0.5

  // Convert findings to DetectionSignal objects with correct severity
  // Severity is based on known thresholds for each signal type
  const signals: DetectionSignal[] = engineResult.findings.map(finding => {
    let severity: 'high' | 'medium' | 'low' = 'medium'
    const f = finding.toLowerCase()
    // High severity indicators
    if (f.includes('bokeh abuse') || f.includes('sharpness range')) severity = 'high'
    else if (f.includes('bimodal edge') && parseFloat(finding.match(/bc=([\d.]+)/i)?.[1] ?? '0') > 0.65) severity = 'high'
    else if (f.includes('chromatic aberration absent') && parseFloat(finding.match(/correlation=([\d.]+)/i)?.[1] ?? '0') > 0.97) severity = 'high'
    else if (f.includes('extreme edge kurtosis') && parseFloat(finding.match(/([\d.]+)\)$/)?.[1] ?? '0') > 15) severity = 'high'
    else if (f.includes('benford') || f.includes('dct')) severity = 'high'
    else if (f.includes('synthetic skin') || f.includes('extremity proportion')) severity = 'high'
    // Low severity
    else if (f.includes('lighting direction') || f.includes('luminance transition')) severity = 'low'
    return {
      label:       finding.split(':')[0].trim(),
      description: finding,
      severity,
    }
  })

  // Add top layer signals
  const layerSignalEntries = Object.entries(engineResult.signals).slice(0, 5)
  for (const [key, val] of layerSignalEntries) {
    const severityMatch = val.match(/^(High|Moderate|Low)/i)
    const severity = severityMatch
      ? (severityMatch[1].toLowerCase() === 'high' ? 'high' :
         severityMatch[1].toLowerCase() === 'moderate' ? 'medium' : 'low') as 'high' | 'medium' | 'low'
      : 'low'

    if (severity !== 'low') {
      signals.push({
        label:       key.replace(/^\[L\d\] /, ''),
        description: val,
        severity,
      })
    }
  }

  return { classification, confidence, signals: signals.slice(0, 8) }
}
