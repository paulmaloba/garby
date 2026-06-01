/**
 * detection.service.ts — Unified Detection Pipeline v3
 * =====================================================
 * 
 * Architecture change from v2:
 * 
 * v2 problem: Sightengine as 35% weighted voter caused correct AI detections
 * to be overruled. Sightengine is trained primarily on GAN-era data and
 * consistently mis-classifies photorealistic diffusion model outputs as REAL.
 * With 35% weight, it could pull a 0.41 Garby engine score down to 0.36
 * (below threshold), flipping AI-Generated → UNCERTAIN or REAL.
 * 
 * v3 architecture: Garby engine leads, Sightengine supports
 * 
 *   Garby says AI-Generated  → Final: AI-Generated (Sightengine not consulted)
 *   Garby says Inconclusive  → Sightengine breaks the tie
 *   Garby says Likely Real   → Sightengine confirms or overrides
 * 
 * This means Sightengine can only HELP (catch things engine missed) not HURT
 * (overrule correct detections). The Garby engine is the primary classifier.
 * 
 * Fallback chain (unchanged):
 *   Both available → v3 cascade logic
 *   Engine only    → engine result directly
 *   Sightengine only → sightengine result (legacy fallback)
 *   Neither        → error
 */

import { detectWithSightengine } from './sightengine.service'
import {
  analyseWithEngine,
  mapEngineVerdict,
} from './garby-engine.service'
import type { Classification, DetectionSignal } from '../types'

export interface DetectionResult {
  classification: Classification
  confidence:     number
  provider:       string
  signals:        DetectionSignal[]
  duration_ms:    number
  engine_scores?: Record<string, number>
}

// ── Main detection function ───────────────────────────────────────────────────

export async function runDetection(
  imageBuffer: Buffer,
  mimeType:    string,
  imageUrl:    string
): Promise<DetectionResult> {
  const start = Date.now()

  // Run both in parallel — we always want both results for logging
  const [engineResult, sightengineResult] = await Promise.allSettled([
    analyseWithEngine(imageBuffer),
    detectWithSightengine(imageBuffer, mimeType, imageUrl),
  ])

  const engine      = engineResult.status      === 'fulfilled' ? engineResult.value      : null
  const sightengine = sightengineResult.status === 'fulfilled' ? sightengineResult.value : null

  // ── Both available — v3 cascade logic ─────────────────────────────────────
  if (engine && sightengine) {
    const engineMapped = mapEngineVerdict(engine)
    const sightAiProb  = sightengine.classification === 'AI_GENERATED'
      ? sightengine.confidence
      : sightengine.classification === 'REAL'
        ? 1 - sightengine.confidence
        : 0.5

    console.log(
      `[Detection] Engine=${engine.ai_probability.toFixed(3)} (${engine.verdict}) ` +
      `Sightengine=${sightAiProb.toFixed(3)} (${sightengine.classification})`
    )

    // ── CASE 1: Garby engine says AI → trust it, done ─────────────────────
    if (engineMapped.classification === 'AI_GENERATED') {
      console.log(`[Detection] GarbyEngine says AI → final: AI-Generated (${engine.ai_probability.toFixed(3)})`)
      return {
        classification: 'AI_GENERATED',
        confidence:     round(engine.ai_probability, 4),
        provider:       'garby+sightengine',
        signals:        mergeSignals(engineMapped.signals, sightengine.signals),
        duration_ms:    Date.now() - start,
        engine_scores:  engine.layer_scores,
      }
    }

    // ── CASE 2: Engine Inconclusive → Sightengine breaks the tie ─────────
    if (engineMapped.classification === 'UNCERTAIN') {
      // Blend: engine gets more weight but sightengine can tip the result
      const blendedAiProb = (engine.ai_probability * 0.60) + (sightAiProb * 0.40)
      const classification: Classification =
        blendedAiProb >= 0.45 ? 'AI_GENERATED' :
        blendedAiProb <= 0.28 ? 'REAL'         : 'UNCERTAIN'
      const confidence =
        classification === 'AI_GENERATED' ? blendedAiProb :
        classification === 'REAL'         ? 1 - blendedAiProb : 0.5

      console.log(`[Detection] Engine inconclusive → blended=${blendedAiProb.toFixed(3)} → ${classification}`)
      return {
        classification,
        confidence:    round(confidence, 4),
        provider:      'garby+sightengine',
        signals:       mergeSignals(engineMapped.signals, sightengine.signals),
        duration_ms:   Date.now() - start,
        engine_scores: engine.layer_scores,
      }
    }

    // ── CASE 3: Engine says Real → Sightengine can override if confident ──
    // If Sightengine is very confident the image is AI (>0.75), override.
    // This catches cases where our engine missed something Sightengine caught.
    if (sightAiProb >= 0.75) {
      console.log(`[Detection] Engine says Real but Sightengine confident AI (${sightAiProb.toFixed(3)}) → AI-Generated`)
      return {
        classification: 'AI_GENERATED',
        confidence:     round(sightAiProb, 4),
        provider:       'garby+sightengine',
        signals:        mergeSignals(engineMapped.signals, sightengine.signals),
        duration_ms:    Date.now() - start,
        engine_scores:  engine.layer_scores,
      }
    }

    // Engine says Real, Sightengine agrees or is uncertain → REAL
    const finalAiProb  = (engine.ai_probability * 0.70) + (sightAiProb * 0.30)
    const finalConf    = round(1 - finalAiProb, 4)
    console.log(`[Detection] Both lean Real → Real (conf=${finalConf.toFixed(3)})`)
    return {
      classification: 'REAL',
      confidence:     finalConf,
      provider:       'garby+sightengine',
      signals:        mergeSignals(engineMapped.signals, sightengine.signals),
      duration_ms:    Date.now() - start,
      engine_scores:  engine.layer_scores,
    }
  }

  // ── Engine only ────────────────────────────────────────────────────────────
  if (engine) {
    console.log('[Detection] Engine only (Sightengine unavailable)')
    const mapped = mapEngineVerdict(engine)
    return {
      ...mapped,
      provider:      'garby-engine',
      duration_ms:   Date.now() - start,
      engine_scores: engine.layer_scores,
    }
  }

  // ── Sightengine only ───────────────────────────────────────────────────────
  if (sightengine) {
    console.log('[Detection] Sightengine only (Garby engine unavailable)')
    return { ...sightengine, provider: 'sightengine', duration_ms: Date.now() - start }
  }

  throw new Error('Detection failed: all providers unavailable. Please try again.')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeSignals(primary: DetectionSignal[], secondary: DetectionSignal[]): DetectionSignal[] {
  const merged = [...primary]
  for (const sig of secondary) {
    if (!merged.some(s => s.label === sig.label)) {
      merged.push(sig)
    }
  }
  return merged.slice(0, 10)
}

function round(n: number, decimals: number): number {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals)
}
