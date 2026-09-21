# Digital Banking System — Full Class Session Script

**Audience:** Students / developers learning microservices  
**Duration:** 75–90 minutes (can cut to 60)  
**Demo URLs (keep these on screen):**
- UI: http://localhost:3000
- API Gateway: http://localhost:8080

---

## Before you start (checklist)

| Check | How |
|------|-----|
| Docker Desktop running | Whale icon in system tray |
| Infra containers UP | `docker ps` → mysql, redis, kafka, zookeeper |
| Java microservices UP | Ports 8080–8085 listening / health URLs |
| UI UP | http://localhost:3000 opens Meridian |

**Quick verify commands:**
```powershell
docker ps
curl.exe http://localhost:8080/actuator/health
curl.exe http://localhost:3000/actuator/health
```

---

# 0. THE BIG QUESTION FIRST (2 min)

## What students see in Docker

> “Open Docker Desktop. You only see **4 containers**: Redis, MySQL, Zookeeper, Kafka.  
> So where are Account, Payment, Transaction, Fraud, Notification, Gateway?”

## Answer (say this clearly)

> “They are **not** in Docker on this machine.  
> They are **Java Spring Boot processes** running on Windows with `java -jar`.  
> Docker = infrastructure. Java = business microservices. UI = Node static server.”

### Two-layer runtime model

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR WINDOWS MACHINE                                       │
│                                                             │
│  ┌─ DOCKER (infrastructure only) ─────────────────────────┐ │
│  │  MySQL :3306                                           │ │
│  │  Redis :6379                                           │ │
│  │  Kafka :9092  (+ Zookeeper inside Docker network)      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ JAVA PROCESSES (microservices) ───────────────────────┐ │
│  │  api-gateway              :8080                        │ │
│  │  account-service          :8081                        │ │
│  │  transaction-service      :8082                        │ │
│  │  payment-service          :8083                        │ │
│  │  fraud-detection-service  :8084                        │ │
│  │  notification-service     :8085                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ NODE (frontend) ──────────────────────────────────────┐ │
│  │  Meridian UI + API proxy  :3000                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Show proof live:**
```powershell
# Docker = only infra
docker ps

# Java services = listening ports
netstat -ano | findstr "8080 8081 8082 8083 8084 8085"

# Or Task Manager → look for multiple java.exe
```

> “If Docker dies, MySQL/Redis/Kafka die.  
> If a Java process dies, only that one microservice dies. That is the microservices idea.”

---

# SESSION AGENDA

| Time | Section | Duration |
|------|---------|----------|
| 0:00 | Why microservices? Problem statement | 5 min |
| 0:05 | Where everything runs (Docker vs Java vs UI) | 8 min |
| 0:13 | Architecture walkthrough | 10 min |
| 0:23 | Each microservice responsibility | 12 min |
| 0:35 | Request path: UI → Gateway → Service | 8 min |
| 0:43 | Kafka + SAGA transfer flow | 12 min |
| 0:55 | Redis roles | 5 min |
| 1:00 | How the UI is built | 10 min |
| 1:10 | Live demo (create + transfer + OTP) | 10–15 min |
| 1:25 | Q&A / common mistakes | buffer |

---

# PART 1 — INTRODUCTION (5 min)

## What to say

> “Banks cannot run everything as one big application.  
> If ‘notifications’ crash, transfers should still work.  
> So we split the bank into **independent services**, each with one job.”

## Learning outcomes

By the end of this class, students should explain:
1. Why Docker has only infra containers here
2. What each microservice does
3. How API Gateway routes traffic
4. How Kafka makes fraud check async
5. How Meridian UI talks to the backend

## Tech stack (write on board)

| Layer | Tech |
|------|------|
| Frontend | HTML / CSS / JS + Node proxy |
| Edge | Spring Cloud Gateway |
| Services | Spring Boot 3.2, Java 17 |
| Data | MySQL |
| Cache / OTP / rate limit | Redis |
| Messaging | Apache Kafka (+ Zookeeper) |
| Packaging | Docker Compose (infra), JAR (services) |

---

# PART 2 — WHERE SERVICES RUN (8 min) ⭐ MOST IMPORTANT

## Script

> “There are **three runtimes** in this project.”

### Runtime A — Docker Compose (infra)

From `docker-compose.yml` we start only:

```powershell
docker compose up -d redis mysql zookeeper kafka
```

