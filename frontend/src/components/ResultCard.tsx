/**
 * ResultCard.tsx
 * Task: T-023 — Result Card Component
 * Task: T-033 — Fixed image preview (uses MediaPreview with fallback)
 */

import { useEffect, useState } from 'react'
import type { Classification } from '@/types/scan'
import MediaPreview from '@/components/MediaPreview'

interface ResultCardProps {
  classification: Classification
  confidence:     number
  provider:       string
  scanDurationMs: number
  imageUrl:       string
  mediaType?:     string
}

const VERDICT: Record<Classification, {
  label:       string
  sublabel:    string
  barColour:   string
  badgeBg:     string
  badgeBorder: string
  badgeText:   string
  glowColour:  string
  icon:        string
}> = {
  AI_GENERATED: {
    label:       'AI Generated',
    sublabel:    'This image shows strong indicators of synthetic generation.',
    barColour:   'bg-red-500',
    badgeBg:     'bg-red-500/20',
    badgeBorder: 'border-red-500/40',
    badgeText:   'text-red-400',
    glowColour:  'shadow-red-500/20',
    icon:        '⚠',
  },
  REAL: {
    label:       'Real',
    sublabel:    'This image appears to be authentically captured.',
    barColour:   'bg-garby-green',
    badgeBg:     'bg-garby-green/20',
    badgeBorder: 'border-garby-green/40',
    badgeText:   'text-garby-green',
    glowColour:  'shadow-garby-green/20',
    icon:        '✓',
  },
  UNCERTAIN: {
    label:       'Uncertain',
    sublabel:    'Detection confidence is too low to make a definitive call.',
    barColour:   'bg-yellow-500',
    badgeBg:     'bg-yellow-500/20',
    badgeBorder: 'border-yellow-500/40',
    badgeText:   'text-yellow-400',
    glowColour:  'shadow-yellow-500/20',
    icon:        '?',
  },
}

export default function ResultCard({
  classification, confidence, provider, scanDurationMs, imageUrl, mediaType = 'image',
}: ResultCardProps) {
  const verdict = VERDICT[classification]
  const pct     = Math.round(confidence * 100)
  const [barWidth, setBarWidth] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(pct), 120)
    return () => clearTimeout(t)
  }, [pct])

  return (
    <div className={`card border animate-slide-up shadow-xl ${verdict.glowColour} ${verdict.badgeBorder}`}>
      <div className="flex flex-col sm:flex-row gap-5">

        {/* Thumbnail */}
        <div className="relative shrink-0 w-full sm:w-28 h-28 rounded-lg overflow-hidden border border-white/10 bg-white/5">
          <MediaPreview url={imageUrl} mediaType={mediaType}/>
          <div className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center
            text-xs font-bold ${verdict.badgeBg} ${verdict.badgeText} border ${verdict.badgeBorder}`}>
            {verdict.icon}
          </div>
        </div>

        {/* Verdict */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full
              text-sm font-bold border ${verdict.badgeBg} ${verdict.badgeText} ${verdict.badgeBorder}`}>
              <span>{verdict.icon}</span>
              {verdict.label.toUpperCase()}
            </span>
            <span className="text-xs text-garby-grey border border-white/10 px-2 py-0.5 rounded-full">
              via {provider}
            </span>
          </div>

          <p className="text-garby-grey text-sm mb-4 leading-relaxed">{verdict.sublabel}</p>

          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-garby-grey font-medium uppercase tracking-wider">Confidence</span>
            <span className={`text-lg font-bold font-mono ${verdict.badgeText}`}>{pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${verdict.barColour}`}
              style={{ width: `${barWidth}%` }}/>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs text-garby-grey flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {(scanDurationMs / 1000).toFixed(2)}s scan time
            </span>
            <span className="text-xs text-garby-grey">{provider} model</span>
          </div>
        </div>
      </div>
    </div>
  )
}
