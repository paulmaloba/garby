/**
 * ResultCard.tsx — Sprint 2 v3
 * Fixed: provider display, scan time, classification normalisation
 */

import { useEffect, useState } from 'react'
import type { Classification } from '@/types/scan'
import MediaPreview from '@/components/MediaPreview'

interface ResultCardProps {
  classification:  Classification | string
  confidence:      number
  provider:        string
  scanDurationMs?: number
  imageUrl:        string
  mediaType?:      string
}

const VERDICT = {
  AI_GENERATED: {
    label:       'AI Generated',
    sublabel:    'This image shows strong indicators of synthetic generation.',
    barColour:   'bg-red-500',
    badgeBg:     'bg-red-500/20',
    badgeBorder: 'border-red-500/40',
    badgeText:   'text-red-400',
    glowClass:   'shadow-red-500/20',
    icon:        '⚠',
  },
  REAL: {
    label:       'Real',
    sublabel:    'This image appears to be authentically captured.',
    barColour:   'bg-garby-green',
    badgeBg:     'bg-garby-green/20',
    badgeBorder: 'border-garby-green/40',
    badgeText:   'text-garby-green',
    glowClass:   'shadow-garby-green/20',
    icon:        '✓',
  },
  UNCERTAIN: {
    label:       'Uncertain',
    sublabel:    'Detection confidence is low — result is inconclusive.',
    barColour:   'bg-yellow-500',
    badgeBg:     'bg-yellow-500/20',
    badgeBorder: 'border-yellow-500/40',
    badgeText:   'text-yellow-400',
    glowClass:   'shadow-yellow-500/20',
    icon:        '?',
  },
}

// Map raw provider string to a human-readable label
function providerLabel(provider: string): string {
  const p = (provider ?? '').toLowerCase()
  if (p.includes('garby') && p.includes('sightengine')) return 'Garby Engine + Sightengine'
  if (p.includes('garby'))       return 'Garby Engine'
  if (p.includes('sightengine')) return 'Sightengine'
  if (p.includes('hive'))        return 'Hive AI'
  return provider ?? 'Unknown'
}

// Normalise any classification string to one of the three valid keys
function normalise(cls: string): keyof typeof VERDICT {
  const u = String(cls ?? '').toUpperCase().replace(/-/g, '_').replace(/ /g, '_')
  if (u.includes('AI') || u.includes('GENERATED')) return 'AI_GENERATED'
  if (u === 'REAL' || u.includes('LIKELY_REAL'))   return 'REAL'
  return 'UNCERTAIN'
}

export default function ResultCard({
  classification, confidence, provider, scanDurationMs, imageUrl, mediaType = 'image',
}: ResultCardProps) {
  const key     = normalise(String(classification))
  const verdict = VERDICT[key]
  const pct     = Math.round(Math.min(1, Math.max(0, confidence ?? 0)) * 100)
  const durSec  = ((scanDurationMs ?? 0) / 1000).toFixed(2)
  const [barWidth, setBarWidth] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(pct), 120)
    return () => clearTimeout(t)
  }, [pct])

  return (
    <div className={`card border animate-slide-up shadow-xl ${verdict.glowClass} ${verdict.badgeBorder}`}>
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
              {providerLabel(provider)}
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

          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {(scanDurationMs ?? 0) > 0 && (
              <span className="text-xs text-garby-grey flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {durSec}s scan time
              </span>
            )}
            <span className="text-xs text-garby-grey">
              {providerLabel(provider)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