| Container | Port on laptop | Purpose |
|-----------|----------------|---------|
| mysql | 3306 | Account / transaction / payment data |
| redis | 6379 | OTP, rate limit, fraud patterns |
| kafka | 9092 | Event bus between services |
| zookeeper | (internal) | Coordinates Kafka brokers |

> “Zookeeper has no host port mapped for app use. Kafka talks to it inside the Docker network.”

### Runtime B — Java microservices (business logic)

Started by `start-all.ps1` (or manually):

```text
java -jar account-service/target/account-service-0.0.1-SNAPSHOT.jar
java -jar transaction-service/target/...
... same for payment, fraud, notification, api-gateway
```

They connect to Docker infra using **localhost**:
- MySQL → `localhost:3306`
- Redis → `localhost:6379`
- Kafka → `localhost:9092`

> “In the YAML source files you may still see hostnames like `mysql` and `kafka:29092`.  
> Those names work **inside Docker network**.  
> Because we run JARs on the host, startup overrides point them to localhost.”

### Runtime C — Frontend

```powershell
.\start-ui.ps1
# runs: node banking-ui/server.js
```

- Serves UI on **:3000**
- Proxies `/api/*` and `/actuator/*` → `http://localhost:8080`

### Why not put services in Docker too?

> “`docker-compose.yml` also has service image definitions pointing to **private AWS ECR**.  
> On a student laptop we usually cannot pull those images.  
> So local mode = Docker for infra + Java JARs for apps. Same architecture, different packaging.”

---

# PART 3 — ARCHITECTURE OVERVIEW (10 min)

## Draw this end-to-end

```
 Browser
   │
   │  http://localhost:3000
   ▼
┌──────────────────────┐
│ Meridian UI (Node)   │  static HTML/CSS/JS
│ + reverse proxy      │  /api → :8080
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ API Gateway :8080    │  routing + rate limiting (Redis)
└──────────┬───────────┘
           │
     ┌─────┼──────────────────┐
     ▼     ▼                  ▼
 Account  Transaction      Payment
 :8081    :8082            :8083
     │        │
     │        │ publish events
     │        ▼
     │     Kafka :9092
     │        │
     │        ├──► Fraud Detection :8084 ──► Redis
     │        │
     │        └──► Notification :8085
     │
     └──► MySQL :3306
```

## What to say

> “User never calls Account Service directly from the browser.  
> Browser → UI → Gateway → correct service.  
> Behind the scenes, services also talk to each other with REST (sync) and Kafka (async).”

---

# PART 4 — EACH MICROSERVICE (12 min)

Open each folder briefly while speaking.

### 1) `api-gateway` — Port 8080

**Job:** Single door to the bank.

Routes (conceptually):
- `/api/v1/accounts/**` → account-service:8081
- `/api/v1/transactions/**` → transaction-service:8082
- `/api/v1/payments/**` → payment-service:8083

Also:
- Rate limiting using Redis (protects APIs from abuse)

> “Gateway is like a bank receptionist. One address for clients.”

### 2) `account-service` — Port 8081

**Job:** Customer accounts and balances.

APIs:
- `POST /api/v1/accounts` — open account
- `GET /api/v1/accounts/{accountNumber}` — details
- `GET /api/v1/accounts/{accountNumber}/balance`
- `PUT .../deduct` and `.../credit` — used by transfer SAGA
- `PUT .../block` — freeze account after fraud/wrong OTP

Stores data in **MySQL** table `accounts`.

### 3) `transaction-service` — Port 8082

**Job:** Money movement orchestration (SAGA).

APIs:
- `POST /api/v1/transactions/transfer`
- `GET /api/v1/transactions/{id}`
- `GET /api/v1/transactions/account/{accountNumber}`
- `POST /api/v1/transactions/{id}/verify?otp=...`

Important statuses:
- `PROCESSING`
- `PENDING_VERIFICATION` (needs OTP)
- `COMPLETED`
- failed / cancelled paths with refund (compensation)

### 4) `fraud-detection-service` — Port 8084

**Job:** Listen to transfer events, decide: clean or suspicious.

Uses Redis patterns (velocity / amount rules).  
Publishes fraud result events back via Kafka.

> “Fraud does not block the HTTP thread forever. It reacts to Kafka events.”

### 5) `notification-service` — Port 8085

**Job:** Alerts — email/SMS style notifications, including OTP.

