/**
 * detection.service.ts — Detection pipeline orchestrator
 * Task: T-018 (pipeline) + T-019 (fallback) | Sprint 1 Days 9–10
 *
 * Flow:
 *   imageUrl → detectWithHive → [if error/timeout] → detectWithSightengine → DetectionResult
 */

import { detectWithHive, type DetectionResult } from './hive.service'
import { detectWithSightengine } from './sightengine.service'

/**
 * runDetection — Main entry point for the detection pipeline.
 * Tries Hive first; falls back to Sightengine on any failure.
 */
export async function runDetection(imageUrl: string): Promise<DetectionResult> {
  try {
    console.log(`[Detection] Starting Hive scan for: ${imageUrl}`)
    const result = await detectWithHive(imageUrl)
    console.log(`[Detection] Hive result: ${result.classification} (${(result.confidence * 100).toFixed(1)}%) in ${result.duration_ms}ms`)
    return result
  } catch (hiveError) {
    console.warn(`[Detection] Hive failed — falling back to Sightengine. Reason: ${(hiveError as Error).message}`)

    try {
      const result = await detectWithSightengine(imageUrl)
      console.log(`[Detection] Sightengine result: ${result.classification} (${(result.confidence * 100).toFixed(1)}%) in ${result.duration_ms}ms`)
      return result
    } catch (sightengineError) {
      console.error('[Detection] Both providers failed.', sightengineError)
      throw new Error('Detection failed: all providers unavailable. Please try again.')
    }
  }
}
