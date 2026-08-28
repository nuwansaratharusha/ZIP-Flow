import { FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useAuth } from './AuthContext'
import { isWaiterOnly } from './roles'

export function LoginPage() {
  const { session, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('admin@zipflow.local')
  const [password, setPassword] = useState('ChangeMe123!')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  const selectRole = (role: 'admin' | 'waiter') => {
    if (role === 'admin') {
      setEmail('admin@zipflow.local')
      setPassword('ChangeMe123!')
    } else {
      setEmail('waiter@zipflow.local')
      setPassword('ChangeMe123!')
    }
    setError('')
  }

  const isAdmin = email === 'admin@zipflow.local'
  const isWaiter = email === 'waiter@zipflow.local'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const roles = await login(email.trim(), password)
      const requestedFrom = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      const from = isWaiterOnly(roles) || !requestedFrom?.startsWith('/waiter')
        ? requestedFrom ?? '/'
        : '/'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="seamless-auth-page">
      <div className="seamless-auth-container">
        {/* Brand Header */}
        <div className="seamless-brand-header">
          <img
            src="/images/m9Nra52axnIYWpM9arXpmaawnDk_1.png"
            alt="ZIP Flow"
            className="seamless-logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div className="seamless-brand-title">
            <strong>ZIP Flow</strong>
            <span>Restaurant OS</span>
          </div>
        </div>

        {/* Clean Login Card */}
        <div className="seamless-card">
          <div className="seamless-card-header">
            <h1>Sign in</h1>
            <p>Select a quick demo role or enter your credentials.</p>
          </div>

          {/* Quick Demo Role Switcher Segment */}
          <div className="seamless-role-switcher" role="tablist">
            <button
              type="button"
              className={`role-tab ${isAdmin ? 'active' : ''}`}
              onClick={() => selectRole('admin')}
              role="tab"
              aria-selected={isAdmin}
            >
              <Icon name="shield" size={15} />
              <span>Admin</span>
              <small>Full Access</small>
            </button>
            <button
              type="button"
              className={`role-tab ${isWaiter ? 'active' : ''}`}
              onClick={() => selectRole('waiter')}
              role="tab"
              aria-selected={isWaiter}
            >
              <Icon name="utensils" size={15} />
              <span>Waiter</span>
              <small>Floor &amp; POS</small>
            </button>
          </div>

          {/* Form */}
          <form className="seamless-form" onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="login-email">Email Address</label>
              <div className="input-group">
                <Icon name="mail" size={16} className="input-icon" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="staff@restaurant.com"
                  required
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="login-password">Password</label>
              <div className="input-group">
                <Icon name="lock" size={16} className="input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            </div>

            {error && (
              <div className="alert error auth-error">
                <Icon name="alertTriangle" size={15} />
                <span>{error}</span>
              </div>
            )}

            <button className="primary-button submit-btn" disabled={submitting} type="submit">
              {submitting ? (
                <>
                  <span className="btn-spinner" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <Icon name="arrowRight" size={15} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Minimal Footer */}
        <p className="seamless-footer">
          ZIP Flow · Fine Dining &amp; Table Service OS
        </p>
      </div>
    </main>
  )
}