> “For class demos, open notification-service logs. That is where OTP appears.”

### 6) `payment-service` — Port 8083

**Job:** External payment gateway style flows (orders/webhooks).  
Useful to show another bounded context; transfer demo mainly uses Account + Transaction + Fraud + Notification.

---

# PART 5 — REQUEST PATH WITH UI (8 min)

## Live narration while clicking UI

1. Open http://localhost:3000  
2. Browser loads `index.html`, `styles.css`, `app.js`, `api.js`  
3. Click **Open account**  
4. Form submit → `BankingApi.createAccount(...)` in `api.js`  
5. Browser calls `POST http://localhost:3000/api/v1/accounts`  
6. `server.js` proxies to `POST http://localhost:8080/api/v1/accounts`  
7. Gateway routes to Account Service `:8081`  
8. Account Service writes MySQL and returns JSON  
9. UI shows dashboard with account number + balance

### Say this

> “The UI never hardcodes 8081. It always talks to 3000.  
> The Node proxy hides backend topology from the browser.  
> That avoids CORS pain in local development.”

---

# PART 6 — TRANSFER + KAFKA + SAGA (12 min)

## Story to tell

> “Transfer is not one database update. It is a **distributed workflow**.”

### Happy path (small amount)

```
UI → Gateway → Transaction Service
                 │
                 ├─1─ REST: deduct sender balance (Account Service)
                 ├─2─ save transaction PROCESSING in DB
                 └─3─ Kafka: transaction.initiated
                              │
                              ▼
                         Fraud Service
                              │
                         (clean) Kafka result
                              │
                              ▼
                         Transaction completes
                         credit receiver / publish completed
                              │
                              ▼
                         Notification: "Transfer success"
```

### Suspicious path (large amount / fraud rules)

```
... same until Fraud Service ...
Fraud flags transfer
  → OTP generated, stored in Redis (TTL ~5 min)
  → status = PENDING_VERIFICATION
  → Notification logs/sends OTP
User enters OTP in UI
  → POST /transactions/{id}/verify?otp=XXXXXX
  → if correct: complete transfer
  → if wrong: refund + may block account
  → if expired: refund / cancel
```

### Teaching words

> “This is SAGA: each step has a forward action and a compensate action (refund).  
> Kafka is the async bus so Transaction Service does not tightly couple to Fraud Service.”

### Kafka topics (board)

| Topic | Publisher | Consumer |
|------|-----------|----------|
| `transaction.initiated` | Transaction | Fraud |
| fraud result topics | Fraud | Transaction |
| `transaction.completed` | Transaction | Account / Notification |
| `fraud.detected` | Fraud | Account / Notification |
| OTP related events | Transaction flow | Notification |

---

# PART 7 — REDIS ROLES (5 min)

Redis is shared infrastructure used for different reasons:

| Use | Who | Why |
|-----|-----|-----|
| Rate limiting | API Gateway | Stop flood of requests |
| OTP storage | Transaction / Fraud flow | Short-lived secret with expiry |
| Fraud patterns | Fraud service | Fast counters / recent activity |

> “MySQL = durable truth. Redis = fast temporary state.”

---

# PART 8 — HOW THE UI IS BUILT (10 min) ⭐

Open folder `banking-ui/` on projector.

## File map

```
banking-ui/
├── index.html      ← structure / screens
├── css/styles.css  ← visual design (Meridian theme)
├── js/api.js       ← HTTP calls to backend
├── js/app.js       ← UI logic, navigation, forms
└── server.js       ← static hosting + API proxy
```

## 1) No React/Angular — on purpose

> “For class speed and zero npm dependency hell, UI is **vanilla SPA**:  
> one HTML page, CSS, and JS. Still a real frontend architecture.”

## 2) `index.html` — screens as sections

Views toggled by JS (`data-view`):
- `welcome` — brand landing
- `create` — open account form
- `signin` — enter account number
- `dashboard` — balance + details
- `transfer` — send money
- `history` — list transactions
- OTP `<dialog>` — modal for verification

> “One page app: we hide/show sections instead of full page reloads.”

## 3) `css/styles.css` — design system

Teaching points:
- CSS variables for brand colors (`--teal`, `--ink`, …)
- Fonts: **Syne** (display) + **Manrope** (body)
- Ambient gradient background + light motion (vault ring)
- Responsive layout for mobile

