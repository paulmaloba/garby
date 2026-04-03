-- ══════════════════════════════════════════════════════════════════════════════
-- GARBY — Migration: Video Detection Support
-- Task: T-043 | Sprint 2
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- Add media type to distinguish image vs video scans
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS media_type       TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS frames_analysed  INTEGER,
  ADD COLUMN IF NOT EXISTS frame_results    JSONB;

-- Update enum check (informational — Supabase uses TEXT for flexibility)
COMMENT ON COLUMN public.scans.media_type IS 'image | video';
COMMENT ON COLUMN public.scans.frame_results IS
  'Array of per-frame results: [{frame: 1, classification, confidence, timestamp_ms}]';

-- Index for filtering by media type
CREATE INDEX IF NOT EXISTS idx_scans_media_type
  ON public.scans (media_type);
