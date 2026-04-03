import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import GuestBanner from '@/components/GuestBanner'

// Public pages
import HomePage           from '@/pages/HomePage'
import LoginPage          from '@/pages/LoginPage'
import RegisterPage       from '@/pages/RegisterPage'
import AuthCallbackPage   from '@/pages/AuthCallbackPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage  from '@/pages/ResetPasswordPage'
import PricingPage        from '@/pages/PricingPage'
import ScanPage           from '@/pages/ScanPage'          // T-031: now public
import ScanResultPage     from '@/pages/ScanResultPage'
import NotFoundPage       from '@/pages/NotFoundPage'

// Protected pages
import DashboardPage      from '@/pages/DashboardPage'
import ProfilePage        from '@/pages/ProfilePage'
import ScanHistoryPage    from '@/pages/ScanHistoryPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Public routes ────────────────────────────────────────────── */}
          <Route path="/"                element={<HomePage />} />
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/auth/callback"   element={<AuthCallbackPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/pricing"         element={<PricingPage />} />
          <Route path="/scan"            element={<ScanPage />} />    {/* T-031: public */}
          <Route path="/scan/:id"        element={<ScanResultPage />} />

          {/* ── Protected routes ─────────────────────────────────────────── */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile"   element={<ProfilePage />} />
            <Route path="/history"   element={<ScanHistoryPage />} />
          </Route>

          {/* ── 404 ──────────────────────────────────────────────────────── */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        <GuestBanner />
      </BrowserRouter>
    </AuthProvider>
  )
}
