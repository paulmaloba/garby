/**
 * ScanPage.tsx
 * Task: T-031 — Public access (no login required)
 * Task: T-032 — UI consistency pass
 * Task: T-037 — Detection error UX improvements
 * Sprint 2
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import UploadZone, { type ValidatedFile } from '@/components/UploadZone'
import { GuestLimitReached } from '@/components/GuestGuard'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useGuestScans } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type ScanState = 'idle' | 'uploading' | 'scanning' | 'done' | 'error'

const ERROR_HINTS: Record<string, string> = {
  'Detection failed':     'Our detection providers are temporarily unavailable. Please try again in a moment.',
  'File too large':       'Try compressing the file or use a shorter video clip.',
  'No file provided':     'Please select an image or video before scanning.',
  'Scan limit reached':   'You\'ve used all your scans for this period.',
  'Too many scan requests': 'Slow down! You\'ve made too many requests. Wait a few minutes.',
}

function getFriendlyError(raw: string): string {
  for (const [key, hint] of Object.entries(ERROR_HINTS)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return hint
  }
  return raw
}

export default function ScanPage() {
  const { user, profile } = useAuth()
  const guestScans = useGuestScans()
  const navigate   = useNavigate()

  const [file, setFile]           = useState<ValidatedFile | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const [progress, setProgress]   = useState<string>('')

  const isFreeTierExhausted =
    profile?.tier === 'free' && (profile.scans_used_this_month ?? 0) >= 20
  const isGuestExhausted = !user && guestScans.hasReachedLimit()

  // ── Scan submit ────────────────────────────────────────────────────────────
  async function handleScan() {
    if (!file) return

    // Increment guest count before scanning
    if (!user) guestScans.increment()

    setScanState('uploading')
    setScanError(null)
    setProgress('Uploading...')

    try {
      const formData = new FormData()
      formData.append('image', file.file)

      const headers: Record<string, string> = {}

      if (user) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }
      } else {
        headers['X-Guest-Scans'] = String(guestScans.getCount())
        headers['X-Session-Id']  = getOrCreateSessionId()
      }

      setScanState('scanning')
      setProgress(file.mediaType === 'video'
        ? 'Extracting frames and analysing...'
        : 'Analysing image...')

      const res  = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/scan`,
        { method: 'POST', headers, body: formData }
      )
      const json = await res.json()

      if (!res.ok) {
        const friendly = getFriendlyError(json.message ?? 'Scan failed.')
        setScanError(friendly)
        setScanState('error')
        return
      }

      navigate(`/scan/${json.data.id}`)

    } catch (err) {
      setScanError(getFriendlyError((err as Error).message ?? 'Something went wrong.'))
      setScanState('error')
    }
  }

  const isScanning = scanState === 'uploading' || scanState === 'scanning'

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 pt-28 pb-24 space-y-6">

        {/* Header */}
        <div>
          <p className="section-label mb-2">Scan</p>
          <h1 className="text-3xl font-bold">Is it real?</h1>
          <p className="text-garby-grey mt-2 text-sm leading-relaxed">
            Upload an image or video. Garby will tell you if it's AI-generated or real —
            with a confidence score and full forensic breakdown.
          </p>
        </div>

        {/* Free tier exhausted */}
        {isFreeTierExhausted && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5
            flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">Monthly scan limit reached</p>
              <p className="text-garby-grey text-xs mt-1">
                You've used all 20 free scans this month. Resets on the 1st.
              </p>
            </div>
            <Link to="/pricing">
              <Button size="sm" className="shrink-0">Upgrade to Pro</Button>
            </Link>
          </div>
        )}

        {/* Guest exhausted */}
        {isGuestExhausted && <GuestLimitReached />}

        {/* Main scan area */}
        {!isGuestExhausted && !isFreeTierExhausted && (
          <div className="space-y-4">

            {/* Upload zone */}
            <UploadZone
              onFileReady={setFile}
              onClear={() => { setFile(null); setScanError(null); setScanState('idle') }}
              disabled={isScanning}
              currentFile={file}
            />

            {/* Scanning progress state */}
            {isScanning && (
              <div className="rounded-xl border border-white/10 bg-garby-mid p-6 text-center animate-fade-in">
                {file && (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 mx-auto mb-4">
                    {file.mediaType === 'video'
                      ? <video src={file.previewUrl} className="w-full h-full object-cover" muted playsInline/>
                      : <img src={file.previewUrl} alt="" className="w-full h-full object-cover"/>
                    }
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute left-0 right-0 h-0.5 bg-garby-green/70 animate-scan-line"/>
                    </div>
                  </div>
                )}
                <p className="font-semibold text-white text-sm mb-1">{progress}</p>
                {file?.mediaType === 'video' && (
                  <p className="text-garby-grey text-xs mb-3">
                    Analysing {file.duration}s video — extracting 10 frames
                  </p>
                )}
                <div className="flex justify-center gap-1.5 mt-3">
                  {[0, 150, 300].map(d => (
                    <div key={d} className="w-1.5 h-1.5 rounded-full bg-garby-green animate-bounce"
                      style={{ animationDelay: `${d}ms` }}/>
                  ))}
                </div>
              </div>
            )}

            {/* Error state — T-037 */}
            {scanState === 'error' && scanError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 animate-fade-in">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <div className="flex-1">
                    <p className="text-red-400 text-sm font-medium mb-1">Scan failed</p>
                    <p className="text-red-400/80 text-xs leading-relaxed">{scanError}</p>
                  </div>
                  <button
                    onClick={() => { setScanError(null); setScanState('idle') }}
                    className="text-red-400/60 hover:text-red-400 transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleScan} disabled={!file}>
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { setFile(null); setScanError(null); setScanState('idle') }}>
                    Upload different file
                  </Button>
                </div>
              </div>
            )}

            {/* Submit button */}
            {!isScanning && scanState !== 'error' && (
              <Button
                onClick={handleScan}
                disabled={!file}
                fullWidth
                size="lg"
              >
                {file?.mediaType === 'video' ? 'Scan this video' : 'Scan this image'}
              </Button>
            )}

            {/* Guest scan counter */}
            {!user && !isGuestExhausted && (
              <p className="text-center text-xs text-garby-grey">
                {guestScans.remaining()} guest scan{guestScans.remaining() !== 1 ? 's' : ''} remaining
                {' · '}
                <Link to="/register" className="text-garby-green hover:underline">
                  Sign up free
                </Link>
                {' '}for 20/month
              </p>
            )}
          </div>
        )}

        {/* What Garby checks */}
        {scanState === 'idle' && !isGuestExhausted && !isFreeTierExhausted && (
          <div className="border-t border-white/5 pt-6">
            <p className="text-xs font-semibold tracking-widest text-garby-grey uppercase mb-4">
              What Garby checks
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { signal: 'GAN texture artifacts',    desc: 'Repeating patterns from generative models' },
                { signal: 'Diffusion fingerprints',   desc: 'Statistical traces from DALL·E, Midjourney, SD' },
                { signal: 'Lighting inconsistency',   desc: 'Physically impossible shadows and light angles' },
              ].map(({ signal, desc }) => (
                <div key={signal} className="card py-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-garby-green mb-2"/>
                  <p className="text-white text-xs font-semibold mb-1">{signal}</p>
                  <p className="text-garby-grey text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getOrCreateSessionId(): string {
  const key = 'garby_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, id)
  }
  return id
}
