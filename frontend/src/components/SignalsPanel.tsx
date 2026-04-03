/**
 * SignalsPanel.tsx
 * Task: T-024 — Detection Signals Panel
 *
 * Expandable panel showing the list of forensic signals that
 * contributed to the classification. Each signal has a severity
 * badge and a plain-English explanation.
 * Shows a clean empty state when no signals are returned (e.g. REAL images).
 */

import { useState } from 'react'
import type { DetectionSignal } from '@/types/scan'

interface SignalsPanelProps {
  signals: DetectionSignal[]
  classification: string
}

const SEVERITY_STYLES = {
  high:   { dot: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/20 border-red-500/30 text-red-400' },
  medium: { dot: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' },
  low:    { dot: 'bg-blue-400',   text: 'text-blue-400',   badge: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
}

export default function SignalsPanel({ signals, classification }: SignalsPanelProps) {
  const [expanded, setExpanded] = useState(true)

  const hasSignals = signals && signals.length > 0

  return (
    <div className="card border border-white/10">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="font-semibold text-white">Detection Signals</span>
          {hasSignals && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-garby-green/20 text-garby-green border border-garby-green/30">
              {signals.length}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-garby-grey transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="mt-5">

          {/* No signals — clean state */}
          {!hasSignals && (
            <div className="text-center py-6">
              <div className="w-10 h-10 rounded-full bg-garby-green/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white mb-1">
                {classification === 'REAL'
                  ? 'No synthetic signals detected'
                  : 'No specific signals returned'}
              </p>
              <p className="text-xs text-garby-grey leading-relaxed max-w-xs mx-auto">
                {classification === 'REAL'
                  ? 'The detection model found no indicators of AI generation in this image.'
                  : 'The detection provider did not return granular signal data for this scan.'}
              </p>
            </div>
          )}

          {/* Signal list */}
          {hasSignals && (
            <div className="space-y-3">
              {signals.map((signal, i) => {
                const style = SEVERITY_STYLES[signal.severity] ?? SEVERITY_STYLES.low
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5"
                  >
                    {/* Severity dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${style.dot}`} />

                    {/* Signal info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-white">
                          {signal.label}
                        </span>
                        <span className={`
                          text-xs font-bold px-2 py-0.5 rounded-full border
                          ${style.badge}
                        `}>
                          {signal.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-garby-grey leading-relaxed">
                        {signal.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer note */}
          <p className="text-xs text-garby-grey mt-4 pt-4 border-t border-white/5 leading-relaxed">
            Signals are forensic indicators extracted by the detection model.
            High-severity signals carry more weight in the final classification.
            {' '}
            <span className="text-garby-green">
              Fine-tuned model with expanded signal coverage coming in Phase 2.
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
