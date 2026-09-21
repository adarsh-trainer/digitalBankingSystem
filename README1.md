# Digital Banking System — 1 Hour Session Script
## Microservices, Kafka, Redis & Live Postman Demo

**Audience:** Developers learning microservices architecture  
**Duration:** 60 minutes  
**Prerequisites running before session:** Docker + all 5 microservices UP  
**Demo tool:** Postman  
**Base URL:** `http://localhost:8080`

---

## Session Agenda (60 min)

| Time | Section | Duration |
|------|---------|----------|
| 0:00 | Introduction & Problem Statement | 5 min |
| 0:05 | Architecture Overview | 8 min |
| 0:13 | Infrastructure Layer (Docker) | 7 min |
| 0:20 | Microservices Deep Dive | 12 min |
| 0:32 | Inter-Service Communication | 8 min |
| 0:40 | Kafka Integration | 10 min |
| 0:50 | Redis Integration | 5 min |
| 0:55 | Live Postman Demo (Both Flows) | 5 min* |

*Extend demo to 15 min if skipping Q&A, or run demo during Kafka/Redis sections.*

---

# PART 1: INTRODUCTION (0:00 – 0:05)

## What to say

> "Today we'll build understanding of a **real-world Digital Banking System** using microservices. This is not a monolith — it's **6 independent Spring Boot services** that communicate via **REST**, **Kafka**, and **Redis**.
>
> By the end you'll understand:
> - Why we split into microservices
> - How money transfer works across services (SAGA pattern)
> - How Kafka enables async, decoupled communication
> - How Redis handles rate limiting, fraud detection, and OTP
> - How to test everything with Postman"

## Key points to mention

- **Tech stack:** Java 17, Spring Boot 3.2, MySQL, Kafka, Redis, Docker
- **No frontend** — API-only, tested via Postman
- **Inspired by:** Real banking patterns (fraud check, OTP verification, notifications)

## Show on screen

```
Project folder structure:
├── api-gateway/
├── account-service/
├── transaction-service/
├── fraud-detection-service/
├── notification-service/
├── payment-service/
└── docker-compose.yml
```

---

# PART 2: ARCHITECTURE OVERVIEW (0:05 – 0:13)

## What to say

> "Every user request hits **one entry point** — the API Gateway on port 8080. The gateway routes to the correct microservice. Backend services don't talk to the user directly."

## Draw / show this diagram

```
                    ┌─────────────────┐
                    │   YOU (Postman) │
                    └────────┬────────┘
                             │ HTTP
                             ▼
                    ┌─────────────────┐
                    │   API Gateway   │ :8080
                    │  (Rate Limiter) │──────► Redis
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │   Account   │    │ Transaction │    │   Payment   │
  │   :8081     │    │   :8082     │    │   :8083     │
  └──────┬──────┘    └──────┬──────┘    └─────────────┘
         │                  │
         │    ┌─────────────┼─────────────┐
         │    │             │             │
         │    ▼             ▼             ▼
         │  Kafka       Redis         MySQL
         │    │
         │    ├──────────► Fraud Detection :8084 ──► Redis
         │    │
         │    └──────────► Notification :8085
         │
         └──────► MySQL (account_db)
```

## Services table — memorize this

| Service | Port | Database | Kafka Role | Redis Role |
|---------|------|----------|------------|------------|
| API Gateway | 8080 | None | None | Rate limiting |
| Account Service | 8081 | account_db | Consumer | None |
| Transaction Service | 8082 | transaction_db | Producer + Consumer | OTP storage |
| Payment Service | 8083 | payment_db | Producer | None |
| Fraud Detection | 8084 | None | Producer + Consumer | Fraud patterns |
| Notification Service | 8085 | None | Consumer only | None |

## Why microservices?

| Monolith | Microservices (this project) |
|----------|------------------------------|
| One big app | Independent deployable services |
| Scale everything together | Scale fraud detection separately |
| One DB | Database per service |
| Tight coupling | Loose coupling via Kafka events |

---

# PART 3: INFRASTRUCTURE (0:13 – 0:20)

## What to say

> "Before any Java service starts, we need infrastructure. Docker Compose runs 4 containers."

## Show docker-compose.yml

```bash
docker compose up -d
docker ps
```

