-- ══════════════════════════════════════════════════════════════════════════════
-- GARBY — Initial Database Schema
-- Task: T-004 | Sprint 1 | Documentation II
-- Run this in the Supabase SQL Editor to initialise the database.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enum types ────────────────────────────────────────────────────────────────
CREATE TYPE user_tier AS ENUM ('guest', 'free', 'pro', 'enterprise');
CREATE TYPE classification AS ENUM ('AI_GENERATED', 'REAL', 'UNCERTAIN');
CREATE TYPE scan_status AS ENUM ('pending', 'processing', 'complete', 'failed');
CREATE TYPE detection_provider AS ENUM ('hive', 'sightengine', 'mock');

-- ── Users ─────────────────────────────────────────────────────────────────────
-- Extends Supabase's auth.users with Garby-specific profile data.
CREATE TABLE IF NOT EXISTS public.users (
  id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                    TEXT NOT NULL UNIQUE,
  display_name             TEXT,
  tier                     user_tier NOT NULL DEFAULT 'free',
  scans_used_this_month    INTEGER NOT NULL DEFAULT 0,
  scan_reset_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Scans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scans (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- NULL user_id = guest scan (tracked via session cookie on frontend)
  session_id          TEXT,         -- Guest session identifier
  image_url           TEXT NOT NULL,
  classification      classification,
  confidence          NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  provider            detection_provider,
  signals             JSONB NOT NULL DEFAULT '[]',
  -- signals format: [{ "label": "GAN texture", "description": "...", "severity": "high" }]
  scan_duration_ms    INTEGER,
  status              scan_status NOT NULL DEFAULT 'pending',
  scanned_at          TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scans_user_id    ON public.scans (user_id);
CREATE INDEX IF NOT EXISTS idx_scans_status     ON public.scans (status);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON public.scans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_session_id ON public.scans (session_id);

-- ── Row Level Security (RLS) ──────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Users can view their own scans
CREATE POLICY "Users can view own scans"
  ON public.scans FOR SELECT
  USING (auth.uid() = user_id);

-- Any authenticated or anonymous user can insert a scan
-- (rate limiting is enforced in the API layer)
CREATE POLICY "Anyone can create a scan"
  ON public.scans FOR INSERT
  WITH CHECK (true);

-- Public read for shareable scan results
CREATE POLICY "Completed scans are publicly viewable"
  ON public.scans FOR SELECT
  USING (status = 'complete');

-- ── Monthly scan counter reset function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_monthly_scan_counts()
RETURNS VOID AS $$
BEGIN
  UPDATE public.users
  SET
    scans_used_this_month = 0,
    scan_reset_at = NOW()
  WHERE
    scan_reset_at < date_trunc('month', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Wire this to a cron job (Supabase pg_cron) that runs on the 1st of each month.

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA — Run this once on a fresh Supabase project.
-- Next: configure RLS policies in Supabase dashboard and verify with test data.
-- ══════════════════════════════════════════════════════════════════════════════
