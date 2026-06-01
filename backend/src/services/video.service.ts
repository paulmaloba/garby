/**
 * video.service.ts — Sprint 2 v3
 * 
 * Video detection pipeline:
 *   1. Extract 10 frames with ffmpeg
 *   2. Run Garby trained model on each frame  (image-level)
 *   3. Run Layer 6 temporal analysis          (temporal-level)
 *   4. Combine: 60% image + 40% temporal → final verdict
 */

import ffmpeg           from 'fluent-ffmpeg'
import ffmpegPath       from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import * as fs          from 'fs'
import * as os          from 'os'
import * as path        from 'path'
import type { Classification, DetectionSignal } from '../types'
import { analyseWithEngine, mapEngineVerdict, isEngineAvailable } from './garby-engine.service'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

const FRAME_COUNT     = 10
const AI_THRESHOLD    = 0.50
const IMAGE_WEIGHT    = 0.60
const TEMPORAL_WEIGHT = 0.40

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

    const engineAvailable = await isEngineAvailable()
    console.log(`[Video] Mode: ${engineAvailable ? 'Garby trained model' : 'Sightengine fallback'}`)

    // Phase 1 — image-level detection per frame
    const frameResults: FrameResult[] = []
    for (let i = 0; i < framePaths.length; i++) {
      const fp = framePaths[i]
      const timestamp_ms = Math.round((duration / framePaths.length) * i * 1000)
      if (!fs.existsSync(fp)) continue
      const buf = fs.readFileSync(fp)
      try {
        let classification: Classification
        let confidence: number
        if (engineAvailable) {
          const er = await analyseWithEngine(buf)
          if (er) { const m = mapEngineVerdict(er); classification = m.classification; confidence = m.confidence }
          else    { const se = await detectFrameSightengine(buf); classification = se.classification; confidence = se.confidence }
        } else {
          const se = await detectFrameSightengine(buf); classification = se.classification; confidence = se.confidence
        }
        frameResults.push({ frame: i+1, timestamp_ms, classification, confidence })
        console.log(`[Video] Frame ${i+1}/${framePaths.length}: ${classification} (${(confidence*100).toFixed(1)}%)`)
      } catch (err) { console.warn(`[Video] Frame ${i+1} failed:`, err) }
    }

    if (frameResults.length === 0) throw new Error('All frame detections failed')

    // Phase 2 — temporal analysis
    const existingPaths  = framePaths.filter(p => fs.existsSync(p))
    const temporalResult = await runTemporalAnalysis(existingPaths)
    console.log(`[Video] Temporal: ${temporalResult.ai_probability.toFixed(3)} (${temporalResult.verdict})`)

    // Phase 3 — combine
    const imageResult = aggregateFrameResults(frameResults)
    const combined    = combineImageAndTemporal(imageResult, temporalResult)
    const provider    = engineAvailable ? 'garby+sightengine' : 'sightengine'

    return { ...combined, provider, duration_ms: Date.now()-start,
             duration_seconds: Math.round(duration), frames_analysed: frameResults.length,
             frame_results: frameResults }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

// ── Temporal analysis — calls Python engine /analyse-temporal endpoint ────────

interface TemporalResult { ai_probability: number; verdict: string; signals: Record<string,string> }

async function runTemporalAnalysis(framePaths: string[]): Promise<TemporalResult> {
  if (framePaths.length < 3) return { ai_probability: 0.5, verdict: 'Inconclusive', signals: {} }
  try {
    const url  = (process.env.GARBY_ENGINE_URL ?? 'http://localhost:8001') + '/analyse-temporal'
    const res  = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame_paths: framePaths }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) { console.warn(`[Video] Temporal endpoint ${res.status}`); return { ai_probability: 0.5, verdict: 'Inconclusive', signals: {} } }
    const data = await res.json() as any
    return { ai_probability: data.ai_probability ?? 0.5, verdict: data.verdict ?? 'Inconclusive', signals: data.signals ?? {} }
  } catch (err) {
    console.warn('[Video] Temporal unavailable:', (err as Error).message)
    return { ai_probability: 0.5, verdict: 'Inconclusive', signals: {} }
  }
}

// ── Combine image + temporal ──────────────────────────────────────────────────

