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
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const roles = await login(email, password)
      const requestedFrom = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      // A `from` remembered before this login (e.g. a prior session's redirect,
      // or a role switch on the same tab) can point at a shell that no longer
      // fits the account that just signed in. Waiter sessions are always safe
      // to send anywhere they asked to go — WaiterOnlyGuard bounces them back
      // to /waiter/tables if it doesn't fit. Non-waiter sessions landing on a
      // stale /waiter/* path aren't guarded away from it (previewing the
      // waiter shell is allowed), so a leftover /waiter/* `from` would strand
      // them there looking like the wrong account signed in.
      const from = isWaiterOnly(roles) || !requestedFrom?.startsWith('/waiter')
        ? requestedFrom ?? '/'
        : '/'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <div className="auth-brand-lockup">
          <img
            src="/images/m9Nra52axnIYWpM9arXpmaawnDk_1.png"
            alt="ZIP Flow"
            className="auth-brand-logo"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <div className="auth-brand-names">
            <strong>ZIP Flow</strong>
            <span>Restaurant OS</span>
          </div>
        </div>

        <div className="auth-message">
          <p className="eyebrow light">Restaurant operating platform</p>
          <h1>Every service.<br />One flow.</h1>
          <p className="auth-lead">Calm on the floor. Clear in the back office.</p>
          <div className="auth-feature-row">
            <span><i /> Tables</span>
            <span><i /> Point of sale</span>
            <span><i /> Orders</span>
          </div>
        </div>

        <p className="auth-footer">ZIP Flow · Restaurant Operating System</p>
      </section>

      <section className="auth-form-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-heading">
            <div className="login-icon-box">
              <Icon name="user" size={18} />
            </div>
            <div>
              <p className="eyebrow">Welcome back</p>
              <h2>Sign in to ZIP Flow</h2>
              <p className="muted">Use the local development administrator for this foundation build.</p>
            </div>
          </div>

          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Continue'}
          </button>

          <p className="login-security">Protected by ZIP Flow identity and role permissions.</p>
        </form>
      </section>
    </main>
  )
}
