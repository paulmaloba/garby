/**
 * video.service.ts — Sprint 2 v2
 * Updated: Garby engine used as primary for frame detection
 * Sightengine used as fallback only when engine unavailable
 */

import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { Classification, DetectionSignal } from '../types'
import { analyseWithEngine, mapEngineVerdict, isEngineAvailable } from './garby-engine.service'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

const FRAME_COUNT          = 10
const AI_THRESHOLD         = 0.50   // majority of frames AI → video is AI

export interface FrameResult {
  frame:          number
  timestamp_ms:   number
  classification: Classification
  confidence:     number
}

export interface VideoDetectionResult {
  classification:   Classification
  confidence:       number
  provider:         string
  signals:          DetectionSignal[]
  duration_ms:      number
  duration_seconds: number
  frames_analysed:  number
  frame_results:    FrameResult[]
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runVideoDetection(
  videoBuffer: Buffer,
  mimeType:    string,
  videoUrl:    string,
): Promise<VideoDetectionResult> {
  const start   = Date.now()
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'garby-video-'))
  const videoPath = path.join(tmpDir, 'input.mp4')

  try {
    fs.writeFileSync(videoPath, videoBuffer)

    const duration   = await getVideoDuration(videoPath)
    console.log(`[Video] Duration: ${duration.toFixed(2)}s`)

    const framePaths = await extractFrames(videoPath, tmpDir, duration)
    console.log(`[Video] Extracted ${framePaths.length} frames`)

    // Check if Garby engine is available
    const engineAvailable = await isEngineAvailable()
    console.log(`[Video] Detection mode: ${engineAvailable ? 'Garby engine (primary)' : 'Sightengine (fallback)'}`)

    const frameResults: FrameResult[] = []

    for (let i = 0; i < framePaths.length; i++) {
      const framePath    = framePaths[i]
      const timestamp_ms = Math.round((duration / framePaths.length) * i * 1000)

      if (!fs.existsSync(framePath)) {
        console.warn(`[Video] Frame ${i + 1} not found, skipping`)
        continue
      }

      const frameBuffer = fs.readFileSync(framePath)

      try {
        let classification: Classification
        let confidence: number

        if (engineAvailable) {
          // ── Garby engine path ──────────────────────────────────────────────
          const engineResult = await analyseWithEngine(frameBuffer)
          if (engineResult) {
            const mapped   = mapEngineVerdict(engineResult)
            classification = mapped.classification
            confidence     = mapped.confidence
          } else {
            // Engine returned null — fall through to Sightengine
            const se = await detectFrameSightengine(frameBuffer)
            classification = se.classification
            confidence     = se.confidence
          }
        } else {
          // ── Sightengine fallback path ──────────────────────────────────────
          const se   = await detectFrameSightengine(frameBuffer)
          classification = se.classification
          confidence     = se.confidence
        }

        frameResults.push({ frame: i + 1, timestamp_ms, classification, confidence })
        console.log(`[Video] Frame ${i + 1}/${framePaths.length}: ${classification} (${(confidence * 100).toFixed(1)}%)`)

      } catch (err) {
        console.warn(`[Video] Frame ${i + 1} detection failed:`, err)
      }
    }

    if (frameResults.length === 0) {
      throw new Error('All frame detections failed')
    }

    const aggregate = aggregateFrameResults(frameResults)
    const provider  = engineAvailable ? 'garby+sightengine' : 'sightengine'

    return {
      ...aggregate,
      provider,
      duration_ms:      Date.now() - start,
      duration_seconds: Math.round(duration),
      frames_analysed:  frameResults.length,
      frame_results:    frameResults,
    }

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

// ── Frame extraction ──────────────────────────────────────────────────────────

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) { reject(err); return }
      resolve(metadata.format.duration ?? 0)
    })
  })
}

function extractFrames(videoPath: string, outputDir: string, duration: number): Promise<string[]> {
  return new Promise((resolve) => {
    const start     = duration * 0.02
    const end       = duration * 0.98
    const step      = (end - start) / (FRAME_COUNT - 1)
    const timestamps = Array.from({ length: FRAME_COUNT }, (_, i) => start + step * i)
    const framePaths: string[] = []
    let completed = 0

    timestamps.forEach((ts, i) => {
      const outputPath = path.join(outputDir, `frame_${String(i).padStart(3, '0')}.jpg`)
      framePaths.push(outputPath)

      ffmpeg(videoPath)
        .seekInput(ts).frames(1).output(outputPath).outputOptions(['-q:v 2'])
        .on('end', () => { completed++; if (completed === timestamps.length) resolve(framePaths) })
        .on('error', (err) => {
          console.warn(`[Video] Frame ${i} error:`, err.message)
          completed++
          if (completed === timestamps.length) resolve(framePaths.filter(p => fs.existsSync(p)))
        })
        .run()
    })
  })
}

// ── Sightengine frame detection (fallback) ────────────────────────────────────

async function detectFrameSightengine(jpegBuffer: Buffer): Promise<{
  classification: Classification; confidence: number
}> {
  const blob     = new Blob([jpegBuffer], { type: 'image/jpeg' })
  const formData = new FormData()
  formData.append('media',      blob, 'frame.jpg')
  formData.append('models',     'genai')
  formData.append('api_user',   process.env.SIGHTENGINE_USER   ?? '')
  formData.append('api_secret', process.env.SIGHTENGINE_SECRET ?? '')

  const response = await fetch('https://api.sightengine.com/1.0/check.json', {
    method: 'POST', body: formData,
  })
  if (!response.ok) throw new Error(`Sightengine frame error: ${response.status}`)

  const data = await response.json() as { status: string; genai?: { score: number } }
  const aiScore = data.genai?.score ?? 0

  const classification: Classification =
    aiScore >= 0.55 ? 'AI_GENERATED' :
    aiScore <= 0.30 ? 'REAL'         : 'UNCERTAIN'
  const confidence = classification === 'AI_GENERATED' ? aiScore : 1 - aiScore
  return { classification, confidence }
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregateFrameResults(frames: FrameResult[]): {
  classification: Classification
  confidence:     number
  signals:        DetectionSignal[]
} {
  // Count AI frames by classification only — engine already applied confidence thresholds internally
  const aiFrames   = frames.filter(f => f.classification === 'AI_GENERATED')
  const realFrames = frames.filter(f => f.classification === 'REAL')
  const aiFraction = aiFrames.length / frames.length

  let classification: Classification
  if (aiFraction >= AI_THRESHOLD)    classification = 'AI_GENERATED'
  else if (aiFraction <= 0.20)       classification = 'REAL'
  else                               classification = 'UNCERTAIN'

  const relevantFrames = classification === 'AI_GENERATED' ? aiFrames : realFrames
  const avgConfidence  = relevantFrames.length > 0
    ? relevantFrames.reduce((sum, f) => sum + f.confidence, 0) / relevantFrames.length
    : 0.5

  const signals: DetectionSignal[] = []
  if (classification === 'AI_GENERATED') {
    signals.push({
      label:       'AI-generated frames detected',
      description: `${aiFrames.length} of ${frames.length} frames (${Math.round(aiFraction * 100)}%) show AI generation indicators.`,
      severity:    aiFraction > 0.8 ? 'high' : 'medium',
    })
    if (aiFraction < 1 && realFrames.length > 0) {
      signals.push({
        label:       'Mixed content detected',
        description: `${realFrames.length} frame(s) appear authentic. Video may contain spliced real and AI-generated segments.`,
        severity:    'medium',
      })
    }
  }

  return { classification, confidence: avgConfidence, signals }
}
