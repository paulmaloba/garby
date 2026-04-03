/**
 * detection.service.ts — Detection pipeline orchestrator
 * Sprint 2
 *
 * Sightengine is the confirmed primary provider — reliable, fast, working.
 * Hive is commented out pending API key resolution during fine-tuning phase.
 * When Hive is resolved, uncomment the primary block and demote Sightengine to fallback.
 */

import { detectWithSightengine } from './sightengine.service'
// import { detectWithHive } from './hive.service'  // Re-enable during fine-tuning phase
import type { DetectionResult } from './hive.service'

export async function runDetection(
  imageBuffer: Buffer,
  mimeType: string,
  imageUrl: string
): Promise<DetectionResult> {
  // ── TODO (Fine-tuning phase): Re-enable Hive as primary ───────────────────
  // try {
  //   const result = await detectWithHive(imageBuffer, mimeType)
  //   return result
  // } catch (hiveError) {
  //   console.warn(`[Detection] Hive failed: ${(hiveError as Error).message}`)
  // }

  // ── Primary: Sightengine ───────────────────────────────────────────────────
  try {
    console.log('[Detection] Starting Sightengine scan')
    const result = await detectWithSightengine(imageBuffer, mimeType, imageUrl)
    console.log(`[Detection] Sightengine: ${result.classification} (${(result.confidence * 100).toFixed(1)}%) in ${result.duration_ms}ms`)
    return result
  } catch (err) {
    console.error('[Detection] Sightengine failed:', err)
    throw new Error('Detection failed. Please try again.')
  }
}
