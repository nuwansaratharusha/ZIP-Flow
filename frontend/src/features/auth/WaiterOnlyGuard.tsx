import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { isWaiterOnly } from './roles'

export function WaiterOnlyGuard() {
  const { session } = useAuth()
  if (isWaiterOnly(session?.roles)) return <Navigate to="/waiter/tables" replace />
  return <Outlet />
}
