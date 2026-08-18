import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { Icon, type IconName } from './Icon'

const nav: { label: string; path: string; icon: IconName }[] = [
  { label: 'Overview', path: '/', icon: 'home' },
  { label: 'POS', path: '/pos', icon: 'pos' },
  { label: 'Tables', path: '/tables', icon: 'grid' },
  { label: 'Orders', path: '/orders', icon: 'orders' },
  { label: 'Menu', path: '/menu', icon: 'menu' },
  { label: 'Inventory', path: '/inventory', icon: 'inventory' },
  { label: 'Kitchen', path: '/kitchen', icon: 'kitchen' },
  { label: 'Reports', path: '/reports', icon: 'reports' },
]

export function AppShell() {
  const { session, logout } = useAuth()
  const location = useLocation()
  const isPos = location.pathname === '/pos'
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
      {/* Slim Dark Navigation Rail (Theme matching Screenshot 2) */}
      <aside className="icon-rail" aria-label="Primary Navigation">
        <div className="rail-top">
          {nav.map((item) => (
            <NavLink
              end={item.path === '/'}
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

        <div className="rail-bottom">
          <NavLink
            to="/settings"
            className={({ isActive }) => `rail-item ${isActive ? 'active-accent' : ''}`}
            title="Settings & System Preferences"
          >
            {({ isActive }) => (
              <>
                <Icon name="settings" size={22} filled={isActive} />
                <span className="rail-tooltip">Settings</span>
              </>
            )}
          </NavLink>
          <button
            type="button"
            className="rail-item"
            title="Help Center"
            onClick={() => alert('ZIP Flow Restaurant OS')}
          >
            <Icon name="helpCircle" size={22} />
            <span className="rail-tooltip">Help</span>
          </button>
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
                <span className="brand-sub-badge">Restaurant OS</span>
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
