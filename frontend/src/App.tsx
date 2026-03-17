import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

/**
 * App — Root component with React Router setup.
 * Additional routes will be added in subsequent sprints:
 *   - /login         (T-008)
 *   - /register      (T-008)
 *   - /scan          (T-012 – T-022)
 *   - /scan/:id      (T-026)
 *   - /dashboard     (T-025)
 *   - /profile       (T-010)
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
