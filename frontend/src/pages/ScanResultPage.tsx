/**
 * ScanResultPage.tsx — Sprint 2
 * Defensive rendering — handles all optional fields gracefully.
 * Shows engine layer scores when available.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import ResultCard from '@/components/ResultCard'
import VideoResultCard from '@/components/VideoResultCard'
import SignalsPanel from '@/components/SignalsPanel'
import StampDownload from '@/components/StampDownload'
import Button from '@/components/ui/Button'
import type { ScanResult } from '@/types/scan'

type PageState = 'loading' | 'ready' | 'not_found' | 'error'

export default function ScanResultPage() {
  const { id }  = useParams<{ id: string }>()
  const [scan, setScan]     = useState<ScanResult | null>(null)
  const [state, setState]   = useState<PageState>('loading')
  const [copied, setCopied] = useState(false)
  const [error, setError]   = useState<string>('')

  useEffect(() => {
    if (!id) { setState('not_found'); return }
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
    fetch(`${apiUrl}/api/scan/${id}`)
      .then(res => {
        if (res.status === 404) { setState('not_found'); return null }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => {
        if (!json) return
        setScan(json.data)
        setState('ready')
      })
      .catch(err => {
        setError(err.message)
        setState('error')
      })
  }, [id])

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (state === 'loading') return (
    <div className="min-h-screen bg-garby-dark flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <svg viewBox="0 0 64 64" fill="none" className="w-10 h-10 animate-spin">
          <path d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
            stroke="#2ECC71" strokeWidth="4" strokeLinecap="round"/>
        </svg>
        <p className="text-garby-grey text-sm">Loading scan result...</p>
      </div>
    </div>
  )

  if (state === 'not_found') return (
    <div className="min-h-screen bg-garby-dark flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="section-label mb-3">404</p>
        <h1 className="text-2xl font-bold text-white mb-3">Scan not found</h1>
        <p className="text-garby-grey text-sm mb-6">This result doesn't exist or may have expired.</p>
        <Link to="/scan"><Button>Run a new scan</Button></Link>
      </div>
    </div>
  )

  if (state === 'error' || !scan) return (
    <div className="min-h-screen bg-garby-dark flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="section-label mb-3">Error</p>
        <h1 className="text-2xl font-bold text-white mb-3">Something went wrong</h1>
        <p className="text-garby-grey text-xs mb-6 font-mono">{error}</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    </div>
  )

  // Normalise duration field — backend uses both names
  const scanDurationMs = scan.scan_duration_ms ?? scan.duration_ms ?? 0
  const isVideo        = scan.media_type === 'video'

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-28 pb-16 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label mb-2">Scan Result</p>
            <h1 className="text-2xl font-bold">Authenticity Report</h1>
            <p className="text-garby-grey text-xs mt-1">
              {scan.scanned_at
                ? new Date(scan.scanned_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : '—'
              }
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopyLink} className="shrink-0">
            {copied ? '✓ Copied!' : 'Share result'}
          </Button>
        </div>

        {/* Result Card */}
        {isVideo && scan.frame_results ? (
          <VideoResultCard
            classification={scan.classification}
            confidence={scan.confidence}
            provider={scan.provider}
            scanDurationMs={scanDurationMs}
            videoUrl={scan.image_url}
            durationSeconds={scan.duration_seconds ?? 0}
            framesAnalysed={scan.frames_analysed ?? 0}
            frameResults={scan.frame_results}
          />
        ) : (
          <ResultCard
            classification={scan.classification}
            confidence={scan.confidence}
            provider={scan.provider}
            scanDurationMs={scanDurationMs}
            imageUrl={scan.image_url}
            mediaType={scan.media_type ?? 'image'}
          />
        )}

        {/* Signals Panel */}
        {scan.signals && scan.signals.length > 0 && (
          <SignalsPanel
            signals={scan.signals}
            classification={scan.classification}
          />
        )}

        {/* Engine Layer Scores */}
        {scan.engine_scores && (
          <EngineScoresPanel scores={scan.engine_scores} />
        )}

        {/* Garby Stamp — available for both AI-generated and real results;
            UNCERTAIN is excluded since there's no verified classification to certify */}
        {(scan.classification === 'AI_GENERATED' || scan.classification === 'REAL') && (
          <StampDownload scanId={scan.id} />
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link to="/scan" className="flex-1">
            <Button fullWidth>Scan another image</Button>
          </Link>
          <Link to="/dashboard" className="flex-1">
            <Button fullWidth variant="secondary">View history</Button>
          </Link>
        </div>

        <p className="text-center text-xs text-garby-grey pt-2 font-mono opacity-50">
          {scan.id}
        </p>

      </div>
    </div>
  )
}

// ── Engine Scores Panel ───────────────────────────────────────────────────────

const LAYER_LABELS: Record<string, string> = {
  layer1_fft:      'L1 — Frequency (FFT)',
  layer2_noise:    'L2 — Noise (PRNU)',
  layer3_stats:    'L3 — Statistical (Benford)',
  layer4_semantic: 'L4 — Semantic + Physical',
  layer5_npr_dwt:  'L5 — NPR + DWT',
}

function EngineScoresPanel({ scores }: { scores: Record<string, number> }) {
  return (
    <div className="card border border-white/10">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-garby-cyan"/>
        <h3 className="text-sm font-semibold text-white">Garby Engine — Layer Breakdown</h3>
        <span className="text-xs text-garby-grey ml-auto">5-layer forensic analysis</span>
      </div>
      <div className="space-y-2.5">
        {Object.entries(LAYER_LABELS).map(([key, label]) => {
          const score = scores[key] ?? 0
          const pct   = Math.round(score * 100)
          const colour =
            score >= 0.50 ? 'bg-red-500'    :
            score >= 0.35 ? 'bg-yellow-500' : 'bg-garby-green'
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-garby-grey">{label}</span>
                <span className={`text-xs font-mono font-semibold ${
                  score >= 0.50 ? 'text-red-400' :
                  score >= 0.35 ? 'text-yellow-400' : 'text-garby-green'
                }`}>{pct}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${colour}`}
                  style={{ width: `${pct}%` }}/>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-garby-grey mt-3 opacity-60">
        Scores above 50% indicate AI generation signals. Combined with Sightengine neural classifier.
      </p>
    </div>
  )
}
