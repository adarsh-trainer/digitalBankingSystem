async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const message =
      (data && (data.message || data.error || data.title)) ||
      (typeof data === 'string' ? data : `Request failed (${res.status})`)
    const err = new Error(message)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export const bankingApi = {
  health: () => api('/actuator/health'),
  createAccount: (body) =>
    api('/api/v1/accounts', { method: 'POST', body: JSON.stringify(body) }),
  getAccount: (accountNumber) =>
    api(`/api/v1/accounts/${encodeURIComponent(accountNumber)}`),
  getBalance: (accountNumber) =>
    api(`/api/v1/accounts/${encodeURIComponent(accountNumber)}/balance`),
  transfer: (body) =>
    api('/api/v1/transactions/transfer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getTransaction: (id) =>
    api(`/api/v1/transactions/${encodeURIComponent(id)}`),
  getHistory: (accountNumber) =>
    api(`/api/v1/transactions/account/${encodeURIComponent(accountNumber)}`),
  verifyOtp: (transactionId, otp) =>
    api(
      `/api/v1/transactions/${encodeURIComponent(transactionId)}/verify?otp=${encodeURIComponent(otp)}`,
      { method: 'POST' },
    ),
}

export function money(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0))
}
