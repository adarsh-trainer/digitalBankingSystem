import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { bankingApi } from './api'
import { OtpDialog, Toast, Topbar } from './components/Shell'
import {
  CreateAccountView,
  DashboardView,
  HistoryView,
  SignInView,
  TransferView,
  WelcomeView,
} from './views/Views'

const SESSION_KEY = 'meridian.accountNumber'

function RequireAccount({ account, children }) {
  if (!account) return <Navigate to="/signin" replace />
  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [account, setAccount] = useState(null)
  const [apiStatus, setApiStatus] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [transferResult, setTransferResult] = useState(null)
  const [otpTxnId, setOtpTxnId] = useState(null)
  const [sessionReady, setSessionReady] = useState(false)

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError })
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const loadAccount = useCallback(
    async (accountNumber, { goDashboard = true } = {}) => {
      const data = await bankingApi.getAccount(accountNumber)
      setAccount(data)
      localStorage.setItem(SESSION_KEY, data.accountNumber)
      if (goDashboard) navigate('/dashboard')
      return data
    },
    [navigate],
  )

  const loadHistory = useCallback(async () => {
    if (!account) return
    setHistoryLoading(true)
    try {
      const rows = await bankingApi.getHistory(account.accountNumber)
      setHistory(rows || [])
    } catch (e) {
      showToast(e.message, true)
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [account, showToast])

  const checkHealth = useCallback(async () => {
    try {
      const h = await bankingApi.health()
      setApiStatus(h?.status === 'UP' ? 'up' : 'down')
    } catch {
      setApiStatus('down')
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const id = window.setInterval(checkHealth, 15000)
    return () => window.clearInterval(id)
  }, [checkHealth])

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) {
      setSessionReady(true)
      return
    }
    loadAccount(saved, { goDashboard: false })
      .catch(() => localStorage.removeItem(SESSION_KEY))
      .finally(() => setSessionReady(true))
  }, [loadAccount])

  useEffect(() => {
    if (location.pathname === '/history') loadHistory()
  }, [location.pathname, loadHistory])

  useEffect(() => {
    if (location.pathname === '/transfer') setTransferResult(null)
  }, [location.pathname])

  useEffect(() => {
    const protectedPaths = ['/dashboard', '/transfer', '/history']
    if (sessionReady && !account && protectedPaths.includes(location.pathname)) {
      showToast('Sign in with an account number first', true)
    }
  }, [sessionReady, account, location.pathname, showToast])

  async function handleSignIn(accountNumber) {
    setBusy(true)
    try {
      await loadAccount(accountNumber)
      showToast('Welcome back')
    } catch (e) {
      showToast(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(body) {
    setBusy(true)
    try {
      const created = await bankingApi.createAccount(body)
      setAccount(created)
      localStorage.setItem(SESSION_KEY, created.accountNumber)
      navigate('/dashboard')
      showToast(`Account created: ${created.accountNumber}`)
    } catch (e) {
      showToast(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  async function handleTransfer(body) {
    setBusy(true)
    setTransferResult(null)
    try {
      const txn = await bankingApi.transfer(body)
      if (txn.status === 'PENDING_VERIFICATION') {
        setTransferResult({
          tone: 'warn',
          title: 'OTP required',
          message: 'Fraud check flagged this transfer. Check notification-service logs for the OTP.',
          id: txn.id,
          needsOtp: true,
        })
        setOtpTxnId(txn.id)
      } else if (txn.status === 'COMPLETED') {
        setTransferResult({
          tone: 'ok',
          title: 'Transfer completed',
          message: `Status ${txn.status}`,
          id: txn.id,
        })
        await loadAccount(account.accountNumber, { goDashboard: false })
        showToast('Transfer completed')
      } else {
        setTransferResult({
          tone: '',
          title: 'Transfer submitted',
          message: `Status: ${txn.status}`,
          id: txn.id,
        })
        await loadAccount(account.accountNumber, { goDashboard: false })
      }
    } catch (e) {
      setTransferResult({ tone: 'err', title: 'Transfer failed', message: e.message })
      showToast(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyOtp(otp) {
    if (!otpTxnId) return
    setBusy(true)
    try {
      const txn = await bankingApi.verifyOtp(otpTxnId, otp)
      setOtpTxnId(null)
      showToast(`Verified · ${txn.status}`)
      if (account) {
        await loadAccount(account.accountNumber, { goDashboard: false })
        if (location.pathname === '/history') await loadHistory()
      }
      setTransferResult({
        tone: 'ok',
        title: 'OTP verified',
        message: `Status: ${txn.status}`,
        id: txn.id,
      })
    } catch (e) {
      showToast(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  function handleSwitch() {
    setAccount(null)
    localStorage.removeItem(SESSION_KEY)
    setTransferResult(null)
    setHistory([])
    navigate('/')
  }

  if (!sessionReady) {
    return (
      <>
        <div className="ambient" aria-hidden="true" />
        <main id="app">
          <p className="muted">Loading…</p>
        </main>
      </>
    )
  }

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <Topbar account={account} apiStatus={apiStatus} onSwitch={handleSwitch} />

      <main id="app">
        <Routes>
          <Route path="/" element={<WelcomeView />} />
          <Route path="/create" element={<CreateAccountView onSubmit={handleCreate} busy={busy} />} />
          <Route path="/signin" element={<SignInView onSubmit={handleSignIn} busy={busy} />} />
          <Route
            path="/dashboard"
            element={
              <RequireAccount account={account}>
                <DashboardView
                  account={account}
                  onRefresh={async () => {
                    setBusy(true)
                    try {
                      await loadAccount(account.accountNumber, { goDashboard: false })
                      showToast('Balance refreshed')
                    } catch (e) {
                      showToast(e.message, true)
                    } finally {
                      setBusy(false)
                    }
                  }}
                  busy={busy}
                />
              </RequireAccount>
            }
          />
          <Route
            path="/transfer"
            element={
              <RequireAccount account={account}>
                <TransferView
                  account={account}
                  onSubmit={handleTransfer}
                  onOpenOtp={setOtpTxnId}
                  result={transferResult}
                  busy={busy}
                />
              </RequireAccount>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAccount account={account}>
                <HistoryView rows={history} loading={historyLoading} onRefresh={loadHistory} onOpenOtp={setOtpTxnId} />
              </RequireAccount>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <OtpDialog open={Boolean(otpTxnId)} transactionId={otpTxnId} onClose={() => setOtpTxnId(null)} onVerify={handleVerifyOtp} />
      <Toast toast={toast} />
    </>
  )
}
