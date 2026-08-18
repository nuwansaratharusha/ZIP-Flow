import { FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useAuth } from './AuthContext'

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
      await login(email, password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
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
          <p className="auth-lead">Fast at the counter. Calm in the kitchen. Clear in the back office.</p>
          <div className="auth-feature-row">
            <span><i /> Point of sale</span>
            <span><i /> Inventory</span>
            <span><i /> Kitchen</span>
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
