import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { Icon } from './Icon'

const nav = [
  { label: 'Overview', path: '/', icon: 'dashboard' as const },
  { label: 'POS', path: '/pos', icon: 'pos' as const },
  { label: 'Orders', path: '/orders', icon: 'orders' as const },
  { label: 'Menu', path: '/menu', icon: 'menu' as const },
  { label: 'Inventory', path: '/inventory', icon: 'inventory' as const },
  { label: 'Kitchen', path: '/kitchen', icon: 'kitchen' as const },
  { label: 'Reports', path: '/reports', icon: 'reports' as const },
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

  return (
    <div className={`app-shell ${isPos ? 'pos-mode' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small"><span>Z</span></div>
          <div>
            <strong>ZIP Flow</strong>
            <span>Restaurant OS</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              end={item.path === '/'}
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item nav-button"><Icon name="settings" /><span>Settings</span></button>
          <div className="sidebar-user">
            <div className="avatar">{session?.user.displayName.charAt(0).toUpperCase()}</div>
            <div className="user-copy">
              <strong>{session?.user.displayName}</strong>
              <span>{session?.defaultLocation?.name ?? 'Default location'}</span>
            </div>
            <button className="user-menu" onClick={logout} aria-label="Sign out"><Icon name="chevronDown" /></button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="location-switcher">
              <span className="location-dot" />
              <span>
                <small>Location</small>
                <strong>{session?.defaultLocation?.name ?? session?.tenant.name}</strong>
              </span>
              <Icon name="chevronDown" />
            </button>
          </div>

          <div className="topbar-actions">
            <span className="connection-state"><Icon name="wifi" /> Online</span>
            <span className="topbar-time"><Icon name="clock" /> {timeLabel}</span>
            <button className="profile-chip"><span>{session?.user.displayName.charAt(0).toUpperCase()}</span>{session?.user.displayName.split(' ')[0]}</button>
          </div>
        </header>
        <Outlet />
      </section>
    </div>
  )
}
