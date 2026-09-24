import { Link, useNavigate } from 'react-router-dom'
import { money } from '../api'

export function WelcomeView() {
  return (
    <section className="view view-welcome is-active">
      <div className="hero">
        <p className="eyebrow">Local microservices · Port 8080</p>
        <h1 className="hero-brand">Meridian</h1>
        <p className="hero-lead">
          Open an account or sign in with your account number to move money across the banking services running on your
          machine.
        </p>
        <div className="hero-actions">
          <Link className="btn primary" to="/create">
            Open account
          </Link>
          <Link className="btn secondary" to="/signin">
            Use account number
          </Link>
        </div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="vault-ring" />
        <div className="vault-core" />
      </div>
    </section>
  )
}

export function SignInView({ onSubmit, busy }) {
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    const accountNumber = String(new FormData(e.target).get('accountNumber') || '').trim()
    onSubmit(accountNumber)
  }

  return (
    <section className="view is-active">
      <div className="panel">
        <h2>Sign in</h2>
        <p className="muted">Enter an existing account number from the account service.</p>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Account number
            <input name="accountNumber" required placeholder="e.g. ACC…" autoComplete="off" />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            Continue
          </button>
        </form>
        <button type="button" className="link" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </section>
  )
}

export function CreateAccountView({ onSubmit, busy }) {
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    onSubmit({
      accountHolderName: String(fd.get('accountHolderName') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      accountType: String(fd.get('accountType')),
      initialDeposit: Number(fd.get('initialDeposit')),
    })
  }

  return (
    <section className="view is-active">
      <div className="panel wide">
        <h2>Open an account</h2>
        <p className="muted">Creates a new account via the API gateway → account-service.</p>
        <form className="form grid-2" onSubmit={handleSubmit}>
          <label>
            Full name
            <input name="accountHolderName" required placeholder="Alice Smith" />
          </label>
          <label>
            Email
            <input name="email" type="email" required placeholder="alice@demo.com" />
          </label>
          <label>
            Phone
            <input name="phone" required placeholder="9876543210" pattern="[0-9]{10,15}" />
          </label>
          <label>
            Account type
            <select name="accountType" required defaultValue="SAVINGS">
              <option value="SAVINGS">Savings</option>
              <option value="CURRENT">Current</option>
              <option value="FIXED_DEPOSIT">Fixed deposit</option>
            </select>
          </label>
          <label className="span-2">
            Initial deposit (₹)
            <input name="initialDeposit" type="number" min="1" step="1" required defaultValue={50000} />
          </label>
          <div className="span-2 actions">
            <button type="submit" className="btn primary" disabled={busy}>
              Create account
            </button>
            <button type="button" className="btn secondary" onClick={() => navigate('/')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

export function DashboardView({ account, onRefresh, busy }) {
  const navigate = useNavigate()
  if (!account) return null
  return (
    <section className="view is-active">
      <div className="dash-head">
        <div>
          <p className="eyebrow">{(account.accountType || '').replaceAll('_', ' ')}</p>
          <h2>{account.accountHolderName}</h2>
          <p className="mono">{account.accountNumber}</p>
        </div>
        <div className="balance-block">
          <span className="balance-label">Available balance</span>
          <strong className="balance-value">{money(account.balance)}</strong>
          <span className={`status-chip ${account.status === 'BLOCKED' ? 'blocked' : ''}`}>{account.status || 'ACTIVE'}</span>
        </div>
      </div>
      <div className="quick-row">
        <button type="button" className="btn primary" onClick={() => navigate('/transfer')}>
          Send money
        </button>
        <button type="button" className="btn secondary" onClick={() => navigate('/history')}>
          View history
        </button>
        <button type="button" className="btn secondary" onClick={onRefresh} disabled={busy}>
          Refresh
        </button>
      </div>
      <div className="meta-grid">
        <div>
          <span className="meta-label">Email</span>
          <span>{account.email}</span>
        </div>
        <div>
          <span className="meta-label">Phone</span>
          <span>{account.phone}</span>
        </div>
        <div>
          <span className="meta-label">Daily limit</span>
          <span>{money(account.dailyTransactionLimit)}</span>
        </div>
      </div>
    </section>
  )
}

export function TransferView({ account, onSubmit, onOpenOtp, result, busy }) {
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    onSubmit({
      senderAccountNumber: String(fd.get('senderAccountNumber') || '').trim(),
      receiverAccountNumber: String(fd.get('receiverAccountNumber') || '').trim(),
      amount: Number(fd.get('amount')),
      description: String(fd.get('description') || '').trim() || 'Transfer',
    })
  }

  return (
    <section className="view is-active">
      <div className="panel wide">
        <h2>Transfer</h2>
        <p className="muted">Routes through gateway → transaction-service (fraud check via Kafka).</p>
        <form className="form grid-2" onSubmit={handleSubmit}>
          <label>
            From
            <input name="senderAccountNumber" value={account?.accountNumber || ''} readOnly required />
          </label>
          <label>
            To (account number)
            <input name="receiverAccountNumber" required placeholder="Receiver account number" />
          </label>
          <label>
            Amount (₹)
            <input name="amount" type="number" min="1" step="0.01" required placeholder="1000" />
          </label>
          <label>
            Description
            <input name="description" placeholder="Rent payment" />
          </label>
          <div className="span-2 actions">
            <button type="submit" className="btn primary" disabled={busy}>
              Send transfer
            </button>
            <button type="button" className="btn secondary" onClick={() => navigate('/dashboard')}>
              Back
            </button>
          </div>
        </form>
        {result && (
          <div className={`result ${result.tone}`}>
            <strong>{result.title}</strong>
            <p className="muted">{result.message}</p>
            {result.id && <p className="mono small">{result.id}</p>}
            {result.needsOtp && (
              <button type="button" className="btn primary" onClick={() => onOpenOtp(result.id)}>
                Enter OTP
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export function HistoryView({ rows, loading, onRefresh, onOpenOtp }) {
  return (
    <section className="view is-active">
      <div className="panel wide">
        <div className="panel-head">
          <h2>Transaction history</h2>
          <button type="button" className="btn secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
        <div className="history-list">
          {loading && <p className="muted">Loading…</p>}
          {!loading && (!rows || rows.length === 0) && <p className="muted">No transactions yet.</p>}
          {!loading &&
            rows?.map((t) => {
              const needsOtp = t.status === 'PENDING_VERIFICATION'
              return (
                <article className="txn" key={t.id}>
                  <div>
                    <strong>{t.description || t.type || 'Transfer'}</strong>
                    <div className="mono small">
                      {t.senderAccountNumber} → {t.receiverAccountNumber}
                    </div>
                  </div>
                  <div className="txn-amount">{money(t.amount)}</div>
                  <div className="txn-status">
                    <span className={`badge ${(t.status || '').toLowerCase()}`}>{t.status}</span>
                    <span className="mono small">{t.createdAt || ''}</span>
                    {needsOtp && (
                      <button type="button" className="btn secondary" onClick={() => onOpenOtp(t.id)}>
                        Verify OTP
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
        </div>
      </div>
    </section>
  )
}