> “UI brand is Meridian. Dark fintech look, not a purple AI template.”

## 4) `js/api.js` — API client

Thin wrapper over `fetch`:
- `createAccount`, `getAccount`, `getBalance`
- `transfer`, `getHistory`, `verifyOtp`
- `health`

All paths are relative (`/api/v1/...`) so browser hits Node on 3000.

## 5) `js/app.js` — application brain

Responsibilities:
- Navigation between views
- Form submit handlers
- Session in `localStorage` (`meridian.accountNumber`)
- Toast messages
- OTP dialog flow
- API health pill (UP/DOWN)

## 6) `server.js` — why it exists

```text
Browser request:
  GET  /                 → serve index.html
  GET  /css/styles.css   → serve file
  POST /api/v1/accounts  → PROXY → http://localhost:8080/api/v1/accounts
  GET  /actuator/health  → PROXY → gateway health
```

> “Frontend developers often use Vite proxy; we built a 40-line Node proxy instead.”

## Start command

```powershell
.\start-ui.ps1
# → http://localhost:3000
```

---

# PART 9 — LIVE DEMO SCRIPT (10–15 min)

Keep narration short; let clicks teach.

### Demo A — Create two accounts

1. UI → Open account → Alice, 50000 Savings  
2. Copy Alice account number  
3. Open account → Bob, 30000 Current  
4. Sign in as Alice → show balance

### Demo B — Clean transfer

1. Transfer ₹1000 Alice → Bob  
2. Expect completed (or processing then completed)  
3. Refresh balances  
4. History shows txn

### Demo C — Fraud / OTP path

1. Transfer large amount (e.g. ₹45000)  
2. UI shows OTP required  
3. Open **notification-service** terminal/logs → copy OTP  
4. Enter OTP in UI  
5. Show completed + updated balances  
6. Optional: wrong OTP demo → explain block/refund behavior

### Parallel teaching while demo runs

> “Watch three windows: UI, Transaction logs, Notification logs.  
> That is distributed systems: one user action, many processes.”

---

# PART 10 — HOW TO RESTART EVERYTHING

```powershell
# 1) Infra
docker compose up -d redis mysql zookeeper kafka

# 2) Microservices (Java JARs)
.\start-all.ps1

# 3) UI
.\start-ui.ps1
```

| URL | What |
|-----|------|
| http://localhost:3000 | Frontend |
| http://localhost:8080 | API Gateway |
| http://localhost:8080/actuator/health | Gateway health |
| http://localhost:8081/actuator/health | Account health |

---

# PART 11 — COMMON STUDENT QUESTIONS (Q&A cheat sheet)

**Q: Why don’t I see account-service in Docker?**  
A: Locally it runs as `java -jar`, not as a container.

**Q: Can all services run in Docker?**  
A: Yes in production-style compose (ECR images). Local class setup uses JARs.

**Q: Why Kafka and also REST?**  
A: REST for immediate command-style calls (deduct balance). Kafka for async reactions (fraud, notify).

**Q: Why API Gateway if UI can call 8081 directly?**  
A: One public entry, routing, cross-cutting concerns (rate limit, future auth).

**Q: Where is OTP stored?**  
A: Redis with expiry; not MySQL.

**Q: What is Zookeeper?**  
A: Kafka’s coordinator in this older Confluent setup. Apps talk to Kafka, not Zookeeper.

**Q: Is Meridian UI production-ready?**  
A: Teaching UI — clear architecture, not a full design system/auth portal.

---

# WHITEBOARD SUMMARY (end of class)

```
UI (:3000) → Gateway (:8080) → Services (:8081–8085)
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
                 MySQL          Redis          Kafka
              (durable)     (fast/temp)     (events)
```

**One-liner to leave them with:**

> “Docker runs the nervous system. Java services are the organs. The UI is the face. Kafka is how organs whisper without shouting over HTTP all the time.”

---

# TEACHER NOTES

- Prefer live UI over only Postman for engagement; keep Postman as backup.  
- If rate limiter errors appear, remind Redis must be healthy.  
- If transfer hangs on PENDING_VERIFICATION, fraud/notification/Kafka path is the debug target.  
- If UI says API DOWN, gateway `:8080` is down — UI can still load static files.  
- Project also has `README1.md` (older Postman-focused 60-min script). This file is the **updated full script including UI + Docker-vs-Java explanation**.
