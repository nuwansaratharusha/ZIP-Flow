import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { Icon, type IconName } from './Icon'

const nav: { label: string; path: string; icon: IconName }[] = [
  { label: 'Tables', path: '/waiter/tables', icon: 'grid' },
  { label: 'POS', path: '/waiter/pos', icon: 'pos' },
]

export function WaiterShell() {
  const { session, logout } = useAuth()
  const location = useLocation()
  const isPos = location.pathname.startsWith('/waiter/pos/')
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(time)
  const tenantName = session?.tenant?.name ?? 'ZIP Flow'
  const initials = session?.user?.displayName ? session.user.displayName.charAt(0).toUpperCase() : 'Z'

  return (
    <div className={`app-shell ${isPos ? 'pos-mode' : ''}`}>
      <aside className="icon-rail" aria-label="Primary Navigation">
        <div className="rail-top">
          {nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `rail-item ${isActive ? 'active-accent' : ''}`}
              title={item.label}
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} size={22} filled={isActive} />
                  <span className="rail-tooltip">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <div className="zipflow-brand-lockup">
              <img
                src="/images/m9Nra52axnIYWpM9arXpmaawnDk_1.png"
                alt="ZIP Flow"
                className="brand-logo-icon"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <div className="brand-title-group">
                <strong className="brand-logo-text">{tenantName}</strong>
                <span className="brand-sub-badge">Waiter</span>
              </div>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="connection-state">
              <Icon name="wifi" size={14} /> Online
            </span>
            <span className="topbar-time">
              <Icon name="clock" size={14} /> {timeLabel}
            </span>
            <button className="profile-chip" onClick={logout} title="Click to Sign Out">
              <span>{initials}</span>
              {session?.user?.displayName.split(' ')[0]}
            </button>
          </div>
        </header>
        <Outlet />
      </section>
    </div>
  )
}
