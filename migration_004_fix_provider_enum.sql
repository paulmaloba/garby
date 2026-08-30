-- ══════════════════════════════════════════════════════════════════════════════
-- GARBY — Migration: Fix detection_provider enum drift
-- Run in Supabase SQL Editor
--
-- Root cause of every scan silently failing to persist its result:
-- detection_provider only allowed ('hive', 'sightengine', 'mock'), a leftover
-- from before the Garby engine existed. detection.service.ts's v3 cascade
-- (the PRIMARY, most-used path) writes provider = 'garby-engine' or
-- 'garby+sightengine' — both rejected by this enum, causing the UPDATE in
-- scanController.ts to fail on every real scan. The POST response still
-- looked successful because it's built from in-memory data, not a DB
-- read-back — so the row was left at status='processing', classification=NULL,
-- and the result page (which re-fetches from the DB) rendered that as
-- "Uncertain" for every scan.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TYPE detection_provider ADD VALUE IF NOT EXISTS 'garby-engine';
ALTER TYPE detection_provider ADD VALUE IF NOT EXISTS 'garby+sightengine';
