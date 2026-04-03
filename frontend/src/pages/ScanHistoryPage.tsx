/**
 * ScanHistoryPage.tsx
 * Task: T-025 — Scan History Page
 *
 * Shows the authenticated user's last 50 scans.
 * Paginated table with thumbnail, classification badge,
 * confidence score, date, and link to full result.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { ScanResult, Classification } from '@/types/scan'

const PAGE_SIZE = 10

const BADGE: Record<Classification, { label: string; classes: string }> = {
  AI_GENERATED: { label: 'AI Generated', classes: 'bg-red-500/20 text-red-400 border-red-500/30' },
  REAL:         { label: 'Real',          classes: 'bg-garby-green/20 text-garby-green border-garby-green/30' },
  UNCERTAIN:    { label: 'Uncertain',     classes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
}

export default function ScanHistoryPage() {
  const { user } = useAuth()

  const [scans, setScans]       = useState<ScanResult[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [page, setPage]         = useState(0)
  const [total, setTotal]       = useState(0)
  const [filter, setFilter]     = useState<Classification | 'ALL'>('ALL')

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Fetch scans ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    fetchScans()
  }, [user, page, filter])

  async function fetchScans() {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('scans')
        .select('id, image_url, classification, confidence, provider, scan_duration_ms, scanned_at, status, signals', { count: 'exact' })
        .eq('user_id', user!.id)
        .eq('status', 'complete')
        .order('scanned_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (filter !== 'ALL') {
        query = query.eq('classification', filter)
      }

      const { data, error: fetchError, count } = await query

      if (fetchError) throw fetchError

      setScans((data as ScanResult[]) ?? [])
      setTotal(count ?? 0)
    } catch (err) {
      setError('Failed to load scan history. Please try again.')
      console.error('[ScanHistory]', err)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pt-28 pb-16 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="section-label mb-2">History</p>
            <h1 className="text-3xl font-bold">Scan History</h1>
            <p className="text-garby-grey text-sm mt-1">
              {total > 0 ? `${total} completed scan${total !== 1 ? 's' : ''}` : 'No scans yet'}
            </p>
          </div>
          <Link to="/scan">
            <Button size="sm">New scan</Button>
          </Link>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['ALL', 'AI_GENERATED', 'REAL', 'UNCERTAIN'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0) }}
              className={`
                text-xs font-semibold px-3 py-1.5 rounded-full border transition-all
                ${filter === f
                  ? 'bg-garby-green text-garby-dark border-garby-green'
                  : 'bg-white/5 text-garby-grey border-white/10 hover:border-garby-green/40 hover:text-white'
                }
              `}
            >
              {f === 'ALL' ? 'All' : f === 'AI_GENERATED' ? 'AI Generated' : f === 'REAL' ? 'Real' : 'Uncertain'}
            </button>
          ))}
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-lg bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/10 rounded w-1/3" />
                  <div className="h-3 bg-white/10 rounded w-1/5" />
                </div>
                <div className="h-6 w-24 bg-white/10 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!loading && scans.length === 0 && (
          <div className="card text-center py-16">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-garby-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <p className="font-semibold text-white mb-1">
              {filter !== 'ALL' ? `No ${filter === 'AI_GENERATED' ? 'AI Generated' : filter.toLowerCase()} scans` : 'No scans yet'}
            </p>
            <p className="text-garby-grey text-sm mb-6">
              {filter !== 'ALL' ? 'Try a different filter.' : 'Upload your first image to get started.'}
            </p>
            {filter === 'ALL' && (
              <Link to="/scan">
                <Button size="sm">Scan your first image</Button>
              </Link>
            )}
          </div>
        )}

        {/* ── Scan list ────────────────────────────────────────────────────── */}
        {!loading && scans.length > 0 && (
          <div className="space-y-2">
            {scans.map(scan => {
              const badge = BADGE[scan.classification] ?? BADGE.UNCERTAIN
              const pct   = Math.round((scan.confidence ?? 0) * 100)

              return (
                <Link
                  key={scan.id}
                  to={`/scan/${scan.id}`}
                  className="card flex items-center gap-4 hover:border-garby-green/30 hover:bg-garby-green/[0.02] transition-all group cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0">
                    {scan.image_url
                      ? <img src={scan.image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-garby-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01"/>
                          </svg>
                        </div>
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.classes}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-mono text-garby-grey">
                        {pct}% confidence
                      </span>
                    </div>
                    <p className="text-xs text-garby-grey truncate">
                      {scan.scanned_at ? formatDate(scan.scanned_at) : '—'}
                      {' · '}
                      {scan.provider ?? 'unknown'}
                      {' · '}
                      {((scan.scan_duration_ms ?? 0) / 1000).toFixed(2)}s
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="w-4 h-4 text-garby-grey group-hover:text-garby-green transition-colors shrink-0"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </Link>
              )
            })}
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
            >
              ← Previous
            </Button>
            <span className="text-xs text-garby-grey">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
            >
              Next →
            </Button>
          </div>
        )}

      </div>
    </div>
  )
}