function combineImageAndTemporal(
  image:    { classification: Classification; confidence: number; signals: DetectionSignal[] },
  temporal: TemporalResult,
): { classification: Classification; confidence: number; signals: DetectionSignal[] } {
  const imgAiProb  = image.classification === 'AI_GENERATED' ? image.confidence
                   : image.classification === 'REAL'         ? 1 - image.confidence : 0.5
  const combined   = (imgAiProb * IMAGE_WEIGHT) + (temporal.ai_probability * TEMPORAL_WEIGHT)
  const cls: Classification = combined >= 0.55 ? 'AI_GENERATED' : combined <= 0.30 ? 'REAL' : 'UNCERTAIN'
  const conf       = cls === 'AI_GENERATED' ? combined : cls === 'REAL' ? 1 - combined : 0.5
  const signals    = [...image.signals]
  for (const [label, desc] of Object.entries(temporal.signals)) {
    if (label === 'Frames Analysed') continue
    const m = String(desc).match(/\(([0-9.]+)\)/)
    const s = m ? parseFloat(m[1]) : 0
    if (s >= 0.30) signals.push({ label, description: String(desc), severity: s >= 0.52 ? 'high' : 'medium' })
  }
  return { classification: cls, confidence: Math.round(conf * 10000) / 10000, signals }
}

// ── Frame aggregation ─────────────────────────────────────────────────────────

function aggregateFrameResults(frames: FrameResult[]): { classification: Classification; confidence: number; signals: DetectionSignal[] } {
  const aiFrames   = frames.filter(f => f.classification === 'AI_GENERATED')
  const realFrames = frames.filter(f => f.classification === 'REAL')
  const aiFrac     = aiFrames.length / frames.length
  const cls: Classification = aiFrac >= AI_THRESHOLD ? 'AI_GENERATED' : aiFrac <= 0.20 ? 'REAL' : 'UNCERTAIN'
  const rel   = cls === 'AI_GENERATED' ? aiFrames : realFrames
  const conf  = rel.length > 0 ? rel.reduce((s,f) => s+f.confidence, 0)/rel.length : 0.5
  const sigs: DetectionSignal[] = []
  if (cls === 'AI_GENERATED') {
    sigs.push({ label: 'AI frames detected', description: `${aiFrames.length}/${frames.length} frames (${Math.round(aiFrac*100)}%) show AI indicators.`, severity: aiFrac > 0.8 ? 'high' : 'medium' })
    if (realFrames.length > 0) sigs.push({ label: 'Mixed content', description: `${realFrames.length} frame(s) appear authentic.`, severity: 'medium' })
  }
  return { classification: cls, confidence: conf, signals: sigs }
}

// ── ffmpeg helpers ────────────────────────────────────────────────────────────

function getVideoDuration(vp: string): Promise<number> {
  return new Promise((res, rej) => { ffmpeg.ffprobe(vp, (e,m) => e ? rej(e) : res(m.format.duration ?? 0)) })
}

function extractFrames(vp: string, dir: string, duration: number): Promise<string[]> {
  return new Promise(resolve => {
    const s=duration*0.02, e=duration*0.98, step=(e-s)/(FRAME_COUNT-1)
    const times=Array.from({length:FRAME_COUNT},(_,i)=>s+step*i)
    const paths=times.map((_,i)=>path.join(dir,`frame_${String(i).padStart(3,'0')}.jpg`))
    let done=0
    times.forEach((ts,i)=>{
      ffmpeg(vp).seekInput(ts).frames(1).output(paths[i]).outputOptions(['-q:v 2'])
        .on('end',()=>{ done++; if(done===times.length) resolve(paths) })
        .on('error',()=>{ done++; if(done===times.length) resolve(paths.filter(p=>fs.existsSync(p))) })
        .run()
    })
  })
}

// ── Sightengine frame fallback ────────────────────────────────────────────────

async function detectFrameSightengine(buf: Buffer): Promise<{ classification: Classification; confidence: number }> {
  const form = new FormData()
  form.append('media', new Blob([buf],{type:'image/jpeg'}), 'frame.jpg')
  form.append('models','genai')
  form.append('api_user', process.env.SIGHTENGINE_USER??''  )
  form.append('api_secret', process.env.SIGHTENGINE_SECRET??'')
  const res  = await fetch('https://api.sightengine.com/1.0/check.json',{method:'POST',body:form})
  if (!res.ok) throw new Error(`SE ${res.status}`)
  const data = await res.json() as any
  const sc   = data.genai?.score ?? 0
  const cls: Classification = sc>=0.55?'AI_GENERATED':sc<=0.30?'REAL':'UNCERTAIN'
  return { classification: cls, confidence: cls==='AI_GENERATED'?sc:1-sc }
}