| Container | Port | Purpose |
|-----------|------|---------|
| **MySQL 8.0** | 3306 | Persistent data — accounts, transactions, payments |
| **Redis** | 6379 | In-memory — fast counters, OTP, rate limits |
| **Zookeeper** | 2181 | Kafka cluster coordination |
| **Kafka** | 9092 | Message broker — event bus between services |

## Explain each

### MySQL
- Each service has its **own database** (microservice best practice)
- `account_db`, `transaction_db`, `payment_db`
- Hibernate `ddl-auto: update` creates tables automatically
- Credentials: `root` / `root`

### Redis
- **In-memory** key-value store
- Data can **expire** (TTL) — perfect for OTP
- **Extremely fast** — used for counters and temporary data
- NOT for permanent storage

### Kafka
- **Distributed message broker**
- Services **publish** events to **topics**
- Other services **subscribe** and consume
- Messages **persist** on disk until retention period
- If a consumer is down, messages wait in the topic

### How Kafka stores messages

> "Kafka stores messages in **topics**. Each topic is split into **partitions**. Messages are appended to the end — like a log file. Consumers track their **offset** (position). In our project, `KAFKA_AUTO_CREATE_TOPICS_ENABLE: true` means topics are created automatically when first used."

```
Topic: transaction.initiated
┌──────────────────────────────────────────────┐
│ Partition 0                                  │
│ [msg1] [msg2] [msg3] [msg4] ...              │
│   ↑                              ↑           │
│ offset 0                      offset 3       │
└──────────────────────────────────────────────┘
         Fraud Detection Service reads from offset
```

---

# PART 4: MICROSERVICES DEEP DIVE (0:20 – 0:32)

## 4.1 API Gateway (port 8080) — 2 min

**File:** `api-gateway/src/main/resources/application.yml`

**What to say:**
> "Gateway is the **single entry point**. It routes by URL path and applies **rate limiting** using Redis."

| Route | Path | Target |
|-------|------|--------|
| account-service | `/api/v1/accounts/**` | localhost:8081 |
| transaction-service | `/api/v1/transactions/**` | localhost:8082 |
| payment-service | `/api/v1/payments/**` | localhost:8083 |

**Rate limits:**
- Accounts & Transactions: 10 requests/sec, burst 20
- Payments: 5 requests/sec, burst 10

**Show code:** `RateLimiterConfig.java` — uses client IP as key for Redis counter.

---

## 4.2 Account Service (port 8081) — 3 min

**Responsibility:** Account lifecycle and balance management

**Database:** `account_db` → table `accounts`

**REST Endpoints (AccountController.java):**

| Method | Endpoint | Who calls it |
|--------|----------|--------------|
| POST | `/api/v1/accounts` | User (Postman) |
| GET | `/api/v1/accounts/{id}` | User |
| GET | `/api/v1/accounts/{id}/balance` | User, Fraud Service |
| PUT | `/api/v1/accounts/{id}/deduct` | Transaction Service (Feign) |
| PUT | `/api/v1/accounts/{id}/credit` | Transaction Service (Feign) |
| PUT | `/api/v1/accounts/{id}/block` | User / Kafka event |

**Kafka Consumers (AccountService.java):**
- `transaction.completed` → Credit receiver account
- `fraud.detected` → Block fraudulent account

**Entity fields:** accountNumber, holderName, email, phone, accountType, status, balance, dailyTransactionLimit

---

## 4.3 Transaction Service (port 8082) — 3 min

**Responsibility:** Money transfers using **SAGA pattern**

**Database:** `transaction_db` → table `transactions`

**Why SAGA?**
> "Transfer involves multiple steps across services. If step 3 fails, we must **compensate** (undo) step 1. That's the SAGA pattern."

**SAGA steps:**
1. Deduct from sender (sync HTTP to Account Service)
2. Save transaction as PROCESSING
3. Publish `transaction.initiated` to Kafka
4. Wait for fraud check result
5. Complete OR compensate (refund)

**REST Endpoints:**
- `POST /api/v1/transactions/transfer` — Start transfer
- `GET /api/v1/transactions/{id}` — Get status
- `GET /api/v1/transactions/account/{accountNumber}` — History
- `POST /api/v1/transactions/{id}/verify?otp=xxx` — Verify OTP

**Transaction statuses:** PROCESSING → PENDING_VERIFICATION → COMPLETED / FLAGGED / FAILED

---

## 4.4 Fraud Detection Service (port 8084) — 2 min

**Responsibility:** Real-time fraud analysis

**No database** — stateless except Redis

