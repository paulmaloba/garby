# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Garby is an AI-content-authenticity SaaS: it scans images/video and classifies them `AI_GENERATED` / `REAL` / `UNCERTAIN` with a confidence score and forensic signal breakdown. Monorepo with three independently-deployed pieces:

```
frontend/          React 18 + TS + Vite + Tailwind  → Render (static site)
backend/           Node + Express + TS               → Render (web service)
detection_engine/  Python + FastAPI (5-layer model)   → Render (web service)
```

All three pieces run on Render, provisioned from the single `render.yaml` Blueprint at the repo root. The frontend moved off Vercel (2026-09-01) for the same reason the backend/engine moved off Railway earlier: cross-provider hosting had repeatedly caused reachability problems, and consolidating onto one host fixed it. There was never a custom domain DNS-wired to the old Vercel deployment, so that move was hosting-only.

The backend never runs detection itself — it calls out to `detection_engine` over HTTP (`GARBY_ENGINE_URL`), and to Sightengine as a secondary vote. See "Detection pipeline" below before touching any scan-related code.

## Commands

### Frontend (`cd frontend`)
- `npm run dev` — Vite dev server on :5173
- `npm run lint` / `npm run lint:fix` — ESLint, `--max-warnings 0`
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — `tsc && vite build` (typecheck errors fail the build)
- `npm test` / `npm run test:watch` — Vitest (no spec files exist yet — this is a scaffold, not a smell to preserve)

### Backend (`cd backend`)
- `npm run dev` — ts-node-dev on :3001, auto-respawn
- `npm run lint` / `npm run lint:fix` — same ESLint contract as frontend
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` / `npm start` — `tsc` → `node dist/index.js`
- `npm test` — currently a no-op placeholder (`"will add in T-007"`); don't assume real coverage exists here

### Detection engine (`cd detection_engine`)
- `pip install -r requirements.txt`
- `uvicorn main:app --host 0.0.0.0 --port 8001 --reload` — run locally (backend's `GARBY_ENGINE_URL` defaults to `http://localhost:8001`)
- `python test_engine.py <image_path>` — runs detection directly (bypassing HTTP) then again through a locally-running API server, printing timings for both. Fastest way to sanity-check a layer change against a real image.

### CI (`.github/workflows/ci-cd.yml`)
Push/PR to `main`/`staging`/`dev` runs, per Node workspace (frontend, backend): lint → typecheck → test → build. `main`/`staging` pushes then hit deploy jobs that POST to Render deploy hooks and run `vercel-action`. The detection engine has no CI job — Render builds it straight from `render.yaml` on deploy hook trigger, so lint/type errors in Python are only caught by running `main.py` yourself.

## Architecture

### Detection pipeline (the core of the system)

