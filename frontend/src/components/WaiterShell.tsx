import { useEffect, useRef, useState } from 'react'
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
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  // Click outside to close profile dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(time)
  const tenantName = session?.tenant?.name ?? 'ZIP Flow'
  const initials = session?.user?.displayName ? session.user.displayName.charAt(0).toUpperCase() : 'W'

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

        <div className="rail-bottom">
          <button
            type="button"
            className="rail-item"
            title="Help & Info"
            onClick={() => alert(`ZIP Flow Waiter Terminal\nTenant: ${tenantName}\nRole: Waiter`)}
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
                <span className="brand-sub-badge waiter-badge">Waiter Mode</span>
              </div>
            </div>
          </div>

          <div className="topbar-actions">
            {session?.tenant?.currencySymbol && (
              <span className="topbar-currency-badge" title="Tenant Currency">
                ({session.tenant.currencySymbol})
              </span>
            )}
            <span className="connection-state">
              <span className="live-dot" /> Online
            </span>
            <span className="topbar-time">
              <Icon name="clock" size={14} /> {timeLabel}
            </span>

            {/* Profile Dropdown */}
            <div className="user-profile-menu" ref={menuRef}>
              <button
                type="button"
                className={`profile-chip ${profileOpen ? 'menu-open' : ''}`}
                onClick={() => setProfileOpen((prev) => !prev)}
                aria-expanded={profileOpen}
                aria-haspopup="true"
                title="Open user profile menu"
              >
                <span className="profile-avatar waiter-avatar">{initials}</span>
                <span className="profile-name">{session?.user?.displayName.split(' ')[0]}</span>
                <span className="profile-role-badge waiter">Waiter</span>
                <Icon name="chevronDown" size={13} className={`profile-chevron ${profileOpen ? 'open' : ''}`} />
              </button>

              {profileOpen && (
                <div className="profile-dropdown-card">
                  <div className="profile-dropdown-header">
                    <span className="dropdown-avatar waiter-avatar">{initials}</span>
                    <div className="dropdown-user-details">
                      <strong className="dropdown-fullname">{session?.user?.displayName}</strong>
                      <span className="dropdown-email">{session?.user?.email}</span>
                      <span className="dropdown-role-pill waiter">Waiter Terminal</span>
                    </div>
                  </div>

                  <div className="profile-dropdown-divider" />

                  <div className="profile-dropdown-meta">
                    <span className="meta-label">Assigned Location</span>
                    <span className="meta-value">{tenantName}</span>
                  </div>

                  <div className="profile-dropdown-divider" />

                  <div className="profile-dropdown-actions">
                    <NavLink
                      to="/waiter/tables"
                      className="profile-dropdown-link"
                      onClick={() => setProfileOpen(false)}
                    >
                      <Icon name="grid" size={16} />
                      <span>My Tables Floor</span>
                    </NavLink>
                  </div>

                  <div className="profile-dropdown-divider" />

                  <button
                    type="button"
                    className="profile-dropdown-logout-btn"
                    onClick={() => {
                      setProfileOpen(false)
                      logout()
                    }}
                  >
                    <Icon name="logOut" size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <Outlet />
      </section>
    </div>
  )
}