**3 Fraud rules (FraudDetectionService.java):**

| Rule | Redis Key | Threshold |
|------|-----------|-----------|
| Velocity | `fraud:velocity{account}` | Max 5 txns in 60 seconds |
| Amount | `fraud:avg_amount{account}` | Amount > 3× running average |
| Balance | HTTP call to Account Service | Amount > 90% of balance |

**If suspicious:** Publish `verification.required`  
**If clean:** Publish `fraud.check.clean`

---

## 4.5 Notification Service (port 8085) — 1 min

**Responsibility:** Send alerts (logs to console — no real email/SMS)

**Kafka consumer only** — listens to 6 topics:
- `transaction.completed` → Debit + Credit alerts
- `transaction.otp.generated` → OTP message
- `fraud.detected` → Account blocked alert
- `transaction.refunded` → Refund alert
- `payment.completed` / `payment.failed`

**Demo tip:** Keep this terminal visible — OTP appears here!

---

## 4.6 Payment Service (port 8083) — 1 min (optional)

**Responsibility:** Razorpay payment integration  
**Note:** Requires Razorpay API keys — skip in demo unless configured  
**Kafka:** Publishes `payment.completed` and `payment.failed`

---

# PART 5: INTER-SERVICE COMMUNICATION (0:32 – 0:40)

## What to say

> "Services communicate in **two ways**: synchronous (HTTP) and asynchronous (Kafka)."

## 5.1 Synchronous — REST + OpenFeign

**When used:** When one service needs an **immediate response**

**Example:** Transaction Service deducts balance from Account Service

```
Transaction Service                    Account Service
       │                                     │
       │  PUT /api/v1/accounts/xxx/deduct   │
       │  ?amount=1000                        │
       │────────────────────────────────────►│
       │                                     │ MySQL: balance -= 1000
       │◄────────────────────────────────────│
       │  "Balance deducted successfully"     │
```

**Code:** `AccountServiceClient.java` (Feign interface)

```java
@FeignClient(name = "account-service", url = "${account.service.url}")
public interface AccountServiceClient {
    @PutMapping("/api/v1/accounts/{accountNumber}/deduct")
    String deductBalance(@PathVariable String accountNumber,
                         @RequestParam BigDecimal amount);
}
```

**Feign** = declarative HTTP client. Spring generates the implementation.

**Who uses Feign:**
- Transaction Service → Account Service (deduct, credit, balance)
- Fraud Detection Service → Account Service (get balance)

## 5.2 Asynchronous — Apache Kafka

**When used:** When services should be **decoupled** — fire and forget

**Example:** Transaction completed → notify Account + Notification without waiting

```
Transaction Service          Kafka              Account Service
       │                       │                       │
       │ publish               │                       │
       │ "transaction.        │                       │
       │  completed"          │                       │
       │──────────────────────►│                       │
       │                       │ deliver               │
       │                       │──────────────────────►│
       │                       │                       │ credit receiver
```

**Benefits:**
- Transaction Service doesn't know Notification Service exists
- If Notification is down, messages wait in Kafka
- Easy to add new consumers without changing producers

## Communication summary table

| From | To | Type | Purpose |
|------|-----|------|---------|
| Postman | API Gateway | HTTP | All user requests |
| Gateway | Account/Transaction/Payment | HTTP | Routing |
| Transaction | Account | Feign HTTP | Deduct/credit balance |
| Fraud Detection | Account | Feign HTTP | Get balance |
| Transaction | Kafka | Async | Publish events |
| Fraud Detection | Kafka | Async | Fraud results |
| Account | Kafka | Async | Listen for credit/block |
| Notification | Kafka | Async | Listen for alerts |

---

# PART 6: KAFKA INTEGRATION (0:40 – 0:50)

## What to say

> "Kafka is the **nervous system** of our application. Let's trace every topic."

## 6.1 Configuration (all services)

```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: StringSerializer
      value-serializer: JsonSerializer
    consumer:
      group-id: <service-name>-group
      value-deserializer: JsonDeserializer
```

## 6.2 Complete Topic Map

