/**
 * video.service.ts
 * Task: T-040 — Frame Extraction Service
 * Task: T-041 — Frame Detection Pipeline
 * Sprint 2
 *
 * Extracts evenly-spaced frames from an uploaded video using ffmpeg,
 * runs each frame through the detection pipeline, then aggregates
 * results into a single video-level classification.
 *
 * Algorithm:
 *   - Extract FRAME_COUNT frames evenly spaced across the video duration
 *   - Run Sightengine detection on each frame
 *   - If >= 60% of frames return AI_GENERATED with confidence > 0.6 → AI_GENERATED
 *   - Otherwise aggregate confidence scores and pick majority classification
 */

import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { Classification, DetectionSignal } from '../types'

// Point fluent-ffmpeg to both bundled static binaries
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

const FRAME_COUNT  = 10    // Frames to extract per video
const AI_THRESHOLD = 0.60  // Min fraction of AI frames to classify video as AI
const CONFIDENCE_THRESHOLD = 0.60  // Min confidence per frame to count

export interface FrameResult {
  frame:           number
  timestamp_ms:    number
  classification:  Classification
  confidence:      number
}

export interface VideoDetectionResult {
  classification:   Classification
  confidence:       number
  provider:         'sightengine'
  signals:          DetectionSignal[]
  duration_ms:      number
  duration_seconds: number
  frames_analysed:  number
  frame_results:    FrameResult[]
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runVideoDetection(
  videoBuffer:   Buffer,
  mimeType:      string,
  videoUrl:      string,
): Promise<VideoDetectionResult> {
  const start   = Date.now()
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'garby-video-'))
  const videoPath = path.join(tmpDir, 'input.mp4')

  try {
    // 1. Write video buffer to temp file for ffmpeg
    fs.writeFileSync(videoPath, videoBuffer)

    // 2. Get video duration
    const duration = await getVideoDuration(videoPath)
    console.log(`[Video] Duration: ${duration.toFixed(2)}s`)

    // 3. Extract frames
    const framePaths = await extractFrames(videoPath, tmpDir, duration)
    console.log(`[Video] Extracted ${framePaths.length} frames`)

    // 4. Run detection on each frame using direct buffer upload
    const frameResults: FrameResult[] = []

    for (let i = 0; i < framePaths.length; i++) {
      const framePath    = framePaths[i]
      const timestamp_ms = Math.round((duration / framePaths.length) * i * 1000)

      try {
        if (!fs.existsSync(framePath)) {
          console.warn(`[Video] Frame ${i + 1} file not found, skipping`)
          continue
        }

        const frameBuffer = fs.readFileSync(framePath)
        const result      = await detectFrameBuffer(frameBuffer)

        frameResults.push({
          frame:          i + 1,
          timestamp_ms,
          classification: result.classification,
          confidence:     result.confidence,
        })
        console.log(`[Video] Frame ${i + 1}/${framePaths.length}: ${result.classification} (${(result.confidence * 100).toFixed(1)}%)`)
      } catch (err) {
        console.warn(`[Video] Frame ${i + 1} detection failed:`, err)
      }
    }

    if (frameResults.length === 0) {
      throw new Error('All frame detections failed')
    }

    // 5. Aggregate results
    const aggregate = aggregateFrameResults(frameResults)

    return {
      ...aggregate,
      provider:         'sightengine',
      duration_ms:      Date.now() - start,
      duration_seconds: Math.round(duration),
      frames_analysed:  frameResults.length,
      frame_results:    frameResults,
    }

  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── Frame extraction ──────────────────────────────────────────────────────────

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) { reject(err); return }
      const duration = metadata.format.duration ?? 0
      resolve(duration)
    })
  })
}

