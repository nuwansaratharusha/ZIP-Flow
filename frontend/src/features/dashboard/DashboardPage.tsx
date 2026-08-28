import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { formatMoney } from '../../lib/currency'
import { useAuth } from '../auth/AuthContext'
import { getOrders } from '../orders/api'
import type { Order } from '../orders/types'
import { getTables } from '../tables/api'
import type { RestaurantTable } from '../tables/types'

const modules = [
  {
    title: 'Tables & Floor Plan',
    description: 'Real-time table status, seating guests, and section overview.',
    status: 'Live Floor',
    icon: 'grid' as const,
    href: '/tables',
    highlight: true,
  },
  {
    title: 'Orders & History',
    description: 'Search completed orders, print receipts, and track table rounds.',
    status: 'Operational',
    icon: 'orders' as const,
    href: '/orders',
  },
  {
    title: 'Menu & Catalog',
    description: 'Products, categories, real-time pricing and 86 stock availability.',
    status: 'Configured',
    icon: 'menu' as const,
    href: '/menu',
  },
  {
    title: 'Settings & Hardware',
    description: 'Thermal receipt footer, VAT & service charges, ESC/POS printer.',
    status: 'System',
    icon: 'settings' as const,
    href: '/settings',
  },
]

export function DashboardPage() {
  const { session } = useAuth()
  const firstName = session?.user.displayName.split(' ')[0] ?? 'there'
  const currencySymbol = session?.tenant.currencySymbol ?? '£'

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date())

  useEffect(() => {
    Promise.all([getTables().catch(() => []), getOrders().catch(() => [])])
      .then(([fetchedTables, fetchedOrders]) => {
        setTables(fetchedTables)
        setOrders(fetchedOrders)
      })
      .finally(() => setLoading(false))
  }, [])

  const activeTables = useMemo(() => tables.filter((t) => !t.isArchived), [tables])
  const occupiedTables = useMemo(() => activeTables.filter((t) => t.status === 'occupied'), [activeTables])
  const availableTables = useMemo(() => activeTables.filter((t) => t.status === 'available'), [activeTables])
  const occupancyPercent = activeTables.length > 0
    ? Math.round((occupiedTables.length / activeTables.length) * 100)
    : 0

  const todayOrders = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return orders.filter((o) => o.createdAt.startsWith(todayStr))
  }, [orders])

  const todaySales = useMemo(() => {
    return todayOrders.reduce((sum, o) => (o.status === 'Closed' ? sum + o.total : sum), 0)
  }, [todayOrders])

  const openOrdersCount = useMemo(() => {
    return orders.filter((o) => o.status === 'Open').length
  }, [orders])

  const closedOrdersCount = useMemo(() => {
    return todayOrders.filter((o) => o.status === 'Closed').length
  }, [todayOrders])

  const avgOrderValue = closedOrdersCount > 0 ? todaySales / closedOrdersCount : 0

  return (
    <main className="content dashboard-content">
      {/* Hero Welcome Banner */}
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>Good day, {firstName}.</h1>
          <p className="muted">
            {occupiedTables.length > 0
              ? `Service is active: ${occupiedTables.length} table${occupiedTables.length === 1 ? '' : 's'} seated with open rounds.`
              : 'Your restaurant floor is ready for service. Tap below to seat guests.'}
          </p>
        </div>
        <div className="hero-actions">
          <Link className="primary-button launch-pos" to="/tables">
            <Icon name="grid" size={18} /> Floor Plan
          </Link>
        </div>
      </section>

      {/* Real-Time Live Shift Metrics */}
      <section className="metric-grid premium-metrics">
        {/* Metric 1: Live Floor Occupancy */}
        <article className="metric-card">
          <div className="metric-top">
            <span>Floor Occupancy</span>
            <span className={`metric-dot ${occupiedTables.length > 0 ? 'live' : ''}`} />
          </div>
          <strong>
            {occupiedTables.length} <em>/ {activeTables.length || 0} Tables</em>
          </strong>
          <small>{availableTables.length} available · {occupancyPercent}% capacity</small>
          <div className="capacity-line">
            <i style={{ width: `${Math.min(100, Math.max(0, occupancyPercent))}%` }} />
          </div>
        </article>

        {/* Metric 2: Today's Sales Volume */}
        <article className="metric-card">
          <div className="metric-top">
            <span>Today's Sales</span>
            <span className="metric-trend positive">
              <Icon name="checkCircle" size={12} /> {closedOrdersCount} closed
            </span>
          </div>
          <strong>{formatMoney(todaySales, currencySymbol)}</strong>
          <small>{openOrdersCount} in-flight order{openOrdersCount === 1 ? '' : 's'} currently open</small>
          <div className="mini-bars">
            <span style={{ height: '40%' }} />
            <span style={{ height: '65%' }} />
            <span style={{ height: '50%' }} />
            <span style={{ height: '85%' }} />
            <span style={{ height: '100%' }} />
          </div>
        </article>

        {/* Metric 3: Active Open Rounds */}
        <article className="metric-card">
          <div className="metric-top">
            <span>Active Rounds</span>
            <span className="metric-sub">{openOrdersCount} open tables</span>
          </div>
          <strong>{openOrdersCount}</strong>
          <small>Orders waiting for round delivery or bill settlement</small>
          <div className="metric-footer-note">
            <Icon name="clock" size={12} /> Real-time sync
          </div>
        </article>

        {/* Metric 4: Average Order Value */}
        <article className="metric-card">
          <div className="metric-top">
            <span>Avg Spend / Table</span>
            <span className="metric-sub">Closed rounds</span>
          </div>
          <strong>{formatMoney(avgOrderValue, currencySymbol)}</strong>
          <small>Across {closedOrdersCount} closed table bills today</small>
          <div className="metric-footer-note">
            <Icon name="tag" size={12} /> Per table average
          </div>
        </article>
      </section>

      {/* Main Split: Modules & Live Service Pulse */}
      <section className="dashboard-grid">
        {/* Left: Quick Access Operational Modules */}
        <div className="section-card modules-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Restaurant Hub</p>
              <h2>Quick Operations</h2>
            </div>
            <span className="quiet-pill">v0.2 Foundation</span>
          </div>

          <div className="module-grid premium-modules">
            {modules.map((module) => (
              <Link className={`module-card ${module.highlight ? 'module-card-primary' : ''}`} key={module.title} to={module.href}>
                <div className="module-icon">
                  <Icon name={module.icon} size={22} />
                </div>
                <div className="module-copy">
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                </div>
                <span className="module-status ready">{module.status}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Right: Live Service Pulse */}
        <aside className="section-card shift-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Active Floor</p>
              <h2>Live Tables</h2>
            </div>
            {occupiedTables.length > 0 && (
              <span className="live-badge">
                <i /> {occupiedTables.length} Active
              </span>
            )}
          </div>

          {loading ? (
            <p className="muted">Loading service pulse…</p>
          ) : occupiedTables.length === 0 ? (
            <div className="empty-pulse">
              <Icon name="utensils" size={24} />
              <p>No active tables right now.</p>
              <Link to="/tables" className="secondary-button sm">
                Seat First Guest
              </Link>
            </div>
          ) : (
            <div className="pulse-list">
              {occupiedTables.map((t) => (
                <Link
                  to={t.openOrderId ? `/pos/${t.openOrderId}` : '/tables'}
                  key={t.id}
                  className="pulse-item-link"
                >
                  <div className="pulse-item">
                    <span className="pulse-tag">{t.section}</span>
                    <div className="pulse-details">
                      <strong>{t.name}</strong>
                      <span>{t.openOrderCustomerName ? `Guest: ${t.openOrderCustomerName}` : 'Seated'}</span>
                    </div>
                    <span className="pulse-arrow">
                      <Icon name="arrowRight" size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Link to="/orders" className="secondary-button full-width" style={{ marginTop: 'auto' }}>
            <Icon name="orders" size={16} /> View All Orders
          </Link>
        </aside>
      </section>
    </main>
  )
}
