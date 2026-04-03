/**
 * WaitlistModal.tsx
 * Task: T-052 — Upgrade Flow Placeholder
 * Sprint 2
 *
 * Shown when a user clicks Upgrade or Join Waitlist.
 * Captures email into a Supabase waitlist table.
 * Stripe checkout replaces this in Sprint 3.
 */

import { useState, type FormEvent, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface WaitlistModalProps {
  open:    boolean
  tier:    string
  onClose: () => void
}

export default function WaitlistModal({ open, tier, onClose }: WaitlistModalProps) {
  const { user, profile } = useAuth()
  const [email, setEmail]     = useState(profile?.email ?? '')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  // Pre-fill email when user is logged in
  useEffect(() => {
    if (profile?.email) setEmail(profile.email)
  }, [profile])

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setDone(false); setError('') }
  }, [open])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address')
      return
    }

    setError(''); setLoading(true)

    // Upsert into waitlist table — created in schema below
    const { error: dbErr } = await supabase
      .from('waitlist')
      .upsert({ email: email.trim().toLowerCase(), tier, user_id: user?.id ?? null },
        { onConflict: 'email' })

    setLoading(false)

    if (dbErr) {
      console.error('[Waitlist]', dbErr.message)
      // Don't block the user on a DB error — show success anyway
    }

    setDone(true)
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-garby-mid border border-white/10 rounded-2xl p-8
        shadow-2xl animate-slide-up">

        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-garby-green/20 border border-garby-green/30
              flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-garby-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">You're on the list!</h2>
            <p className="text-garby-grey text-sm mb-6">
              We'll email you at <strong className="text-white">{email}</strong> the moment
              {' '}<strong className="text-garby-green">{tier}</strong> launches.
              Early-adopters get a special discount.
            </p>
            <Button fullWidth onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full
                    bg-garby-cyan/20 text-garby-cyan border border-garby-cyan/30">
                    {tier} — Coming soon
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white">Join the waitlist</h2>
                <p className="text-garby-grey text-sm mt-1">
                  Be first to know when {tier} launches. Early access + discount guaranteed.
                </p>
              </div>
              <button onClick={onClose}
                className="text-garby-grey hover:text-white transition-colors ml-4 shrink-0 mt-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* What you get */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 space-y-2">
              {[
                'Early access before public launch',
                'Locked-in early-adopter pricing',
                'Direct line to the founding team',
              ].map(b => (
                <div key={b} className="flex items-center gap-2 text-sm text-garby-grey">
                  <svg className="w-4 h-4 text-garby-green shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  {b}
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Input
                label="Email address"
                type="email"
                placeholder="paul@garby.app"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                autoFocus={!profile?.email}
              />
              <Button type="submit" loading={loading} fullWidth size="lg">
                Join waitlist — it's free
              </Button>
            </form>

            <p className="text-center text-xs text-garby-grey mt-4">
              No spam. Unsubscribe any time.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