| Topic | Publisher | Consumer(s) | Payload |
|-------|-----------|-------------|---------|
| `transaction.initiated` | Transaction | Fraud Detection | transactionId, sender, receiver, amount |
| `verification.required` | Fraud Detection | Transaction | transactionId, accountNumber, reason |
| `fraud.check.clean` | Fraud Detection | Transaction | transactionId, isFraud: false |
| `transaction.otp.generated` | Transaction | Notification | transactionId, otp, accountNumber |
| `transaction.completed` | Transaction | Account, Notification | transactionId, sender, receiver, amount |
| `transaction.refunded` | Transaction | Notification | transactionId, sender, amount, reason |
| `fraud.detected` | Transaction | Account, Notification | accountNumber, reason |
| `payment.completed` | Payment | Notification | paymentId, accountNumber, amount |
| `payment.failed` | Payment | Notification | paymentId, accountNumber, reason |

## 6.3 How to publish (Producer)

**Code in TransactionService.java:**

```java
kafkaTemplate.send("transaction.initiated", transactionId, event);
//             topic name          message key    payload object
```

- **Topic:** Channel name (like a radio frequency)
- **Key:** Used for partitioning (same key → same partition)
- **Value:** JSON-serialized Java object or Map

## 6.4 How to consume (Consumer)

**Code in AccountService.java:**

```java
@KafkaListener(topics = "transaction.completed")
public void consumeTransactionCompleted(@Payload Map<String, Object> payload) {
    String receiverAccount = (String) payload.get("receiverAccountNumber");
    BigDecimal amount = new BigDecimal(payload.get("amount").toString());
    creditBalance(receiverAccount, amount);
}
```

- `@KafkaListener` — Spring auto-registers consumer
- `group-id` — multiple instances share work; each message consumed once per group

## 6.5 Full Kafka flow — Normal Transfer

```
1. transaction.initiated     Transaction ──────► Fraud Detection
2. fraud.check.clean         Fraud Detection ──► Transaction
3. transaction.completed     Transaction ──────► Account + Notification
```

## 6.6 Full Kafka flow — Suspicious Transfer

```
1. transaction.initiated       Transaction ──────► Fraud Detection
2. verification.required       Fraud Detection ──► Transaction
3. transaction.otp.generated   Transaction ──────► Notification
4. (user verifies OTP in Postman)
5. transaction.completed       Transaction ──────► Account + Notification
```

## 6.7 Full Kafka flow — Wrong OTP

```
1-3. Same as above
4. fraud.detected              Transaction ──────► Account + Notification
5. transaction.refunded        Transaction ──────► Notification
```

---

# PART 7: REDIS INTEGRATION (0:50 – 0:55)

## What to say

> "Redis is our **fast, temporary memory**. Three distinct use cases."

## 7.1 API Gateway — Rate Limiting

- **Key:** Client IP address
- **Value:** Request count
- **TTL:** Sliding window per second
- **Config:** `replenishRate: 10`, `burstCapacity: 20`
- **On exceed:** HTTP 429 Too Many Requests

## 7.2 Fraud Detection — Pattern Tracking

| Redis Key | Operation | TTL | Purpose |
|-----------|-----------|-----|---------|
| `fraud:velocity{account}` | INCR | 60 sec | Count transactions per minute |
| `fraud:avg_amount{account}` | GET/SET | Permanent | Running average amount |

**Velocity example:**
```
Transfer 1: INCR → 1, EXPIRE 60s
Transfer 2: INCR → 2
...
Transfer 6: INCR → 6 → FRAUD (>5)
```

## 7.3 Transaction Service — OTP Storage

| Redis Key | Value | TTL |
|-----------|-------|-----|
| `verification:otp{transactionId}` | `"482917"` | 5 minutes |

**Code:**
```java
redisTemplate.opsForValue().set(otpKey, otp, 5, TimeUnit.MINUTES);
```

**On verify:**
```java
String storedOtp = redisTemplate.opsForValue().get(otpKey);
if (storedOtp == null) → OTP expired, refund
if (!storedOtp.equals(otp)) → Wrong OTP, block account + refund
else → Delete key, complete transaction
```

## Redis vs MySQL vs Kafka

| | Redis | MySQL | Kafka |
|--|-------|-------|-------|
| **Speed** | Fastest (memory) | Slow (disk) | Fast (disk log) |
| **Persistence** | Optional TTL | Permanent | Configurable retention |
| **Use case** | Counters, cache, OTP | Business data | Event streaming |
| **This project** | Rate limit, fraud, OTP | Accounts, transactions | Service events |

---

# PART 8: LIVE POSTMAN DEMO (0:55 – 1:10 or dedicated 15 min)

## Pre-demo checklist

