-- ══════════════════════════════════════════════════════════════════════════════
-- GARBY — Migration: Waitlist table
-- Task: T-052 | Sprint 2
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      TEXT NOT NULL UNIQUE,
  tier       TEXT NOT NULL DEFAULT 'Pro',
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Allow anyone to insert (unauthenticated users can join waitlist)
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view own waitlist entry"
  ON public.waitlist FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist (email);
CREATE INDEX IF NOT EXISTS idx_waitlist_tier  ON public.waitlist (tier);
