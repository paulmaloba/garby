/**
 * PricingPage.tsx
 * Task: T-051 — Pricing Page
 * Sprint 2
 *
 * Public pricing page at /pricing.
 * Upgrade CTAs open a waitlist modal (T-052).
 * Stripe integration wired in Sprint 3.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import Button from '@/components/ui/Button'
import WaitlistModal from '@/components/WaitlistModal'

const TIERS = [
  {
    name:      'Free',
    price:     '$0',
    period:    'forever',
    desc:      'For individuals who want to verify content occasionally.',
    highlight: false,
    cta:       'Get started',
    ctaLink:   '/register',
    features: [
      { text: '20 scans per month',         included: true  },
      { text: 'Image scanning',             included: true  },
      { text: 'Video scanning (Beta)',       included: true  },
      { text: 'Confidence score',           included: true  },
      { text: 'Garby Stamp download',       included: true  },
      { text: 'Shareable result links',     included: true  },
      { text: 'Detailed forensic report',   included: false },
      { text: 'Scan history & export',      included: false },
      { text: 'Priority processing',        included: false },
      { text: 'API access',                 included: false },
    ],
  },
  {
    name:      'Pro',
    price:     '$9.99',
    period:    'per month',
    desc:      'For creators, journalists, and researchers who need unlimited access.',
    highlight: true,
    cta:       'Join waitlist',
    ctaLink:   null,
    features: [
      { text: 'Unlimited scans',            included: true },
      { text: 'Image scanning',             included: true },
      { text: 'Video scanning (Beta)',       included: true },
      { text: 'Confidence score',           included: true },
      { text: 'Garby Stamp download',       included: true },
      { text: 'Shareable result links',     included: true },
      { text: 'Detailed forensic report',   included: true },
      { text: 'Scan history & export',      included: true },
      { text: 'Priority processing',        included: true },
      { text: 'API access',                 included: false },
    ],
  },
  {
    name:      'Enterprise',
    price:     'Custom',
    period:    'contact us',
    desc:      'For teams and platforms that need API access and custom SLAs.',
    highlight: false,
    cta:       'Contact us',
    ctaLink:   null,
    features: [
      { text: 'Unlimited scans',            included: true },
      { text: 'Image scanning',             included: true },
      { text: 'Video scanning (Beta)',       included: true },
      { text: 'Confidence score',           included: true },
      { text: 'Garby Stamp download',       included: true },
      { text: 'Shareable result links',     included: true },
      { text: 'Detailed forensic report',   included: true },
      { text: 'Scan history & export',      included: true },
      { text: 'Priority processing',        included: true },
      { text: 'API access',                 included: true },
    ],
  },
]

export default function PricingPage() {
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const [waitlistTier, setWaitlistTier] = useState('Pro')

  function handleCta(tier: typeof TIERS[0]) {
    if (tier.ctaLink) return   // navigate via Link
    setWaitlistTier(tier.name)
    setWaitlistOpen(true)
  }

  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 pt-28 pb-16">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="section-label mb-3">Pricing</p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Start free. Scale when ready.
          </h1>
          <p className="text-garby-grey text-lg max-w-xl mx-auto">
            Every plan includes image and video scanning.
            No credit card required to get started.
          </p>

          {/* Pro launch banner */}
          <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-full
            bg-garby-cyan/10 border border-garby-cyan/30 text-garby-cyan text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-garby-cyan animate-pulse"/>
            Pro &amp; Enterprise launching soon — join the waitlist
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {TIERS.map(tier => (
            <div key={tier.name} className={`
              relative flex flex-col rounded-2xl border p-7 transition-all
              ${tier.highlight
                ? 'border-garby-green bg-garby-green/5 shadow-lg shadow-garby-green/10'
                : 'border-white/10 bg-garby-mid'
              }
            `}>
              {tier.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-garby-green text-garby-dark text-xs font-bold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p className="text-garby-grey text-sm font-medium mb-1">{tier.name}</p>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-garby-grey text-sm">/ {tier.period}</span>
                </div>
                <p className="text-garby-grey text-sm leading-relaxed">{tier.desc}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {tier.features.map(f => (
                  <li key={f.text} className="flex items-center gap-2.5 text-sm">
                    {f.included
                      ? <svg className="w-4 h-4 text-garby-green shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      : <svg className="w-4 h-4 text-white/20 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                        </svg>
                    }
                    <span className={f.included ? 'text-white' : 'text-white/30 line-through'}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {tier.ctaLink ? (
                <Link to={tier.ctaLink}>
                  <Button
                    fullWidth
                    variant={tier.highlight ? 'primary' : 'secondary'}
                  >
                    {tier.cta}
                  </Button>
                </Link>
              ) : (
                <Button
                  fullWidth
                  variant={tier.highlight ? 'primary' : 'secondary'}
                  onClick={() => handleCta(tier)}
                >
                  {tier.cta}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Common questions</h2>
          <div className="space-y-4">
            {[
              {
                q: 'When will Pro and Enterprise launch?',
                a: 'We\'re putting the finishing touches on payment processing. Join the waitlist to be first to know and get an early-adopter discount.',
              },
              {
                q: 'How does video scanning work?',
                a: 'Garby extracts evenly-spaced frames from your video and analyses each one for AI generation indicators. The overall classification is based on the proportion of AI-flagged frames.',
              },
              {
                q: 'What happens when I hit the free scan limit?',
                a: 'Your limit resets at the start of each calendar month. You can upgrade to Pro at any time for unlimited scans.',
              },
              {
                q: 'Can I use the API to scan images in my own app?',
                a: 'API access is available on the Enterprise plan. Reach out via the contact form and we\'ll set you up.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group card cursor-pointer">
                <summary className="flex items-center justify-between font-semibold text-white list-none">
                  {q}
                  <svg className="w-4 h-4 text-garby-grey group-open:rotate-180 transition-transform shrink-0 ml-4"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </summary>
                <p className="mt-3 text-garby-grey text-sm leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      <WaitlistModal
        open={waitlistOpen}
        tier={waitlistTier}
        onClose={() => setWaitlistOpen(false)}
      />
    </div>
  )
}
