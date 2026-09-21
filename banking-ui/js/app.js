(() => {
  const api = window.BankingApi;
  const SESSION_KEY = "meridian.accountNumber";

  const state = {
    account: null,
    pendingTxnId: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function money(n) {
    const val = Number(n ?? 0);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  }

  function toast(message, isError = false) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => {
        el.hidden = true;
      }, 280);
    }, 3200);
  }

  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
    $$(".topnav button[data-nav]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.nav === name)
    );

    const authed = Boolean(state.account);
    $("#topnav").hidden = !authed;

    if (name === "transfer" && state.account) {
      $("#transfer-from").value = state.account.accountNumber;
    }
  }

  function renderAccount() {
    const a = state.account;
    if (!a) return;
    $("#dash-name").textContent = a.accountHolderName;
    $("#dash-number").textContent = a.accountNumber;
    $("#dash-type").textContent = (a.accountType || "").replaceAll("_", " ");
    $("#dash-balance").textContent = money(a.balance);
    $("#dash-email").textContent = a.email;
    $("#dash-phone").textContent = a.phone;
    $("#dash-limit").textContent = money(a.dailyTransactionLimit);
    const chip = $("#dash-status");
    chip.textContent = a.status || "ACTIVE";
    chip.classList.toggle("blocked", a.status === "BLOCKED");
  }

  async function loadAccount(accountNumber, { navigate = true } = {}) {
    const account = await api.getAccount(accountNumber);
    state.account = account;
    localStorage.setItem(SESSION_KEY, account.accountNumber);
    renderAccount();
    if (navigate) showView("dashboard");
    return account;
  }

  function badgeClass(status) {
    return `badge ${(status || "").toLowerCase()}`;
  }

  async function loadHistory() {
    const list = $("#history-list");
    if (!state.account) {
      list.innerHTML = `<p class="muted">Sign in to see history.</p>`;
      return;
    }
    list.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      const rows = await api.getHistory(state.account.accountNumber);
      if (!rows || rows.length === 0) {
        list.innerHTML = `<p class="muted">No transactions yet.</p>`;
        return;
      }
      list.innerHTML = rows
        .map((t) => {
          const needsOtp = t.status === "PENDING_VERIFICATION";
          return `
            <article class="txn">
              <div>
                <strong>${t.description || t.type || "Transfer"}</strong>
                <div class="mono small">${t.senderAccountNumber} → ${t.receiverAccountNumber}</div>
              </div>
              <div class="txn-amount">${money(t.amount)}</div>
              <div class="txn-status">
                <span class="${badgeClass(t.status)}">${t.status}</span>
                <span class="mono small">${t.createdAt || ""}</span>
                ${
                  needsOtp
                    ? `<button type="button" class="btn secondary" data-otp="${t.id}">Verify OTP</button>`
                    : ""
                }
              </div>
            </article>`;
        })
        .join("");
    } catch (e) {
      list.innerHTML = `<p class="muted">${e.message}</p>`;
    }
  }

  function openOtpDialog(transactionId) {
    state.pendingTxnId = transactionId;
    $("#otp-txn-id").textContent = `Transaction: ${transactionId}`;
    const dialog = $("#otp-dialog");
    const input = dialog.querySelector('input[name="otp"]');
    input.value = "";
    dialog.showModal();
    input.focus();
  }

  async function checkApiHealth() {
    const pill = $("#api-status");
    try {
      const h = await api.health();
      const up = h && (h.status === "UP" || h.status === "up");
      pill.textContent = up ? "API UP" : "API ?";
      pill.classList.toggle("up", up);
      pill.classList.toggle("down", !up);
    } catch {
      pill.textContent = "API DOWN";
      pill.classList.remove("up");
      pill.classList.add("down");
    }
  }

  // Navigation
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      e.preventDefault();
      const target = nav.dataset.nav;
      if (["dashboard", "transfer", "history"].includes(target) && !state.account) {
        showView("signin");
        toast("Sign in with an account number first", true);
        return;
      }
      showView(target);
      if (target === "history") loadHistory();
      return;
    }

    const otpBtn = e.target.closest("[data-otp]");
    if (otpBtn) {
      openOtpDialog(otpBtn.dataset.otp);
    }
  });

  $("#btn-switch")?.addEventListener("click", () => {
    state.account = null;
    localStorage.removeItem(SESSION_KEY);
    showView("welcome");
  });

  $("#btn-refresh")?.addEventListener("click", async () => {
    if (!state.account) return;
    try {
      await loadAccount(state.account.accountNumber, { navigate: false });
      toast("Balance refreshed");
    } catch (e) {
      toast(e.message, true);
    }
  });

  $("#btn-history-refresh")?.addEventListener("click", () => loadHistory());

  $("#form-signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const accountNumber = String(fd.get("accountNumber") || "").trim();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await loadAccount(accountNumber);
      toast("Welcome back");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("#form-create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      accountHolderName: String(fd.get("accountHolderName") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      accountType: String(fd.get("accountType")),
      initialDeposit: Number(fd.get("initialDeposit")),
    };
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const account = await api.createAccount(body);
      state.account = account;
      localStorage.setItem(SESSION_KEY, account.accountNumber);
      renderAccount();
      showView("dashboard");
      toast(`Account created: ${account.accountNumber}`);
      e.target.reset();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("#form-transfer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      senderAccountNumber: String(fd.get("senderAccountNumber") || "").trim(),
      receiverAccountNumber: String(fd.get("receiverAccountNumber") || "").trim(),
      amount: Number(fd.get("amount")),
      description: String(fd.get("description") || "").trim() || "Transfer",
    };
    const btn = e.target.querySelector('button[type="submit"]');
    const result = $("#transfer-result");
    btn.disabled = true;
    result.hidden = true;
    try {
      const txn = await api.transfer(body);
      result.hidden = false;
      if (txn.status === "PENDING_VERIFICATION") {
        result.className = "result warn";
        result.innerHTML = `
          <strong>OTP required</strong>
          <p class="muted">Fraud check flagged this transfer. Check notification-service logs for the OTP.</p>
          <p class="mono small">${txn.id}</p>
          <button type="button" class="btn primary" data-otp="${txn.id}">Enter OTP</button>`;
        openOtpDialog(txn.id);
      } else if (txn.status === "COMPLETED") {
        result.className = "result ok";
        result.innerHTML = `
          <strong>Transfer completed</strong>
          <p class="muted">${money(txn.amount)} sent · status ${txn.status}</p>
          <p class="mono small">${txn.id}</p>`;
        await loadAccount(state.account.accountNumber, { navigate: false });
        toast("Transfer completed");
      } else {
        result.className = "result";
        result.innerHTML = `
          <strong>Transfer submitted</strong>
          <p class="muted">Status: ${txn.status}</p>
          <p class="mono small">${txn.id}</p>`;
      }
    } catch (err) {
      result.hidden = false;
      result.className = "result err";
      result.innerHTML = `<strong>Transfer failed</strong><p class="muted">${err.message}</p>`;
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("#form-otp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const otp = String(fd.get("otp") || "").trim();
    if (!state.pendingTxnId) return;
    try {
      const txn = await api.verifyOtp(state.pendingTxnId, otp);
      $("#otp-dialog").close();
      toast(`Verified · ${txn.status}`);
      if (state.account) {
        await loadAccount(state.account.accountNumber, { navigate: false });
        await loadHistory();
      }
      const result = $("#transfer-result");
      if (result && !result.hidden) {
        result.className = "result ok";
        result.innerHTML = `
          <strong>OTP verified</strong>
          <p class="muted">Status: ${txn.status}</p>
          <p class="mono small">${txn.id}</p>`;
      }
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#otp-cancel").addEventListener("click", () => $("#otp-dialog").close());

  async function boot() {
    showView("welcome");
    checkApiHealth();
    setInterval(checkApiHealth, 15000);

    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        await loadAccount(saved);
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }

  boot();
})();
