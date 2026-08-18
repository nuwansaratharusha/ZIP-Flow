import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="page-center muted">Loading ZIP Flow…</div>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}
