import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-garby-dark/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            {/* Garby icon mark */}
            <div className="relative w-8 h-8">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                <path
                  d="M28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 9.373 9.373 4 16 4"
                  stroke="#f0f0f0"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <line x1="4" y1="16" x2="24" y2="16" stroke="#2ECC71" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="24" cy="16" r="2" fill="#2ECC71"/>
              </svg>
            </div>
            <span className="font-bold text-lg text-white tracking-tight group-hover:text-garby-green transition-colors">
              Garby
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm text-garby-grey hover:text-white transition-colors">
              How it works
            </a>
            <a href="#features" className="text-sm text-garby-grey hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-garby-grey hover:text-white transition-colors">
              Pricing
            </a>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm text-garby-grey hover:text-white transition-colors">
              Sign in
            </Link>
            <Link to="/register" className="btn-primary text-sm py-2 px-4">
              Get started free
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-garby-grey hover:text-white transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/10 py-4 space-y-3 animate-fade-in">
            <a href="#how-it-works" className="block text-sm text-garby-grey hover:text-white py-2">How it works</a>
            <a href="#features" className="block text-sm text-garby-grey hover:text-white py-2">Features</a>
            <a href="#pricing" className="block text-sm text-garby-grey hover:text-white py-2">Pricing</a>
            <div className="pt-2 flex flex-col gap-2">
              <Link to="/login" className="btn-secondary text-sm py-2">Sign in</Link>
              <Link to="/register" className="btn-primary text-sm py-2">Get started free</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
