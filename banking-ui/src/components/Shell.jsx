import { NavLink } from 'react-router-dom'

export function Topbar({ account, apiStatus, onSwitch }) {
  return (
    <header className="topbar">
      <NavLink className="brand" to={account ? '/dashboard' : '/'}>
        <span className="brand-mark" />
        <span className="brand-name">Meridian</span>
      </NavLink>

      {account && (
        <nav className="topnav">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            Overview
          </NavLink>
          <NavLink to="/transfer" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            Transfer
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            History
          </NavLink>
          <button type="button" className="ghost" onClick={onSwitch}>
            Switch account
          </button>
        </nav>
      )}

      <div className={`api-pill ${apiStatus}`}>{apiStatus === 'up' ? 'API UP' : apiStatus === 'down' ? 'API DOWN' : 'Checking…'}</div>
    </header>
  )
}

export function Toast({ toast }) {
  if (!toast) return null
  return <div className={`toast show ${toast.isError ? 'error' : ''}`}>{toast.message}</div>
}

export function OtpDialog({ open, transactionId, onClose, onVerify }) {
  if (!open) return null

  function handleSubmit(e) {
    e.preventDefault()
    const otp = new FormData(e.target).get('otp')
    onVerify(String(otp || '').trim())
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form className="otp-sheet" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Verify transfer</h3>
        <p className="muted">
          Fraud detection flagged this transfer. Enter the OTP from the notification-service logs.
        </p>
        <p className="mono small">Transaction: {transactionId}</p>
        <label>
          OTP
          <input name="otp" inputMode="numeric" pattern="[0-9]{4,8}" required placeholder="6-digit code" autoComplete="one-time-code" autoFocus />
        </label>
        <div className="actions">
          <button type="submit" className="btn primary">
            Verify
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