function extractFrames(
  videoPath: string,
  outputDir: string,
  duration:  number
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const framePaths: string[] = []

    // Calculate timestamps for evenly spaced frames
    // Skip first and last 2% to avoid black frames at start/end
    const start = duration * 0.02
    const end   = duration * 0.98
    const step  = (end - start) / (FRAME_COUNT - 1)

    const timestamps = Array.from({ length: FRAME_COUNT }, (_, i) =>
      start + step * i
    )

    let completed = 0

    timestamps.forEach((ts, i) => {
      const outputPath = path.join(outputDir, `frame_${String(i).padStart(3, '0')}.jpg`)
      framePaths.push(outputPath)

      ffmpeg(videoPath)
        .seekInput(ts)
        .frames(1)
        .output(outputPath)
        .outputOptions(['-q:v 2'])  // High quality JPEG
        .on('end', () => {
          completed++
          if (completed === timestamps.length) resolve(framePaths)
        })
        .on('error', (err) => {
          console.warn(`[Video] Frame ${i} extraction error:`, err.message)
          completed++
          if (completed === timestamps.length) resolve(framePaths.filter(p => fs.existsSync(p)))
        })
        .run()
    })
  })
}

// ── Frame-level detection — sends JPEG buffer directly to Sightengine ─────────

interface SimpleDetectionResult {
  classification: Classification
  confidence:     number
}

async function detectFrameBuffer(jpegBuffer: Buffer): Promise<SimpleDetectionResult> {
  // Use Node's native FormData + Blob (Node 18+)
  const blob     = new Blob([jpegBuffer], { type: 'image/jpeg' })
  const formData = new FormData()
  formData.append('media',      blob, 'frame.jpg')
  formData.append('models',     'genai')
  formData.append('api_user',   process.env.SIGHTENGINE_USER   ?? '')
  formData.append('api_secret', process.env.SIGHTENGINE_SECRET ?? '')

  const response = await fetch('https://api.sightengine.com/1.0/check.json', {
    method: 'POST',
    body:   formData,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Sightengine frame error: ${response.status} — ${body}`)
  }

  const data = await response.json() as { status: string; genai?: { score: number } }

  if (data.status !== 'success') {
    throw new Error(`Sightengine frame status: ${data.status}`)
  }

  const aiScore = data.genai?.score ?? 0
  const classification: Classification =
    aiScore >= 0.6  ? 'AI_GENERATED' :
    aiScore <= 0.35 ? 'REAL'         : 'UNCERTAIN'
  const confidence =
    classification === 'AI_GENERATED' ? aiScore : 1 - aiScore

  return { classification, confidence }
}

// ── Result aggregation ────────────────────────────────────────────────────────

function aggregateFrameResults(frames: FrameResult[]): {
  classification: Classification
  confidence:     number
  signals:        DetectionSignal[]
} {
  const aiFrames   = frames.filter(f => f.classification === 'AI_GENERATED' && f.confidence >= CONFIDENCE_THRESHOLD)
  const realFrames = frames.filter(f => f.classification === 'REAL')
  const aiFraction = aiFrames.length / frames.length

  // Classification decision
  let classification: Classification
  if (aiFraction >= AI_THRESHOLD) {
    classification = 'AI_GENERATED'
  } else if (aiFraction <= 0.2) {
    classification = 'REAL'
  } else {
    classification = 'UNCERTAIN'
  }

  // Average confidence of the dominant classification
  const relevantFrames = classification === 'AI_GENERATED' ? aiFrames : realFrames
  const avgConfidence = relevantFrames.length > 0
    ? relevantFrames.reduce((sum, f) => sum + f.confidence, 0) / relevantFrames.length
    : 0.5

  // Signals
  const signals: DetectionSignal[] = []
  if (classification === 'AI_GENERATED') {
    signals.push({
      label:       'AI-generated frames detected',
      description: `${aiFrames.length} of ${frames.length} frames (${Math.round(aiFraction * 100)}%) show AI generation indicators.`,
      severity:    aiFraction > 0.8 ? 'high' : 'medium',
    })
    if (aiFraction < 1) {
      signals.push({
        label:       'Mixed content detected',
        description: `${realFrames.length} frames appear authentic. The video may contain spliced real and AI-generated segments.`,
        severity:    'medium',
      })
    }
  }

  return { classification, confidence: avgConfidence, signals }
}
