/**
 * scan.ts — Frontend type definitions
 * Updated Sprint 2 — video detection fields added
 */

export type Classification    = 'AI_GENERATED' | 'REAL' | 'UNCERTAIN'
export type DetectionProvider = 'hive' | 'sightengine' | 'mock'
export type ScanStatus        = 'pending' | 'processing' | 'complete' | 'failed'
export type MediaType         = 'image' | 'video'

export interface DetectionSignal {
  label:       string
  description: string
  severity:    'high' | 'medium' | 'low'
}

export interface FrameResult {
  frame:          number
  timestamp_ms:   number
  classification: Classification
  confidence:     number
}

export interface ScanResult {
  id:               string
  user_id?:         string
  image_url:        string
  media_type:       MediaType
  classification:   Classification
  confidence:       number
  provider:         DetectionProvider
  signals:          DetectionSignal[]
  scan_duration_ms: number
  scanned_at:       string
  status:           ScanStatus
  // Video-only fields
  duration_seconds?: number
  frames_analysed?:  number
  frame_results?:    FrameResult[]
}
