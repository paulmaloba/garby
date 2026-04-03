/**
 * ScanResultPage.tsx
 * Task: T-023 — Result Card
 * Task: T-024 — Signals Panel
 * Task: T-026 — Shareable Result Link
 * Task: T-028 — Garby Stamp (Sprint 2)
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
  const { id } = useParams<{ id: string }>()
  const [scan, setScan]     = useState<ScanResult | null>(null)
  const [state, setState]   = useState<PageState>('loading')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) { setState('not_found'); return }
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
    fetch(`${apiUrl}/api/scan/${id}`)
      .then(res => {
        if (res.status === 404) { setState('not_found'); return null }
        if (!res.ok) throw new Error('Failed to load scan')
        return res.json()
      })
      .then(json => { if (!json) return; setScan(json.data); setState('ready') })
      .catch(() => setState('error'))
  }, [id])

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

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
        <p className="text-garby-grey text-sm mb-6">We couldn't load this scan result.</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    </div>
  )

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
              {new Date(scan.scanned_at).toLocaleString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopyLink} className="shrink-0">
            {copied ? (
              <><svg className="w-3.5 h-3.5 text-garby-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>Copied!</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>Share result</>
            )}
          </Button>
        </div>

        {/* Result Card — T-023 / T-042 */}
        {scan.media_type === 'video' && scan.frame_results ? (
          <VideoResultCard
            classification={scan.classification}
            confidence={scan.confidence}
            provider={scan.provider}
            scanDurationMs={scan.scan_duration_ms}
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
            scanDurationMs={scan.scan_duration_ms}
            imageUrl={scan.image_url}
          />
        )}

        {/* Signals Panel — T-024 */}
        <SignalsPanel signals={scan.signals ?? []} classification={scan.classification} />

        {/* Garby Stamp — T-028 */}
        <StampDownload scanId={scan.id} />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link to="/scan" className="flex-1">
            <Button fullWidth>Scan another image</Button>
          </Link>
          <Link to="/dashboard" className="flex-1">
            <Button fullWidth variant="secondary">View scan history</Button>
          </Link>
        </div>

        <p className="text-center text-xs text-garby-grey pt-2">
          Scan ID: <span className="font-mono">{scan.id}</span>
        </p>

      </div>
    </div>
  )
}
