/**
 * Navbar.tsx — T-027 UI Polish
 * Active route highlighting, smoother mobile menu, auth-aware CTA.
 */

import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm transition-colors duration-200 ${
      isActive ? 'text-white font-medium' : 'text-garby-grey hover:text-white'
    }`

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/8 glass">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* ── Logo ──────────────────────────────────────────────────────── */}
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
              <path
                d="M28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 9.373 9.373 4 16 4"
                stroke="#F0F2FF" strokeWidth="2.5" strokeLinecap="round"
              />
              <line x1="4" y1="16" x2="24" y2="16"
                stroke="#2ECC71" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="24" cy="16" r="2" fill="#2ECC71"/>
            </svg>
            <span className="font-bold text-white group-hover:text-garby-green transition-colors tracking-tight">
              Garby
            </span>
            <span className="hidden sm:block text-xs font-semibold text-garby-grey border border-white/10 px-1.5 py-0.5 rounded">
              BETA
            </span>
          </Link>

          {/* ── Desktop nav links ─────────────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-6">
            {user ? (
              <>
                <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
                <NavLink to="/scan"      className={navLinkClass}>Scan</NavLink>
                <NavLink to="/history"   className={navLinkClass}>History</NavLink>
              </>
            ) : (
              <>
                <a href="#how-it-works" className="text-sm text-garby-grey hover:text-white transition-colors">How it works</a>
                <a href="#features"     className="text-sm text-garby-grey hover:text-white transition-colors">Features</a>
                <NavLink to="/pricing"  className={navLinkClass}>Pricing</NavLink>
              </>
            )}
          </div>

          {/* ── Desktop CTA ───────────────────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <NavLink
                  to="/profile"
                  className="flex items-center gap-2 text-sm text-garby-grey hover:text-white transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-garby-green/20 border border-garby-green/30 flex items-center justify-center">
                    <span className="text-garby-green font-bold text-xs">
                      {(profile?.display_name ?? profile?.email ?? 'G')[0].toUpperCase()}
                    </span>
                  </div>
                  <span>{profile?.display_name?.split(' ')[0] ?? 'Profile'}</span>
                </NavLink>
                <Link to="/scan" className="btn-primary text-sm py-2 px-4">
                  New scan
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm text-garby-grey hover:text-white transition-colors">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary text-sm py-2 px-4">
                  Get started free
                </Link>
              </>
            )}
          </div>

          {/* ── Mobile menu toggle ────────────────────────────────────────── */}
          <button
            className="md:hidden text-garby-grey hover:text-white transition-colors p-1"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
              }
            </svg>
          </button>
        </div>

        {/* ── Mobile menu ───────────────────────────────────────────────────── */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/8 py-4 space-y-1 animate-fade-in">
            {user ? (
              <>
                <MobileLink to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileLink>
                <MobileLink to="/scan"      onClick={() => setMenuOpen(false)}>Scan image</MobileLink>
                <MobileLink to="/history"   onClick={() => setMenuOpen(false)}>Scan history</MobileLink>
                <MobileLink to="/profile"   onClick={() => setMenuOpen(false)}>Profile</MobileLink>
                <div className="pt-3 border-t border-white/8 mt-3">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left text-sm text-garby-grey hover:text-white transition-colors py-2 px-2"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <a href="#how-it-works" onClick={() => setMenuOpen(false)}
                  className="block text-sm text-garby-grey hover:text-white py-2 px-2 transition-colors">
                  How it works
                </a>
                <a href="#features" onClick={() => setMenuOpen(false)}
                  className="block text-sm text-garby-grey hover:text-white py-2 px-2 transition-colors">
                  Features
                </a>
                <a href="#pricing" onClick={() => setMenuOpen(false)}
                  className="block text-sm text-garby-grey hover:text-white py-2 px-2 transition-colors">
                  Pricing
                </a>
                <div className="pt-3 flex flex-col gap-2 border-t border-white/8 mt-3">
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-secondary text-sm py-2.5">
                    Sign in
                  </Link>
                  <Link to="/register" onClick={() => setMenuOpen(false)} className="btn-primary text-sm py-2.5">
                    Get started free
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

function MobileLink({ to, onClick, children }: {
  to: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `block text-sm py-2 px-2 rounded-lg transition-colors ${
          isActive
            ? 'text-white font-medium bg-white/5'
            : 'text-garby-grey hover:text-white hover:bg-white/5'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
