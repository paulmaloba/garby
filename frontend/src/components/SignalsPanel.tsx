/**
 * SignalsPanel.tsx — Detection signals breakdown
 * Defensive: handles any classification format, missing signals gracefully.
 */

import type { DetectionSignal, Classification } from '@/types/scan'

interface SignalsPanelProps {
  signals:        DetectionSignal[]
  classification: Classification | string
}

const SEVERITY_STYLES = {
  high:   { dot: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/10 border-red-500/20'    },
  medium: { dot: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500/10 border-yellow-500/20' },
  low:    { dot: 'bg-white/30',   text: 'text-garby-grey', badge: 'bg-white/5 border-white/10'         },
}

export default function SignalsPanel({ signals, classification }: SignalsPanelProps) {
  if (!signals || signals.length === 0) return null

  // Normalise classification for display
  const normClass = String(classification).toUpperCase()
  const isAI      = normClass.includes('AI') || normClass.includes('GENERATED')
  const isReal    = normClass === 'REAL' || normClass.includes('LIKELY_REAL') || normClass.includes('LIKELY REAL')

  const headerColour = isAI ? 'text-red-400' : isReal ? 'text-garby-green' : 'text-yellow-400'
  const headerDot    = isAI ? 'bg-red-500'   : isReal ? 'bg-garby-green'  : 'bg-yellow-500'

  const highSignals   = signals.filter(s => s.severity === 'high')
  const mediumSignals = signals.filter(s => s.severity === 'medium')
  const lowSignals    = signals.filter(s => s.severity === 'low')

  const ordered = [...highSignals, ...mediumSignals, ...lowSignals]

  return (
    <div className="card border border-white/10">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${headerDot}`}/>
        <h3 className={`text-sm font-semibold ${headerColour}`}>
          Detection Signals
        </h3>
        <span className="text-xs text-garby-grey ml-auto">
          {signals.length} signal{signals.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      {/* Signal list */}
      <div className="space-y-2">
        {ordered.map((signal, idx) => {
          const sev = SEVERITY_STYLES[signal.severity ?? 'low'] ?? SEVERITY_STYLES.low
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm ${sev.badge}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${sev.dot}`}/>
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-xs mb-0.5 ${sev.text}`}>
                  {signal.label ?? 'Unknown signal'}
                </p>
                <p className="text-garby-grey text-xs leading-relaxed">
                  {signal.description ?? ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {highSignals.length > 0 && (
        <p className="text-xs text-garby-grey mt-3 opacity-70">
          {highSignals.length} high-severity indicator{highSignals.length !== 1 ? 's' : ''} found.
          {isAI ? ' These are strong forensic markers of AI generation.' : ''}
        </p>
      )}
    </div>
  )
}
