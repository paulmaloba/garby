import Navbar from '@/components/Navbar'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-garby-dark text-white">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-garby-green/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-garby-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-garby-green/30 bg-garby-green/10 text-garby-green text-xs font-semibold mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-garby-green animate-pulse" />
            Now in active development · Sprint 1
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-tight mb-6 animate-slide-up">
            Is it real,{' '}
            <span className="text-garby-green">or is it AI?</span>
          </h1>

          <p className="text-lg sm:text-xl text-garby-grey max-w-2xl mx-auto mb-10 animate-slide-up">
            Garby scans any image and tells you instantly — AI-generated or human-made.
            With a confidence score, forensic breakdown, and a one-tap overlay for any app.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up">
            <a href="/register" className="btn-primary text-base px-8 py-4 w-full sm:w-auto">
              Start scanning free
            </a>
            <a href="#how-it-works" className="btn-secondary text-base px-8 py-4 w-full sm:w-auto">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="section-label mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Three steps. Zero guesswork.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Upload an image',
                desc: 'Drag and drop or browse to upload any JPEG, PNG, or WEBP. Up to 10MB.',
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                ),
              },
              {
                step: '02',
                title: 'Garby scans it',
                desc: 'Our detection engine analyses the image for GAN artifacts, diffusion fingerprints, and lighting inconsistencies.',
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                ),
              },
              {
                step: '03',
                title: 'Get your verdict',
                desc: 'Receive a clear AI Generated or Real classification with a confidence score and full signal breakdown.',
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
            ].map(({ step, title, desc, icon }) => (
              <div key={step} className="card-hover relative">
                <div className="absolute top-4 right-4 text-5xl font-bold text-white/5 select-none">
                  {step}
                </div>
                <div className="w-10 h-10 rounded-lg bg-garby-green/20 text-garby-green flex items-center justify-center mb-4">
                  {icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-garby-grey text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Built different.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Garby Lens — Overlay Mode',
                badge: 'Coming in v2',
                desc: 'Like Shazam for visuals. A floating button that sits over any app — Instagram, TikTok, X — so you can scan anything on your screen without leaving.',
                highlight: true,
              },
              {
                title: 'Confidence Score',
                badge: 'Live in MVP',
                desc: 'Every result includes a 0–100% confidence score so you know exactly how certain the detection is.',
              },
              {
                title: 'Forensic Signal Breakdown',
                badge: 'Live in MVP',
                desc: 'See exactly which signals triggered the classification — GAN texture artifacts, diffusion fingerprints, lighting inconsistencies, and more.',
              },
              {
                title: 'Shareable Result Cards',
                badge: 'Live in MVP',
                desc: 'Every scan gets a unique public URL. Share proof of authenticity — or inauthenticity — with one link.',
              },
            ].map(({ title, badge, desc, highlight }) => (
              <div
                key={title}
                className={`card-hover ${highlight ? 'border-garby-green/40 bg-garby-green/5' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{title}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-3 shrink-0 ${
                    badge.includes('MVP')
                      ? 'bg-garby-green/20 text-garby-green'
                      : 'bg-garby-accent/40 text-blue-300'
                  }`}>
                    {badge}
                  </span>
                </div>
                <p className="text-garby-grey text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Start free. Scale when you're ready.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Free',
                price: '$0',
                period: 'forever',
                features: ['20 scans / month', 'Web app access', 'Basic classification', 'Confidence score'],
                cta: 'Get started',
                highlight: false,
              },
              {
                name: 'Pro',
                price: '$9.99',
                period: 'per month',
                features: ['Unlimited scans', 'Detailed forensic report', 'Scan history & export', 'Priority processing', 'Mobile app access'],
                cta: 'Start Pro',
                highlight: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: 'contact us',
                features: ['Team accounts', 'API access', 'Custom model fine-tuning', 'SLA guarantee', 'Dedicated support'],
                cta: 'Contact us',
                highlight: false,
              },
            ].map(({ name, price, period, features, cta, highlight }) => (
              <div
                key={name}
                className={`card flex flex-col ${
                  highlight
                    ? 'border-garby-green bg-garby-green/5 relative'
                    : 'border-white/10'
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-garby-green text-garby-dark text-xs font-bold px-3 py-1 rounded-full">
                      Most popular
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <p className="text-garby-grey text-sm font-medium mb-1">{name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{price}</span>
                    <span className="text-garby-grey text-sm">/ {period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-garby-grey">
                      <svg className="w-4 h-4 text-garby-green shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="/register"
                  className={highlight ? 'btn-primary text-center text-sm' : 'btn-secondary text-center text-sm'}
                >
                  {cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
              <path d="M28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 9.373 9.373 4 16 4"
                stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="4" y1="16" x2="24" y2="16" stroke="#2ECC71" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="24" cy="16" r="2" fill="#2ECC71"/>
            </svg>
            <span className="text-sm font-semibold text-white">Garby</span>
            <span className="text-garby-grey text-sm ml-2">© 2026 All rights reserved.</span>
          </div>
          <p className="text-garby-grey text-xs text-center">
            Drawing a definitive line between content born from a human heart and content generated by bits.
          </p>
        </div>
      </footer>
    </div>
  )
}
