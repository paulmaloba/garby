/**
 * NotFoundPage.tsx — T-027 UI Polish
 */

import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'

export default function NotFoundPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-garby-dark flex flex-col items-center justify-center px-4">

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[500px] h-[500px] bg-garby-green/5 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center max-w-md animate-slide-up">

        {/* Garby mark */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 opacity-30">
              <path
                d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
                stroke="#F0F2FF" strokeWidth="4" strokeLinecap="round"
              />
              <line x1="8" y1="32" x2="48" y2="32" stroke="#2ECC71" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="48" cy="32" r="4" fill="#2ECC71"/>
            </svg>
            <span className="absolute -top-1 -right-1 text-lg">?</span>
          </div>
        </div>

        <p className="section-label mb-4">404 — Not Found</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 text-balance">
          Lost in the noise.
        </h1>
        <p className="text-garby-grey mb-8 leading-relaxed">
          This page doesn't exist — but at least we know it's not AI-generated.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => navigate(-1)} variant="secondary">
            ← Go back
          </Button>
          <Link to={user ? '/dashboard' : '/'}>
            <Button fullWidth>
              {user ? 'Back to dashboard' : 'Back to home'}
            </Button>
          </Link>
        </div>

      </div>
    </div>
  )
}