- [ ] Docker: `docker ps` shows mysql, redis, kafka, zookeeper
- [ ] All 5 services health UP
- [ ] Postman collection imported (see `postman-collection.json`)
- [ ] Notification service terminal visible

---

## DEMO STEP 1: Health Check

```
GET http://localhost:8080/actuator/health
```
**Say:** "Gateway is our single entry point. Status UP means Redis connection works too."

---

## DEMO STEP 2: Create Alice

```
POST http://localhost:8080/api/v1/accounts
Content-Type: application/json

{
  "accountHolderName": "Alice Smith",
  "email": "alice@demo.com",
  "phone": "9876543210",
  "accountType": "SAVINGS",
  "initialDeposit": 50000
}
```

**Say:** "Account Service creates record in MySQL. No Kafka yet — simple CRUD."

**Save:** `aliceAccountNumber` from response

---

## DEMO STEP 3: Create Bob

```
POST http://localhost:8080/api/v1/accounts

{
  "accountHolderName": "Bob Jones",
  "email": "bob@demo.com",
  "phone": "9876543211",
  "accountType": "CURRENT",
  "initialDeposit": 30000
}
```

**Save:** `bobAccountNumber`

---

## DEMO STEP 4: Check Balances

```
GET http://localhost:8080/api/v1/accounts/{aliceAccountNumber}/balance
→ 50000

GET http://localhost:8080/api/v1/accounts/{bobAccountNumber}/balance
→ 30000
```

---

## DEMO STEP 5: FLOW A — Normal Transfer ₹1,000

```
POST http://localhost:8080/api/v1/transactions/transfer

{
  "senderAccountNumber": "{{aliceAccountNumber}}",
  "receiverAccountNumber": "{{bobAccountNumber}}",
  "amount": 1000,
  "description": "Rent payment"
}
```

**Say while response returns:**
> "Status is PROCESSING — but watch what happens in the background..."

**Point to terminals:**

| Terminal | What to highlight |
|----------|-------------------|
| Transaction Service | "SAGA START — deducting from sender" |
| Fraud Detection | "Velocity check: count 1. Amount check: OK. CLEAN" |
| Transaction Service | "Received fraud.check.clean — COMPLETED" |
| Account Service | "Crediting receiver from Kafka event" |
| Notification Service | "DEBIT ALERT + CREDIT ALERT" |

**Wait 5 seconds, then:**

```
GET http://localhost:8080/api/v1/accounts/{aliceAccountNumber}/balance → 49000
GET http://localhost:8080/api/v1/accounts/{bobAccountNumber}/balance   → 31000
GET http://localhost:8080/api/v1/transactions/{transactionId}          → COMPLETED
```

**Say:** "Alice deducted immediately. Bob credited asynchronously via Kafka. This is eventual consistency."

---

## DEMO STEP 6: FLOW B — Suspicious Transfer ₹45,000

```
POST http://localhost:8080/api/v1/transactions/transfer

{
  "senderAccountNumber": "{{aliceAccountNumber}}",
  "receiverAccountNumber": "{{bobAccountNumber}}",
  "amount": 45000,
  "description": "Large transfer - fraud test"
}
```

**Say:**
> "₹45,000 is more than 90% of Alice's ₹49,000 balance. Fraud Detection will flag this."

**Point to terminals:**

| Terminal | What to highlight |
|----------|-------------------|
| Fraud Detection | "Balance check FAILED — suspicious!" |
| Transaction Service | "OTP generated, stored in Redis with 5 min TTL" |
| Notification Service | **"Your OTP is: XXXXXX"** ← SHOW THIS |

```
GET http://localhost:8080/api/v1/transactions/{transactionId}
→ status: PENDING_VERIFICATION
```

**Say:** "Money deducted from Alice but NOT yet sent to Bob. Held until OTP verified."

---

## DEMO STEP 7: Verify OTP

```
POST http://localhost:8080/api/v1/transactions/{transactionId}/verify?otp=XXXXXX
```

**Say:** "Transaction Service reads OTP from Redis. Match? Complete. Mismatch? Block account and refund."

**After correct OTP:**
```
GET http://localhost:8080/api/v1/accounts/{aliceAccountNumber}/balance → 4000
GET http://localhost:8080/api/v1/accounts/{bobAccountNumber}/balance   → 76000
```

---

## DEMO STEP 8 (Optional): Wrong OTP

Repeat large transfer, then:
```
POST http://localhost:8080/api/v1/transactions/{transactionId}/verify?otp=000000
```

