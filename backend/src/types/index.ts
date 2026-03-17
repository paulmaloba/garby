// ── Classification ────────────────────────────────────────────────────────────

export type Classification = 'AI_GENERATED' | 'REAL' | 'UNCERTAIN'

export type DetectionProvider = 'hive' | 'sightengine' | 'mock'

export interface DetectionSignal {
  label: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export type ScanStatus = 'pending' | 'processing' | 'complete' | 'failed'

export interface ScanRecord {
  id: string
  user_id: string | null          // null = guest scan
  image_url: string
  classification: Classification
  confidence: number              // 0.0 – 1.0
  provider: DetectionProvider
  signals: DetectionSignal[]
  scan_duration_ms: number
  scanned_at: string             // ISO 8601 UTC
  status: ScanStatus
}

// ── API Responses ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  message: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ── User ──────────────────────────────────────────────────────────────────────

export type UserTier = 'guest' | 'free' | 'pro' | 'enterprise'

export interface GarbyUser {
  id: string
  email: string
  display_name: string | null
  tier: UserTier
  scans_used_this_month: number
  created_at: string
}

// ── Scan limits ───────────────────────────────────────────────────────────────

export const SCAN_LIMITS: Record<UserTier, number> = {
  guest:      3,
  free:       20,
  pro:        Infinity,
  enterprise: Infinity,
}
