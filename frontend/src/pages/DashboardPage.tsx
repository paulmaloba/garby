/**
 * DashboardPage.tsx
 * Updated for T-025 — pulls real scan stats from Supabase
 * and links through to ScanHistoryPage.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { ScanResult, Classification } from '@/types/scan'

interface Stats {
  total:       number
  aiGenerated: number
  real:        number
  uncertain:   number
}

const BADGE_CLASSES: Record<Classification, string> = {
  AI_GENERATED: 'bg-red-500/20 text-red-400 border-red-500/30',
  REAL:         'bg-garby-green/20 text-garby-green border-garby-green/30',
  UNCERTAIN:    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

const BADGE_LABELS: Record<Classification, string> = {
  AI_GENERATED: 'AI Generated',
  REAL:         'Real',
  UNCERTAIN:    'Uncertain',
}

export default function DashboardPage() {
  const { user, profile, signOut } = useAuth()

  const [stats, setStats]   = useState<Stats | null>(null)
  const [recent, setRecent] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadDashboard()
  }, [user])

  async function loadDashboard() {
    setLoading(true)

    const [statsRes, recentRes] = await Promise.all([
      supabase
        .from('scans')
        .select('classification')
        .eq('user_id', user!.id)
        .eq('status', 'complete'),
      supabase
        .from('scans')
        .select('id, image_url, classification, confidence, provider, scanned_at, scan_duration_ms')
        .eq('user_id', user!.id)
        .eq('status', 'complete')
        .order('scanned_at', { ascending: false })
        .limit(5),
    ])

    if (statsRes.data) {
      const d = statsRes.data
      setStats({
        total:       d.length,
        aiGenerated: d.filter(s => s.classification === 'AI_GENERATED').length,
        real:        d.filter(s => s.classification === 'REAL').length,
        uncertain:   d.filter(s => s.classification === 'UNCERTAIN').length,
      })
    }

    if (recentRes.data) setRecent(recentRes.data as ScanResult[])
    setLoading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const scanPct = profile?.tier === 'free'
    ? Math.min(100, ((profile.scans_used_this_month ?? 0) / 20) * 100)
    : 0

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pt-28 pb-16 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="section-label mb-2">Dashboard</p>
            <h1 className="text-3xl font-bold">
              Welcome{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}.
            </h1>
            <p className="text-garby-grey text-sm mt-1">
              {profile?.tier === 'free'
                ? `${profile.scans_used_this_month ?? 0} / 20 scans used this month`
                : 'Unlimited scans'}
            </p>
          </div>
          <Link to="/scan"><Button size="lg">Scan an image</Button></Link>
        </div>

        {/* Free tier bar */}
        {profile?.tier === 'free' && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Monthly scans</span>
              <span className="text-sm font-mono text-garby-green">
                {profile.scans_used_this_month ?? 0} / 20
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  scanPct >= 90 ? 'bg-red-500' : scanPct >= 70 ? 'bg-yellow-500' : 'bg-garby-green'
                }`}
                style={{ width: `${scanPct}%` }}
              />
            </div>
            {scanPct >= 80 && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-yellow-400">Approaching monthly limit</p>
                <Button size="sm" variant="secondary">Upgrade to Pro</Button>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total scans', value: stats?.total,       colour: 'text-white' },
            { label: 'AI detected', value: stats?.aiGenerated, colour: 'text-red-400' },
            { label: 'Real',        value: stats?.real,        colour: 'text-garby-green' },
            { label: 'Uncertain',   value: stats?.uncertain,   colour: 'text-yellow-400' },
          ].map(({ label, value, colour }) => (
            <div key={label} className={`card ${loading ? 'animate-pulse' : ''}`}>
              <p className="text-garby-grey text-xs uppercase tracking-wider mb-2">{label}</p>
              <p className={`text-3xl font-bold ${colour}`}>
                {loading ? '—' : (value ?? 0)}
              </p>
            </div>
          ))}
        </div>

        {/* Recent scans */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-lg">Recent scans</h2>
            {recent.length > 0 && (
              <Link to="/history" className="text-xs text-garby-green hover:underline font-medium">
                View all →
              </Link>
            )}
          </div>

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/10 rounded w-1/4" />
                    <div className="h-3 bg-white/10 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && recent.length === 0 && (
            <div className="text-center py-10">
              <svg className="w-10 h-10 mx-auto mb-3 text-garby-grey opacity-40"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <p className="text-garby-grey text-sm">No scans yet.</p>
            </div>
          )}

          {!loading && recent.length > 0 && (
            <div className="space-y-1">
              {recent.map(scan => {
                const badge = BADGE_CLASSES[scan.classification] ?? BADGE_CLASSES.UNCERTAIN
                const label = BADGE_LABELS[scan.classification] ?? 'Unknown'
                const pct   = Math.round((scan.confidence ?? 0) * 100)
                return (
                  <Link key={scan.id} to={`/scan/${scan.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group">
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0">
                      {scan.image_url
                        ? <img src={scan.image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-white/10" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge}`}>
                          {label}
                        </span>
                        <span className="text-xs font-mono text-garby-grey">{pct}%</span>
                      </div>
                      <p className="text-xs text-garby-grey">
                        {scan.scanned_at ? formatDate(scan.scanned_at) : '—'}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-garby-grey group-hover:text-garby-green transition-colors shrink-0"
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
          <Link to="/history" className="card-hover flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-garby-green/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p className="font-medium text-sm">Full scan history</p>
              <p className="text-garby-grey text-xs">All {stats?.total ?? 0} scans with filters</p>
            </div>
          </Link>
          <Link to="/profile" className="card-hover flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-garby-accent/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div>
              <p className="font-medium text-sm">Your profile</p>
              <p className="text-garby-grey text-xs capitalize">{profile?.tier ?? 'free'} plan · manage account</p>
            </div>
          </Link>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>

      </div>
    </div>
  )
}
