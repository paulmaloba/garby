/**
 * DashboardPage.tsx — Sprint 2
 * User dashboard — recent scans, quick stats, quick scan CTA.
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
  AI_GENERATED: { label: 'AI Generated', colour: 'text-red-400',    dot: 'bg-red-500',     badge: 'bg-red-500/20 border-red-500/30'    },
  REAL:         { label: 'Real',          colour: 'text-garby-green', dot: 'bg-garby-green', badge: 'bg-garby-green/20 border-garby-green/30' },
  UNCERTAIN:    { label: 'Uncertain',     colour: 'text-yellow-400', dot: 'bg-yellow-500',  badge: 'bg-yellow-500/20 border-yellow-500/30' },
}

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const [recentScans, setRecentScans] = useState<ScanResult[]>([])
  const [stats, setStats]             = useState({ total: 0, ai: 0, real: 0 })
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!user) return
    loadDashboard()
  }, [user])

  async function loadDashboard() {
    setLoading(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) return

      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const res    = await fetch(`${apiUrl}/api/scan/history?page=1&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } })
      const json   = await res.json()

      if (json.success) {
        const scans: ScanResult[] = json.data
        setRecentScans(scans)
        const total = json.pagination?.total ?? scans.length
        const ai    = scans.filter(s => normalise(s.classification) === 'AI_GENERATED').length
        const real  = scans.filter(s => normalise(s.classification) === 'REAL').length
        setStats({ total, ai, real })
      }
    } catch (err) {
      console.error('[Dashboard]', err)
    } finally {
      setLoading(false)
    }
  }

  const name = profile?.display_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-28 pb-16 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label mb-2">Dashboard</p>
            <h1 className="text-2xl font-bold">Welcome back, {name}</h1>
            <p className="text-garby-grey text-sm mt-1">Here's your detection activity.</p>
          </div>
          <Link to="/scan"><Button>New scan</Button></Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total scans',  value: stats.total, colour: 'text-white'        },
            { label: 'AI detected',  value: stats.ai,    colour: 'text-red-400'       },
            { label: 'Real content', value: stats.real,  colour: 'text-garby-green'   },
          ].map(({ label, value, colour }) => (
            <div key={label} className="card text-center">
              <p className={`text-3xl font-bold font-mono ${colour}`}>{loading ? '—' : value}</p>
              <p className="text-garby-grey text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Recent scans */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent scans</h2>
            <Link to="/history" className="text-xs text-garby-green hover:underline">View all →</Link>
          </div>

          {loading ? (
            <div className="card flex items-center justify-center py-12">
              <svg viewBox="0 0 64 64" fill="none" className="w-7 h-7 animate-spin">
                <path d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
                  stroke="#2ECC71" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            </div>
          ) : recentScans.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-garby-grey mb-4 text-sm">No scans yet. Scan your first image to get started.</p>
              <Link to="/scan"><Button size="sm">Scan an image</Button></Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentScans.map(scan => {
                const cls   = normalise(scan.classification)
                const style = CLASS_STYLE[cls]
                const pct   = Math.round((scan.confidence ?? 0) * 100)
                const date  = scan.scanned_at
                  ? new Date(scan.scanned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : '—'

                return (
                  <Link key={scan.id} to={`/scan/${scan.id}`}
                    className="flex items-center gap-4 p-4 rounded-xl border border-white/10 
                               hover:border-white/20 transition-colors bg-garby-mid group">
                    
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-white/5">
                      {scan.media_type === 'video'
                        ? <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-garby-grey" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        : <img src={scan.image_url} alt="" className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full 
                          text-xs font-semibold border ${style.badge} ${style.colour}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`}/>
                          {style.label}
                        </span>
                        <span className="text-xs text-garby-grey font-mono">{pct}%</span>
                        {scan.media_type === 'video' && (
                          <span className="text-xs text-garby-cyan border border-garby-cyan/30 px-1.5 py-0.5 rounded">VIDEO</span>
                        )}
                      </div>
                      <p className="text-xs text-garby-grey truncate">{date}</p>
                    </div>

                    <svg className="w-4 h-4 text-garby-grey group-hover:text-white transition-colors shrink-0"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: 'View all scans', desc: 'Full history with filters', to: '/history', icon: '📋' },
            { label: 'Pricing', desc: 'Upgrade to Pro for unlimited scans', to: '/pricing', icon: '⚡' },
          ].map(({ label, desc, to, icon }) => (
            <Link key={to} to={to} className="card hover:border-white/20 transition-colors flex items-center gap-4">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="font-semibold text-white text-sm">{label}</p>
                <p className="text-garby-grey text-xs mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