Request flow for an image scan: `scanController.ts` → `detection.service.ts` (`runDetection`) → fans out in parallel to `garby-engine.service.ts` (calls `detection_engine`'s `/analyse`) and `sightengine.service.ts`, then merges.

The merge is **not** a fixed-weight ensemble — it's a cascade, and the ordering matters (see the docstring at the top of `backend/src/services/detection.service.ts` for the full v2→v3 rationale):
1. Garby engine says `AI_GENERATED` → trust it outright, Sightengine is not consulted for the verdict (only for extra signals).
2. Garby engine `UNCERTAIN` → blend 60/40 (engine/Sightengine) to break the tie.
3. Garby engine says `REAL` → Sightengine can only override to AI if it's ≥0.75 confident; otherwise a 70/30 blend leaning Real wins.

Sightengine was demoted from a 35%-weighted voter (v2) because it's trained on GAN-era data and reliably mis-scores diffusion-model output as real — it can now only *add* AI detections, never suppress one the Garby engine already made. Don't reintroduce a symmetric-weight ensemble without re-reading that history.

Video (`video.service.ts`) is a separate pipeline: extract 10 frames via ffmpeg → run the same image-level engine per frame → run Layer 6 temporal analysis (`/analyse-temporal`, optical flow / frame-diff entropy / skin flicker / edge stability) → combine 60% image-level + 40% temporal.

Inside `detection_engine`, `main.py` (the FastAPI app Render/uvicorn actually serves) imports the orchestrator as `from garby_orchestrator_v2 import detect_trained as detect`. **`garby_orchestrator_v2.py` is the live orchestrator** — `garby_orchestrator.py` (rule-based, no trained model) and `garby_orchestrator_grok.py` are earlier/alternate versions still in the tree but not wired to `main.py`; check the import before assuming which one a change should land in. `detect_trained()` loads `garby_model.pkl` (a trained classifier over the 5 layers' features) and falls back to the rule-based `detect()` only if the pickle is missing. Layers 1–5 (`garby_layer{1..5}_*.py`) are frequency/noise/statistical/semantic/NPR-DWT analysis; Layer 6 (`garby_layer6_temporal.py`) is video-only and called from a separate endpoint. `garby_layer6_aeroblade.py` is a newly added, not-yet-wired layer.

### Provider/classification vocabulary mismatch (recent bug class)

`detection.service.ts` writes `provider` strings like `'garby-engine'` and `'garby+sightengine'` that don't match the historical Postgres enum, which only had `('hive', 'sightengine', 'mock')` — a leftover from before the Garby engine existed. That enum drift silently failed every scan's DB write (`scanController.ts`'s UPDATE) while the API response still looked successful, because the response is built from in-memory data, not a DB read-back — the result page then re-fetched a still-`processing` row and rendered it as "Uncertain". Fixed by `migration_004_fix_provider_enum.sql`. When adding a new provider string anywhere in `detection.service.ts`/`garby-engine.service.ts`, add a matching enum migration in the same change — schema and code drift silently here, with no test catching it.

`backend/src/db/schema.sql` is the original baseline; `migration_00{2,3,4}_*.sql` at repo root are incremental changes applied by hand in the Supabase SQL editor — there's no migration runner, so check the latest numbered migration before assuming the schema matches `schema.sql` alone.

### Storage

`storage.service.ts` uploads through the S3 SDK to Cloudflare R2 (S3-compatible). R2 requires `region: 'auto'` — `'us-east-1'` produces a request that looks valid but fails `SignatureDoesNotMatch` because region is part of the SigV4 signed scope. Don't "fix" this back to a real AWS region.

### Frontend routing

`/` redirects straight to `/scan` — there's no marketing home page in the router; `ScanPage` is the landing experience. Public vs. protected routes are split by wrapping protected ones in a single `<Route element={<ProtectedRoute />}>`. Path alias `@/*` → `src/*` (set in `tsconfig.json` — mirror it in `vite.config.ts` if adding a new alias).

### Deploy config lives in two places that must stay in sync

`render.yaml` (repo root, Blueprint for `garby-frontend`, `garby-backend`, and `garby-detection-engine`) pins `NODE_VERSION` — keep it matched to `NODE_VERSION` in `ci-cd.yml` to avoid toolchain drift (a comment in `render.yaml` calls this out explicitly). `garby-backend`/`garby-detection-engine` have `autoDeploy: false`; those two only deploy via the CI workflow's deploy-hook curl calls after lint/test/build pass on `main`/`staging`. `garby-frontend` is different — it's `autoDeploy: true` and tracks `main` directly through Render's own git integration, so it deploys on every push to `main` without going through CI's gate at all (static assets are cheap to rebuild/roll back, so this asymmetry is intentional, not an oversight). `NPM_CONFIG_PRODUCTION=false` on the backend service is load-bearing: `NODE_ENV=production` would otherwise make `npm ci` skip devDependencies (`typescript`, `@types/*`) that the build step needs — this is called out in `render.yaml` as the actual cause of a past broken deploy.

`garby-backend`'s `FRONTEND_URL` (used for CORS in `app.ts`) and `garby-frontend`'s `VITE_API_URL` are cross-wired to each other's deterministic `https://<name>.onrender.com` URL in `render.yaml` — if either service's name ever gets Render-suffixed (as `garby-backend` itself once did, hence `-8kv5`), update the other service's value to match.

## Things to know before editing

- **Duplicate/legacy files exist alongside the live ones** — check imports before assuming which file is canonical: `garby_orchestrator_v2.py` (live) vs `garby_orchestrator.py`/`garby_orchestrator_grok.py`; `main.py` (live, per `Procfile`/`render.yaml`) vs `main-b4-videotrain.py`/`mainn.py`; `App.tsx` (live, imported by `main.tsx`) vs `App-b4-deploy.tsx`; `hive.service.ts` (live, imported by `sightengine.service.ts`) vs `hive.service_for_sp2.ts`.
- Neither Node workspace has real test coverage yet (backend's `test` script is a literal no-op; frontend has Vitest wired but no spec files) — don't treat `npm test` passing as evidence a change is correct.
- The detection engine has no lint/type CI — verify Python changes by actually running `main.py` or `test_engine.py` locally.
