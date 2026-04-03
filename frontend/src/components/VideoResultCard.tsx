/**
 * VideoResultCard.tsx
 * Task: T-042 — Video Result Card
 * Sprint 2
 *
 * Shows video-specific scan data:
 * - Overall classification with confidence
 * - Frames analysed count and duration
 * - Per-frame confidence bar chart
 */

import { useEffect, useState } from 'react'
import type { Classification } from '@/types/scan'
import type { FrameResult } from '@/types/scan'

interface VideoResultCardProps {
  classification:  Classification
  confidence:      number
  provider:        string
  scanDurationMs:  number
  videoUrl:        string
  durationSeconds: number
  framesAnalysed:  number
  frameResults:    FrameResult[]
}

const VERDICT = {
  AI_GENERATED: { label: 'AI Generated', badge: 'bg-red-500/20 text-red-400 border-red-500/40',     bar: 'bg-red-500',    glow: 'shadow-red-500/20',   icon: '⚠' },
  REAL:         { label: 'Real',          badge: 'bg-garby-green/20 text-garby-green border-garby-green/40', bar: 'bg-garby-green', glow: 'shadow-garby-green/20', icon: '✓' },
  UNCERTAIN:    { label: 'Uncertain',     badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',   bar: 'bg-yellow-500', glow: 'shadow-yellow-500/20', icon: '?' },
}

export default function VideoResultCard({
  classification, confidence, provider, scanDurationMs,
  videoUrl, durationSeconds, framesAnalysed, frameResults,
}: VideoResultCardProps) {
  const verdict = VERDICT[classification]
  const pct     = Math.round(confidence * 100)
  const [barWidth, setBarWidth] = useState(0)
  const [showFrames, setShowFrames] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(pct), 120)
    return () => clearTimeout(t)
  }, [pct])

  const aiFrameCount = frameResults.filter(f => f.classification === 'AI_GENERATED').length

  return (
    <div className={`card border animate-slide-up shadow-xl ${verdict.glow} border-opacity-50`}
      style={{ borderColor: classification === 'AI_GENERATED' ? 'rgba(239,68,68,0.4)' : classification === 'REAL' ? 'rgba(46,204,113,0.4)' : 'rgba(234,179,8,0.4)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-4 mb-5">

        {/* Video thumbnail */}
        <div className="relative shrink-0 w-full sm:w-28 h-28 rounded-lg overflow-hidden border border-white/10 bg-black">
          <video src={videoUrl} className="w-full h-full object-cover" muted playsInline/>
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <svg className="w-8 h-8 text-white opacity-80" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
            {durationSeconds}s
          </div>
        </div>

        {/* Verdict */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${verdict.badge}`}>
              <span>{verdict.icon}</span>
              {verdict.label.toUpperCase()}
            </span>
            <span className="text-xs text-garby-grey border border-white/10 px-2 py-0.5 rounded-full">
              VIDEO · via {provider}
            </span>
          </div>

          <p className="text-garby-grey text-sm mb-3 leading-relaxed">
            {classification === 'AI_GENERATED'
              ? `${aiFrameCount} of ${framesAnalysed} analysed frames show AI generation indicators.`
              : classification === 'REAL'
              ? `${framesAnalysed} analysed frames show no significant AI generation indicators.`
              : `Detection confidence is low. Results are inconclusive across ${framesAnalysed} frames.`
            }
          </p>

          {/* Confidence bar */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-garby-grey font-medium uppercase tracking-wider">Confidence</span>
            <span className="text-lg font-bold font-mono" style={{
              color: classification === 'AI_GENERATED' ? '#f87171' : classification === 'REAL' ? '#2ECC71' : '#eab308'
            }}>{pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${verdict.bar}`}
              style={{ width: `${barWidth}%` }}/>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs text-garby-grey flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              {framesAnalysed} frames analysed
            </span>
            <span className="text-xs text-garby-grey flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {(scanDurationMs / 1000).toFixed(1)}s total scan time
            </span>
          </div>
        </div>
      </div>

      {/* ── Per-frame chart ──────────────────────────────────────────────────── */}
      {frameResults.length > 0 && (
        <div>
          <button
            onClick={() => setShowFrames(f => !f)}
            className="w-full flex items-center justify-between text-left mb-3"
          >
            <span className="text-sm font-semibold text-white">Frame-by-frame breakdown</span>
            <svg className={`w-4 h-4 text-garby-grey transition-transform ${showFrames ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {showFrames && (
            <div className="space-y-2">
              {frameResults.map((frame) => {
                const isAI   = frame.classification === 'AI_GENERATED'
                const fpct   = Math.round(frame.confidence * 100)
                const ts     = (frame.timestamp_ms / 1000).toFixed(1)
                return (
                  <div key={frame.frame} className="flex items-center gap-3">
                    <span className="text-xs text-garby-grey font-mono w-12 shrink-0 text-right">
                      {ts}s
                    </span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isAI ? 'bg-red-500' : 'bg-garby-green'
                        }`}
                        style={{ width: `${fpct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono w-10 shrink-0 ${isAI ? 'text-red-400' : 'text-garby-green'}`}>
                      {fpct}%
                    </span>
                    <span className={`text-xs w-6 text-center ${isAI ? 'text-red-400' : 'text-garby-green'}`}>
                      {isAI ? '⚠' : '✓'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