**Show:**
- Notification: "ACCOUNT BLOCKED"
- Notification: "REFUND PROCESSED"
- Alice gets money back

---

# PART 9: WRAP UP & Q&A (last 5 min)

## Key takeaways slide

1. **Microservices** — independent services, own databases, single responsibility
2. **API Gateway** — one entry point, routing, rate limiting
3. **SAGA pattern** — distributed transaction with compensation
4. **Kafka** — async event-driven communication, loose coupling
5. **Redis** — fast temporary data — rate limits, fraud patterns, OTP
6. **Feign** — sync HTTP between services when immediate response needed

## Common interview questions

| Question | Answer |
|----------|--------|
| Why Kafka over REST for notifications? | Decoupling — Transaction doesn't wait for Notification |
| Why Redis for OTP not MySQL? | TTL auto-expiry, faster, no cleanup job needed |
| What if Kafka is down? | Producers fail; need retry or dead letter queue |
| What is SAGA? | Multi-step distributed transaction with rollback/compensation |
| Database per service? | Yes — account_db, transaction_db, payment_db |

---

# APPENDIX A: Service Startup Order

```powershell
# 1. Infrastructure
docker compose up -d

# 2-6. One terminal each (wait for "Started" before next)
cd account-service && mvn spring-boot:run          # 8081
cd fraud-detection-service && mvn spring-boot:run  # 8084
cd notification-service && mvn spring-boot:run     # 8085
cd transaction-service && mvn spring-boot:run      # 8082
cd api-gateway && mvn spring-boot:run              # 8080
```

---

# APPENDIX B: All Postman Requests

| # | Method | URL | Body |
|---|--------|-----|------|
| 1 | GET | `http://localhost:8080/actuator/health` | — |
| 2 | POST | `http://localhost:8080/api/v1/accounts` | Create Alice JSON |
| 3 | POST | `http://localhost:8080/api/v1/accounts` | Create Bob JSON |
| 4 | GET | `http://localhost:8080/api/v1/accounts/{alice}/balance` | — |
| 5 | GET | `http://localhost:8080/api/v1/accounts/{bob}/balance` | — |
| 6 | GET | `http://localhost:8080/api/v1/accounts/{alice}` | — |
| 7 | POST | `http://localhost:8080/api/v1/transactions/transfer` | ₹1000 transfer |
| 8 | GET | `http://localhost:8080/api/v1/transactions/{txnId}` | — |
| 9 | GET | `http://localhost:8080/api/v1/transactions/account/{alice}` | History |
| 10 | POST | `http://localhost:8080/api/v1/transactions/transfer` | ₹45000 transfer |
| 11 | POST | `http://localhost:8080/api/v1/transactions/{txnId}/verify?otp=XXX` | — |
| 12 | PUT | `http://localhost:8080/api/v1/accounts/{alice}/block` | — |

---

# APPENDIX C: Terminal Cheat Sheet (what to watch)

| Action | Service Terminal | Log keyword |
|--------|------------------|-------------|
| Any API call | API Gateway | Request routed |
| Create account | Account Service | "Account created" |
| Transfer | Transaction Service | "SAGA START" |
| Transfer | Fraud Detection | "Velocity check", "Amount check" |
| Large transfer | Notification Service | "OTP is:" |
| Transfer complete | Account Service | "Crediting account" |
| Transfer complete | Notification Service | "DEBIT ALERT", "CREDIT ALERT" |
| Wrong OTP | Notification Service | "ACCOUNT BLOCKED", "REFUND" |

---

# APPENDIX D: Code Files to Show During Session

| Topic | File to open |
|-------|--------------|
| Gateway routing | `api-gateway/application.yml` |
| Rate limiting | `api-gateway/.../RateLimiterConfig.java` |
| Account REST API | `account-service/.../AccountController.java` |
| Kafka consumer (credit) | `account-service/.../AccountService.java` |
| SAGA transfer | `transaction-service/.../TransactionService.java` |
| Kafka producer | `transaction-service/.../TransactionService.java` |
| OTP + Redis | `transaction-service/.../TransactionEventConsumer.java` |
| Feign client | `transaction-service/.../AccountServiceClient.java` |
| Fraud rules | `fraud-detection-service/.../FraudDetectionService.java` |
| Notifications | `notification-service/.../NotificationService.java` |
| Docker infra | `docker-compose.yml` |

---

**End of Session Script**
