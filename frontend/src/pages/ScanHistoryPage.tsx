/**
 * ScanHistoryPage.tsx — Sprint 2
 * Shows authenticated user's full scan history with pagination.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { ScanResult } from '@/types/scan'

function normalise(cls: string): 'AI_GENERATED' | 'REAL' | 'UNCERTAIN' {
  const u = String(cls ?? '').toUpperCase().replace(/-/g, '_').replace(/ /g, '_')
  if (u.includes('AI') || u.includes('GENERATED')) return 'AI_GENERATED'
  if (u === 'REAL' || u.includes('LIKELY_REAL'))   return 'REAL'
  return 'UNCERTAIN'
}

const CLASS_STYLE = {
  AI_GENERATED: { label: 'AI Generated', colour: 'text-red-400',    dot: 'bg-red-500'    },
  REAL:         { label: 'Real',          colour: 'text-garby-green', dot: 'bg-garby-green' },
  UNCERTAIN:    { label: 'Uncertain',     colour: 'text-yellow-400', dot: 'bg-yellow-500' },
}

function providerShort(p: string): string {
  const s = (p ?? '').toLowerCase()
  if (s.includes('garby') && s.includes('sightengine')) return 'Garby+SE'
  if (s.includes('garby'))  return 'Garby'
  if (s.includes('sight'))  return 'Sightengine'
  return p ?? '—'
}

export default function ScanHistoryPage() {
  const { user } = useAuth()
  const [scans,   setScans]   = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)
  const LIMIT = 20

  useEffect(() => {
    if (!user) return
    loadHistory(page)
  }, [user, page])

  async function loadHistory(p: number) {
    setLoading(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) return

      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const res    = await fetch(
        `${apiUrl}/api/scan/history?page=${p}&limit=${LIMIT}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = await res.json()
      if (json.success) {
        setScans(json.data)
        setTotal(json.pagination?.total ?? 0)
      }
    } catch (err) {
      console.error('[History]', err)
    } finally {
      setLoading(false)
    }
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-28 pb-16">

        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="section-label mb-2">History</p>
            <h1 className="text-2xl font-bold">Scan History</h1>
            <p className="text-garby-grey text-sm mt-1">{total} scan{total !== 1 ? 's' : ''} total</p>
          </div>
          <Link to="/scan"><Button size="sm">New scan</Button></Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg viewBox="0 0 64 64" fill="none" className="w-8 h-8 animate-spin">
              <path d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
                stroke="#2ECC71" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          </div>
        ) : scans.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-garby-grey mb-4">No scans yet.</p>
            <Link to="/scan"><Button>Scan your first image</Button></Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-garby-mid text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-garby-grey uppercase tracking-wider">Media</th>
                    <th className="px-4 py-3 text-xs font-semibold text-garby-grey uppercase tracking-wider">Result</th>
                    <th className="px-4 py-3 text-xs font-semibold text-garby-grey uppercase tracking-wider">Confidence</th>
                    <th className="px-4 py-3 text-xs font-semibold text-garby-grey uppercase tracking-wider">Provider</th>
                    <th className="px-4 py-3 text-xs font-semibold text-garby-grey uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {scans.map(scan => {
                    const cls     = normalise(scan.classification)
                    const style   = CLASS_STYLE[cls]
                    const dateStr = scan.scanned_at
                      ? new Date(scan.scanned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'
                    const pct = Math.round((scan.confidence ?? 0) * 100)
                    return (
                      <tr key={scan.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 bg-white/5">
                            {scan.media_type === 'video'
                              ? <div className="w-full h-full flex items-center justify-center text-garby-grey text-xs">▶</div>
                              : <img src={scan.image_url} alt="" className="w-full h-full object-cover"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${style.dot}`}/>
                            <span className={`text-sm font-semibold ${style.colour}`}>{style.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-garby-grey font-mono">{pct}%</td>
                        <td className="px-4 py-3 text-xs text-garby-grey">{providerShort(scan.provider)}</td>
                        <td className="px-4 py-3 text-xs text-garby-grey">{dateStr}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/scan/${scan.id}`}
                            className="text-xs text-garby-green hover:underline">
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {scans.map(scan => {
                const cls   = normalise(scan.classification)
                const style = CLASS_STYLE[cls]
                const pct   = Math.round((scan.confidence ?? 0) * 100)
                return (
                  <Link key={scan.id} to={`/scan/${scan.id}`}
                    className="card flex items-center gap-4 hover:border-white/20 transition-colors">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0">
                      <img src={scan.image_url} alt="" className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`}/>
                        <span className={`text-sm font-semibold ${style.colour}`}>{style.label}</span>
                        <span className="text-xs text-garby-grey ml-auto">{pct}%</span>
                      </div>
                      <p className="text-xs text-garby-grey mt-1">
                        {scan.scanned_at ? new Date(scan.scanned_at).toLocaleDateString() : '—'}
                        {' · '}{providerShort(scan.provider)}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <Button variant="secondary" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}>
                  ← Previous
                </Button>
                <span className="text-sm text-garby-grey">
                  Page {page} of {pages}
                </span>
                <Button variant="secondary" size="sm"
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page === pages}>
                  Next →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
