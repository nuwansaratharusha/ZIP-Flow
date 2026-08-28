import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { WaiterShell } from '../components/WaiterShell'
import { AuthProvider } from '../features/auth/AuthContext'
import { ToastProvider } from '../components/Toast'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { WaiterOnlyGuard } from '../features/auth/WaiterOnlyGuard'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { MenuPage } from '../features/menu/MenuPage'
import { OrdersPage } from '../features/orders/OrdersPage'
import { OrderPrintPage } from '../features/orders/OrderPrintPage'
import { PosPage } from '../features/pos/PosPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TablesPage } from '../features/tables/TablesPage'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<WaiterOnlyGuard />}>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="tables" element={<TablesPage />} />
                  <Route path="pos" element={<Navigate to="/tables" replace />} />
                  <Route path="pos/:orderId" element={<PosPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="menu" element={<MenuPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route element={<WaiterShell />}>
                <Route path="waiter" element={<Navigate to="/waiter/tables" replace />} />
                <Route path="waiter/tables" element={<TablesPage />} />
                <Route path="waiter/pos" element={<Navigate to="/waiter/tables" replace />} />
                <Route path="waiter/pos/:orderId" element={<PosPage />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="print/orders/:orderId/round/:roundNumber" element={<OrderPrintPage />} />
              <Route path="print/orders/:orderId/bill" element={<OrderPrintPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
