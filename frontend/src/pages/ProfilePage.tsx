/**
 * ProfilePage.tsx
 * Task: T-010 — User Profile Page
 *
 * Displays:
 * - Display name (editable)
 * - Email address
 * - Account tier (Free / Pro / Enterprise) with upgrade CTA
 * - Total scans used this month + monthly limit
 * - Member since date
 * - Sign out button
 * - Danger zone — delete account (placeholder for later)
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

const TIER_LABELS: Record<string, { label: string; colour: string; limit: string }> = {
  guest:      { label: 'Guest',      colour: 'text-garby-grey',   limit: '3 scans total' },
  free:       { label: 'Free',       colour: 'text-white',        limit: '20 scans / month' },
  pro:        { label: 'Pro',        colour: 'text-garby-green',  limit: 'Unlimited scans' },
  enterprise: { label: 'Enterprise', colour: 'text-yellow-400',   limit: 'Unlimited scans' },
}

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [nameError, setNameError]     = useState('')
  const [nameSaving, setNameSaving]   = useState(false)
  const [nameSaved, setNameSaved]     = useState(false)

  const tier = TIER_LABELS[profile?.tier ?? 'free']

  // ── Update display name ────────────────────────────────────────────────────

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) { setNameError('Name cannot be empty'); return }
    if (displayName.trim().length < 2) { setNameError('Name must be at least 2 characters'); return }
    setNameError('')
    setNameSaving(true)

    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() })
      .eq('id', user!.id)

    setNameSaving(false)

    if (error) {
      setNameError('Failed to save. Please try again.')
      return
    }

    await refreshProfile()
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 3000)
  }

  // ── Sign out ───────────────────────────────────────────────────────────────

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  const scanPercentage = profile?.tier === 'free'
    ? Math.min(100, ((profile.scans_used_this_month ?? 0) / 20) * 100)
    : 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 pt-28 pb-16 space-y-6">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div>
          <p className="section-label mb-2">Account</p>
          <h1 className="text-3xl font-bold">Your profile</h1>
        </div>

        {/* ── Identity card ────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-4 mb-6">
            {/* Avatar — initials based */}
            <div className="w-14 h-14 rounded-full bg-garby-green/20 border border-garby-green/30 flex items-center justify-center shrink-0">
              <span className="text-garby-green font-bold text-xl">
                {(profile?.display_name ?? profile?.email ?? 'G')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-semibold text-lg leading-tight">
                {profile?.display_name ?? 'Garby User'}
              </p>
              <p className="text-garby-grey text-sm">{profile?.email}</p>
              <span className={`text-xs font-semibold mt-0.5 inline-block ${tier.colour}`}>
                {tier.label} plan
              </span>
            </div>
          </div>

          {/* Edit display name */}
          <form onSubmit={handleSaveName} className="space-y-4">
            <Input
              label="Display name"
              type="text"
              value={displayName}
              onChange={e => {
                setDisplayName(e.target.value)
                if (nameError) setNameError('')
                if (nameSaved) setNameSaved(false)
              }}
              error={nameError}
              placeholder="Your name"
              autoComplete="name"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" loading={nameSaving} size="sm">
                Save name
              </Button>
              {nameSaved && (
                <span className="text-xs text-garby-green flex items-center gap-1 animate-fade-in">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </form>

          <div className="border-t border-white/10 mt-6 pt-5">
            <p className="text-xs text-garby-grey uppercase tracking-wider mb-2">Email address</p>
            <p className="text-sm text-white">{profile?.email}</p>
            <p className="text-xs text-garby-grey mt-1">
              To change your email, contact support.
            </p>
          </div>

          {profile?.created_at && (
            <div className="border-t border-white/10 mt-5 pt-5">
              <p className="text-xs text-garby-grey uppercase tracking-wider mb-1">Member since</p>
              <p className="text-sm text-white">{formatDate(profile.created_at)}</p>
            </div>
          )}
        </div>

        {/* ── Usage card ───────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-semibold text-lg mb-0.5">Scan usage</h2>
              <p className="text-garby-grey text-sm">{tier.limit}</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              profile?.tier === 'pro' || profile?.tier === 'enterprise'
                ? 'bg-garby-green/20 text-garby-green border-garby-green/30'
                : 'bg-white/5 text-garby-grey border-white/10'
            }`}>
              {tier.label.toUpperCase()}
            </span>
          </div>

          {profile?.tier === 'free' && (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-garby-grey">Scans used this month</span>
                <span className="font-semibold text-white">
                  {profile.scans_used_this_month} <span className="text-garby-grey font-normal">/ 20</span>
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    scanPercentage >= 90 ? 'bg-red-500' :
                    scanPercentage >= 70 ? 'bg-yellow-500' : 'bg-garby-green'
                  }`}
                  style={{ width: `${scanPercentage}%` }}
                />
              </div>
              {scanPercentage >= 80 && (
                <p className="text-xs text-yellow-400 mb-4">
                  You're approaching your monthly limit. Upgrade for unlimited scans.
                </p>
              )}
              <Button variant="primary" size="sm">
                Upgrade to Pro — $9.99/mo
              </Button>
            </>
          )}

          {(profile?.tier === 'pro' || profile?.tier === 'enterprise') && (
            <div className="flex items-center gap-2 text-sm text-garby-grey">
              <svg className="w-4 h-4 text-garby-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              {profile.scans_used_this_month} scans run this month — no limit
            </div>
          )}
        </div>

        {/* ── Plan features ─────────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="font-semibold mb-4">Your plan includes</h2>
          <div className="space-y-2.5">
            {getPlanFeatures(profile?.tier ?? 'free').map(({ feature, included }) => (
              <div key={feature} className="flex items-center gap-2.5 text-sm">
                {included
                  ? <svg className="w-4 h-4 text-garby-green shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                  : <svg className="w-4 h-4 text-garby-grey shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                }
                <span className={included ? 'text-white' : 'text-garby-grey line-through'}>
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Account actions ───────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="font-semibold mb-4">Account actions</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => alert('Account deletion coming in a future sprint.')}
            >
              Delete account
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPlanFeatures(tier: string) {
  const all = [
    { feature: '20 scans per month',       tiers: ['free', 'pro', 'enterprise'] },
    { feature: 'Unlimited scans',          tiers: ['pro', 'enterprise'] },
    { feature: 'Basic classification',     tiers: ['free', 'pro', 'enterprise'] },
    { feature: 'Confidence score',         tiers: ['free', 'pro', 'enterprise'] },
    { feature: 'Detailed forensic report', tiers: ['pro', 'enterprise'] },
    { feature: 'Scan history & export',    tiers: ['pro', 'enterprise'] },
    { feature: 'Priority processing',      tiers: ['pro', 'enterprise'] },
    { feature: 'Mobile app access',        tiers: ['pro', 'enterprise'] },
    { feature: 'API access',               tiers: ['enterprise'] },
    { feature: 'Dedicated support',        tiers: ['enterprise'] },
  ]
  return all.map(({ feature, tiers }) => ({
    feature,
    included: tiers.includes(tier),
  }))
}
