import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { AuthProvider } from '../features/auth/AuthContext'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { KitchenPage } from '../features/kitchen/KitchenPage'
import { MenuPage } from '../features/menu/MenuPage'
import { OrdersPage } from '../features/orders/OrdersPage'
import { PosPage } from '../features/pos/PosPage'
import { Icon } from '../components/Icon'

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <main className="content">
      <div className="coming-soon-card">
        <div className="coming-soon-icon"><Icon name="spark" /></div>
        <p className="eyebrow">Upcoming ZIP Flow module</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
        <span className="quiet-pill">Built step by step</span>
      </div>
    </main>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="kitchen" element={<KitchenPage />} />
              <Route path="reports" element={<ComingSoon title="Reports" description="Sales, margin, food cost, inventory variance and multi-location reporting will be added on top of trusted transaction data." />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
