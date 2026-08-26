import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useAuth } from '../auth/AuthContext'

const modules = [
  { title: 'Point of Sale', description: 'Touch-first table service, round by round.', status: 'UI ready', icon: 'pos' as const, href: '/pos' },
  { title: 'Menu & Catalog', description: 'Products, modifiers, pricing, taxes and availability.', status: 'Next', icon: 'menu' as const, href: '/menu' },
  { title: 'Orders', description: 'Order history, open tables and bill reprints.', status: 'Planned', icon: 'orders' as const, href: '/orders' },
]

export function DashboardPage() {
  const { session } = useAuth()
  const firstName = session?.user.displayName.split(' ')[0] ?? 'there'
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())

  return (
    <main className="content dashboard-content">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>Good evening, {firstName}.</h1>
          <p className="muted">Your restaurant is ready for service. ZIP Flow keeps the operational detail out of the way until you need it.</p>
        </div>
        <Link className="primary-button launch-pos" to="/tables"><Icon name="pos" /> Open Tables</Link>
      </section>

      <section className="metric-grid premium-metrics">
        <article className="metric-card">
          <div className="metric-top"><span>Today's sales</span><span className="metric-trend positive">+8.4%</span></div>
          <strong>LKR 284,600</strong>
          <small>128 completed orders</small>
          <div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Open tables</span><span className="metric-dot live" /></div>
          <strong>12 <em>/ 28</em></strong>
          <small>Average dining time · 46 min</small>
          <div className="capacity-line"><i style={{ width: '43%' }} /></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="section-card">
          <div className="section-heading">
            <div><p className="eyebrow">Platform</p><h2>Operations</h2></div>
            <span className="quiet-pill">Foundation v0.2</span>
          </div>
          <div className="module-grid premium-modules">
            {modules.map((module) => (
              <Link className="module-card" key={module.title} to={module.href}>
                <div className="module-icon"><Icon name={module.icon} /></div>
                <div className="module-copy"><h3>{module.title}</h3><p>{module.description}</p></div>
                <span className={`module-status ${module.status === 'UI ready' ? 'ready' : ''}`}>{module.status}</span>
              </Link>
            ))}
          </div>
        </div>

        <aside className="section-card shift-card">
          <div className="section-heading">
            <div><p className="eyebrow">Live shift</p><h2>Service pulse</h2></div>
            <span className="live-badge"><i /> Live</span>
          </div>
          <div className="pulse-list">
            <div><span className="pulse-time">19:38</span><p><strong>Table 18</strong> sent round 2 to the kitchen</p></div>
          </div>
          <button className="secondary-button full-width">View activity</button>
        </aside>
      </section>
    </main>
  )
}
