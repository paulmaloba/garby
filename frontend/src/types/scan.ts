/**
 * scan.ts — Frontend type definitions
 * Sprint 2 — updated to match actual API response shape
 */

export type Classification    = 'AI_GENERATED' | 'REAL' | 'UNCERTAIN'
export type DetectionProvider = 'hive' | 'sightengine' | 'garby+sightengine' | 'garby-engine' | 'mock' | string
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
  media_type?:      MediaType          // optional — old scans may not have it
  classification:   Classification
  confidence:       number
  provider:         DetectionProvider
  signals:          DetectionSignal[]
  // Duration — backend may return either field name
  scan_duration_ms?: number
  duration_ms?:      number
  scanned_at:        string
  status:            ScanStatus
  // Engine scores (when garby engine is used)
  engine_scores?: {
    layer1_fft?:      number
    layer2_noise?:    number
    layer3_stats?:    number
    layer4_semantic?: number
    layer5_npr_dwt?:  number
  }
  // Video-only fields
  duration_seconds?: number
  frames_analysed?:  number
  frame_results?:    FrameResult[]
}
