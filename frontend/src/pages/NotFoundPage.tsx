import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-garby-dark flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Garby icon */}
        <div className="flex justify-center mb-8">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 opacity-40">
            <path d="M56 32C56 45.255 45.255 56 32 56C18.745 56 8 45.255 8 32C8 18.745 18.745 8 32 8"
              stroke="#f0f0f0" strokeWidth="4" strokeLinecap="round"/>
            <line x1="8" y1="32" x2="48" y2="32" stroke="#2ECC71" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="48" cy="32" r="4" fill="#2ECC71"/>
          </svg>
        </div>

        <p className="section-label mb-4">404 — Page not found</p>
        <h1 className="text-4xl font-bold text-white mb-4">Lost in the noise.</h1>
        <p className="text-garby-grey mb-8">
          This page doesn't exist — but at least we know it's not AI-generated.
        </p>
        <Link to="/" className="btn-primary">
          Back to Garby
        </Link>
      </div>
    </div>
  )
}
