# Digital Banking System — Complete Session Script (Detailed)
## Gateway → Services → Kafka → Redis → SAGA → Auth for UI + curl Demo

**Duration:** 90–120 minutes  
**Audience:** Developers / students  
**Base URL:** `http://localhost:8080`  
**Prerequisites:** Docker + 5 microservices running  

---

# SESSION AGENDA

| Time | Topic |
|------|-------|
| 0:00 | Introduction & architecture |
| 0:10 | Infrastructure (Docker, MySQL, Redis, Kafka) |
| 0:20 | API Gateway — routing & rate limiting |
| 0:30 | Each microservice explained with code |
| 0:45 | Inter-service communication (Feign + Kafka) |
| 0:55 | Kafka integration — config, produce, consume |
| 1:05 | Redis integration — 3 use cases |
| 1:15 | SAGA pattern — full code walkthrough |
| 1:25 | Live curl demo — Flow A & Flow B |
| 1:40 | Authentication & Authorization for UI |
| 1:50 | Q&A |

---

# SECTION 1: INTRODUCTION

## What to say

> "This is a **Digital Banking System** built as microservices — not a monolith. Six independent Spring Boot apps communicate using **HTTP (Feign)**, **Kafka (events)**, and **Redis (cache/counters)**. There is no UI yet — we test with curl or Postman. Today we trace every request from API Gateway to database and back."

## Project structure

```
Digital-Banking-System-Microservices/
├── api-gateway/              → Port 8080 (entry point)
├── account-service/          → Port 8081 (accounts, balance)
├── transaction-service/      → Port 8082 (transfers, SAGA)
├── payment-service/          → Port 8083 (Razorpay)
├── fraud-detection-service/  → Port 8084 (fraud rules)
├── notification-service/     → Port 8085 (alerts)
├── docker-compose.yml        → MySQL, Redis, Kafka, Zookeeper
├── start-all.ps1             → Startup script
└── postman-collection.json   → Postman import
```

## Services overview table

| Service | Port | DB | Kafka | Redis |
|---------|------|-----|-------|-------|
| API Gateway | 8080 | — | — | Rate limit |
| Account | 8081 | account_db | Consumer | — |
| Transaction | 8082 | transaction_db | Producer+Consumer | OTP |
| Payment | 8083 | payment_db | Producer | — |
| Fraud Detection | 8084 | — | Producer+Consumer | Fraud keys |
| Notification | 8085 | — | Consumer only | — |

---

# SECTION 2: INFRASTRUCTURE CONFIGURATION

## docker-compose.yml — explain line by line

```yaml
redis:
  image: redis:latest
  ports: ["6379:6379"]           # Java apps connect: localhost:6379

mysql:
  image: mysql:8.0
  ports: ["3306:3306"]
  environment:
    MYSQL_ROOT_PASSWORD: root    # Used in all application.yml files

zookeeper:
  environment:
    ZOOKEEPER_CLIENT_PORT: 2181  # Kafka needs this

kafka:
  ports: ["9092:9092"]
  environment:
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"   # Topics auto-created on first publish
```

**Start command:**
```bash
cd D:\Myworkspace\Digital-Banking-System-Microservices
docker compose up -d
docker ps
```

## account-service application.yml — full explanation

```yaml
spring:
  application:
    name: account-service
  datasource:
    url: jdbc:mysql://localhost:3306/account_db?createDatabaseIfNotExist=true
    username: root
    password: root
  jpa:
    hibernate:
      ddl-auto: update          # Auto-create/update tables
  kafka:
    bootstrap-servers: localhost:9092
    consumer:
      group-id: account-service-group
      auto-offset-reset: earliest
      value-deserializer: JsonDeserializer
```

| Property | Meaning |
|----------|---------|
| `account_db` | Separate DB per service (microservice pattern) |
| `ddl-auto: update` | Hibernate creates `accounts` table on startup |
| `bootstrap-servers` | Kafka broker address |
| `group-id` | Consumer group — each message consumed once per group |
| `auto-offset-reset: earliest` | New consumer reads from beginning of topic |

---

# SECTION 3: API GATEWAY — HOW REQUESTS ARE ROUTED

## File: api-gateway/src/main/resources/application.yml

```yaml
server:
  port: 8080                    # ONLY port exposed to clients

spring:
  data:
    redis:
      host: localhost
      port: 6379                # Redis for rate limiting
  cloud:
    gateway:
      routes:
        - id: account-service
          uri: http://localhost:8081
          predicates:
            - Path=/api/v1/accounts/**
          filters:
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20

        - id: transaction-service
          uri: http://localhost:8082
          predicates:
            - Path=/api/v1/transactions/**

        - id: payment-service
          uri: http://localhost:8083
          predicates:
            - Path=/api/v1/payments/**
```

## Routing logic — what to say

```
Client Request URL                          Gateway Action
────────────────────────────────────────────────────────────────
POST /api/v1/accounts                       → forward to :8081
GET  /api/v1/accounts/123/balance           → forward to :8081
POST /api/v1/transactions/transfer          → forward to :8082
POST /api/v1/payments/create-order          → forward to :8083
GET  /actuator/health                       → handled by Gateway itself
```

> "Gateway **preserves the same URL path** when forwarding. Account Service also listens on `/api/v1/accounts/**` — path matches on both sides."

## Rate limiting — RateLimiterConfig.java

```java
@Bean
public KeyResolver keyResolver() {
    return exchange -> Mono.just(
        exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
    );
}
```

**On each request:**
1. Extract client IP
2. Redis key: `request_rate_limiter.{ip}.{routeId}`
3. Under limit → forward | Over limit → HTTP 429

## Gateway request flow diagram

```
curl/Postman/Browser
        │
        ▼
┌───────────────────────────────────┐
│  API GATEWAY :8080                │
│  1. Receive HTTP request          │
│  2. Match Path predicate          │
│  3. Redis rate limit check        │
│  4. Forward to target URI         │
└───────────────┬───────────────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
 :8081       :8082       :8083
 Account   Transaction  Payment
```

---

# SECTION 4: EACH SERVICE — CODE & RESPONSIBILITY

## 4.1 Account Service (:8081)

**Controller:** `AccountController.java`

| Endpoint | Method | Caller |
|----------|--------|--------|
| `/api/v1/accounts` | POST | User via Gateway |
| `/api/v1/accounts/{id}` | GET | User via Gateway |
| `/api/v1/accounts/{id}/balance` | GET | User, Fraud Service |
| `/api/v1/accounts/{id}/deduct` | PUT | Transaction Service (Feign) |
| `/api/v1/accounts/{id}/credit` | PUT | Transaction Service (Feign) |
| `/api/v1/accounts/{id}/block` | PUT | User / Kafka event |

**Kafka consumers in AccountService.java:**
```java
@KafkaListener(topics = "transaction.completed")
public void consumeTransactionCompleted(...) {
    creditBalance(receiverAccount, amount);  // Credit Bob after transfer
}

@KafkaListener(topics = "fraud.detected")
public void consumeFraudDetected(...) {
    blockAccount(accountNumber);             // Block on wrong OTP
}
```

---

## 4.2 Transaction Service (:8082) — SAGA orchestrator

**Controller:** `TransactionController.java`  
**Service:** `TransactionService.java` — **main SAGA file**

| Endpoint | Purpose |
|----------|---------|
| POST `/transfer` | Start SAGA |
| GET `/{id}` | Get status |
| GET `/account/{accountNumber}` | History |
| POST `/{id}/verify?otp=` | OTP verification |

**Feign client:** `AccountServiceClient.java`
```java
@FeignClient(name = "account-service", url = "${account.service.url}")
// account.service.url = http://localhost:8081  (direct, NOT via Gateway)
```

---

## 4.3 Fraud Detection Service (:8084)

**application.yml:**
```yaml
fraud:
  max-transactions-per-minute: 5
  suspicious-amount-multiplier: 3.0
  max-balance-percentage: 0.90
```

**Kafka:** Consumes `transaction.initiated`, publishes `verification.required` or `fraud.check.clean`

---

## 4.4 Notification Service (:8085)

**Kafka consumer only** — 6 `@KafkaListener` methods  
Logs alerts to console (OTP, debit, credit, refund, block)

---

# SECTION 5: INTER-SERVICE COMMUNICATION

## Type 1: Synchronous HTTP (OpenFeign)

**When:** Need immediate response (deduct balance must succeed before continuing)

```
Transaction Service                    Account Service
       │                                     │
       │  PUT /api/v1/accounts/xxx/deduct   │
       │────────────────────────────────────►│
       │◄────────────────────────────────────│
       │  "Balance deducted successfully"     │
```

**Config:** `transaction-service/application.yml`
```yaml
account:
  service:
    url: http://localhost:8081
```

> "Service-to-service calls bypass Gateway — direct port-to-port."

## Type 2: Asynchronous Kafka

**When:** Decouple services — producer doesn't wait for consumer

```
Transaction Service ──publish──► Kafka topic ──deliver──► Fraud Detection
                                                          Notification
                                                          Account Service
```

## Communication summary

| From | To | How | Example |
|------|-----|-----|---------|
| Client | Gateway | HTTP | All API calls |
| Gateway | Services | HTTP proxy | Route by path |
| Transaction | Account | Feign HTTP | deduct/credit |
| Fraud | Account | Feign HTTP | getBalance |
| Transaction | Kafka | Async | transaction.initiated |
| Account | Kafka | Async listen | transaction.completed |

---

# SECTION 6: KAFKA INTEGRATION — FULL DETAIL

## 6.1 Maven dependency (all Kafka services)

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>
```

## 6.2 Configuration template (every Kafka service)

```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      group-id: <service-name>-group
      auto-offset-reset: earliest
      key-deserializer: StringDeserializer
      value-deserializer: JsonDeserializer
      properties:
        spring.json.trusted.packages: "*"
        spring.json.value.default.type: java.util.HashMap
```

## 6.3 How messages are stored in Kafka

```
Topic: transaction.initiated
Partition 0: [msg1][msg2][msg3]...
              ↑              ↑
           offset 0      offset 2

Consumer group "fraud-detection-group" tracks its offset.
If consumer restarts, it continues from last offset.
KAFKA_AUTO_CREATE_TOPICS_ENABLE=true → topic created on first publish.
```

## 6.4 Producer code — how to send

```java
// Inject
private final KafkaTemplate<String, Object> kafkaTemplate;

// Publish
kafkaTemplate.send("transaction.initiated", transactionId, eventObject);
//               topic               key (partition)  JSON payload
```

**TransactionService.java — SAGA Step 2:**
```java
kafkaTemplate.send("transaction.initiated", savedTransaction.getId(), event);
```

## 6.5 Consumer code — how to receive

```java
@KafkaListener(topics = "transaction.initiated", groupId = "fraud-detection-group")
public void consumeTransactionInitiated(@Payload Map<String, Object> payload) {
    fraudDetectionService.checkTransaction(payload);
}
```

## 6.6 Complete topic map with code locations

| Topic | Producer (file) | Consumer (file) |
|-------|-----------------|-----------------|
| `transaction.initiated` | TransactionService.transfer() | TransactionEventConsumer (fraud) |
| `verification.required` | FraudDetectionService | TransactionEventConsumer |
| `fraud.check.clean` | FraudDetectionService | TransactionEventConsumer |
| `transaction.otp.generated` | TransactionEventConsumer | NotificationService |
| `transaction.completed` | TransactionService.completeTransaction() | AccountService, NotificationService |
| `transaction.refunded` | TransactionService.compensateTransaction() | NotificationService |
| `fraud.detected` | TransactionService.blockAccountAndCompensate() | AccountService, NotificationService |

## 6.7 Kafka flow — Normal transfer

```
1. transaction.initiated      Transaction ──► Fraud Detection
2. fraud.check.clean          Fraud Detection ──► Transaction
3. transaction.completed      Transaction ──► Account + Notification
```

## 6.8 Kafka flow — OTP transfer

```
1. transaction.initiated
2. verification.required      Fraud ──► Transaction
3. transaction.otp.generated  Transaction ──► Notification
4. [user verifies OTP via API]
5. transaction.completed      Transaction ──► Account + Notification
```

---

# SECTION 7: REDIS INTEGRATION — FULL DETAIL

## 7.1 Configuration

```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
```

**Maven:**
```xml
<artifactId>spring-boot-starter-data-redis</artifactId>
```

## 7.2 RedisConfig.java (transaction & fraud services)

```java
@Bean
public RedisTemplate<String, String> redisTemplate(RedisConnectionFactory factory) {
    RedisTemplate<String, String> template = new RedisTemplate<>();
    template.setConnectionFactory(factory);
    template.setKeySerializer(new StringRedisSerializer());
    template.setValueSerializer(new StringRedisSerializer());
    return template;
}
```

## 7.3 Use Case 1 — API Gateway rate limiting

- Managed automatically by Spring Cloud Gateway
- Key: client IP + route ID
- Config: `replenishRate: 10`, `burstCapacity: 20`

## 7.4 Use Case 2 — Fraud detection (FraudDetectionService.java)

**Velocity:**
```java
String key = "fraud:velocity" + accountNumber;
Long count = redisTemplate.opsForValue().increment(key);
if (count == 1) redisTemplate.expire(key, 60, TimeUnit.SECONDS);
return count > 5;  // fraud.max-transactions-per-minute
```

**Amount average:**
```java
String avgKey = "fraud:avg_amount" + accountNumber;
String avg = redisTemplate.opsForValue().get(avgKey);
// if amount > 3x average → suspicious
redisTemplate.opsForValue().set(avgKey, newAvg.toString());
```

## 7.5 Use Case 3 — OTP storage

**Store (TransactionEventConsumer.java):**
```java
String otpKey = "verification:otp" + transactionId;
redisTemplate.opsForValue().set(otpKey, otp, 5, TimeUnit.MINUTES);
```

**Verify (TransactionService.verifyOTP()):**
```java
String storedOtp = redisTemplate.opsForValue().get(otpKey);
if (storedOtp == null) → compensate (expired)
if (!storedOtp.equals(otp)) → block + compensate (wrong)
redisTemplate.delete(otpKey);
completeTransaction();
```

## Redis vs MySQL vs Kafka

| | Redis | MySQL | Kafka |
|--|-------|-------|-------|
| Speed | Fastest | Slower | Fast |
| Storage | Memory + TTL | Disk permanent | Disk log |
| Use here | OTP, counters, rate limit | Accounts, transactions | Events |

---

# SECTION 8: SAGA PATTERN — CODE IMPLEMENTATION

## What is SAGA?

> "A money transfer spans multiple services. If a later step fails, we **compensate** (undo) earlier steps. This project uses **choreography SAGA** — each service reacts to events, no central orchestrator."

## SAGA state machine

```
transfer() → PROCESSING
                ├─ fraud clean → COMPLETED
                └─ fraud suspicious → PENDING_VERIFICATION
                        ├─ OTP correct → COMPLETED
                        ├─ OTP wrong → FLAGGED (refund + block)
                        └─ OTP expired → FLAGGED (refund)
```

## Step-by-step code mapping

### STEP 1 — Deduct (forward action)
**File:** `TransactionService.java` → `transfer()`
```java
accountServiceClient.deductBalance(senderAccount, amount);  // Feign → :8081
```
**Compensation:** `creditBalance()` same amount

### STEP 2 — Save + publish
```java
transaction.setStatus(TransactionStatus.PROCESSING);
transactionRepository.save(transaction);
kafkaTemplate.send("transaction.initiated", id, event);
```

### STEP 3 — Fraud check (async)
Fraud Detection consumes Kafka → Redis checks → publishes result

### STEP 4a — Complete (happy path)
```java
// TransactionService.completeTransaction()
transaction.setStatus(TransactionStatus.COMPLETED);
kafkaTemplate.send("transaction.completed", id, event);
// AccountService credits receiver via @KafkaListener
```

### STEP 4b — OTP path
```java
// TransactionEventConsumer → Redis OTP
// TransactionService.verifyOTP() → complete or compensate
```

### COMPENSATION — Refund
```java
// TransactionService.compensateTransaction()
accountServiceClient.creditBalance(senderAccount, amount);  // Undo step 1
transaction.setStatus(TransactionStatus.FLAGGED);
kafkaTemplate.send("transaction.refunded", id, refundEvent);
```

## SAGA files reference

| Concern | File |
|---------|------|
| Start SAGA | TransactionService.transfer() |
| Deduct/Credit | AccountServiceClient + AccountController |
| Complete | TransactionService.completeTransaction() |
| Compensate | TransactionService.compensateTransaction() |
| Credit receiver | AccountService @KafkaListener |

---

# SECTION 9: LIVE CURL DEMO — STEP BY STEP

> Replace `ALICE` and `BOB` with actual account numbers from Step 1 & 2.

## STEP 0 — Health check

```bash
curl -X GET "http://localhost:8080/actuator/health"
```
**Expected:** `{"status":"UP"}`  
**Code:** Gateway actuator — no routing

---

## STEP 1 — Create Alice

```bash
curl -X POST "http://localhost:8080/api/v1/accounts" \
  -H "Content-Type: application/json" \
  -d "{\"accountHolderName\":\"Alice Smith\",\"email\":\"alice@demo.com\",\"phone\":\"9876543210\",\"accountType\":\"SAVINGS\",\"initialDeposit\":50000}"
```

**Code path:**
```
Gateway :8080 → match /api/v1/accounts/** → Redis rate limit → :8081
AccountController.createAccount() → AccountService → MySQL account_db
```

**Save:** `ALICE` = accountNumber from response

---

## STEP 2 — Create Bob

```bash
curl -X POST "http://localhost:8080/api/v1/accounts" \
  -H "Content-Type: application/json" \
  -d "{\"accountHolderName\":\"Bob Jones\",\"email\":\"bob@demo.com\",\"phone\":\"9876543211\",\"accountType\":\"CURRENT\",\"initialDeposit\":30000}"
```

**Save:** `BOB` = accountNumber

---

## STEP 3 — Check balances

```bash
curl "http://localhost:8080/api/v1/accounts/ALICE/balance"
curl "http://localhost:8080/api/v1/accounts/BOB/balance"
```
**Expected:** 50000 and 30000

---

## STEP 4 — FLOW A: Normal transfer ₹1,000

```bash
curl -X POST "http://localhost:8080/api/v1/transactions/transfer" \
  -H "Content-Type: application/json" \
  -d "{\"senderAccountNumber\":\"ALICE\",\"receiverAccountNumber\":\"BOB\",\"amount\":1000,\"description\":\"Rent payment\"}"
```

**Say while explaining — full code path:**

```
1. Gateway :8080 → :8082 (transaction-service)
2. TransactionService.transfer() — SAGA START
3. Feign HTTP → AccountService.deductBalance(ALICE, 1000)
   MySQL: Alice 50000 → 49000
4. MySQL: save transaction status=PROCESSING
5. Kafka PRODUCE: "transaction.initiated"
6. FraudDetectionService:
   Redis: fraud:velocityALICE = 1
   Redis: fraud:avg_amountALICE = 1000
   Result: CLEAN
7. Kafka PRODUCE: "fraud.check.clean"
8. TransactionService.completeTransaction()
   status = COMPLETED
9. Kafka PRODUCE: "transaction.completed"
10. AccountService.creditBalance(BOB, 1000)
    MySQL: Bob 30000 → 31000
11. NotificationService: DEBIT + CREDIT alerts in terminal
```

**Wait 5 seconds, verify:**

```bash
curl "http://localhost:8080/api/v1/accounts/ALICE/balance"   # 49000
curl "http://localhost:8080/api/v1/accounts/BOB/balance"     # 31000
curl "http://localhost:8080/api/v1/transactions/TXN_ID"      # COMPLETED
```

---

## STEP 5 — FLOW B: Suspicious transfer ₹45,000

```bash
curl -X POST "http://localhost:8080/api/v1/transactions/transfer" \
  -H "Content-Type: application/json" \
  -d "{\"senderAccountNumber\":\"ALICE\",\"receiverAccountNumber\":\"BOB\",\"amount\":45000,\"description\":\"Large transfer\"}"
```

**Code path (OTP branch):**

```
1-4. Same deduct + Kafka initiated
5. Fraud: 45000 > 90% of balance → SUSPICIOUS
6. Kafka: "verification.required"
7. TransactionEventConsumer:
   OTP = "482917" (random)
   Redis SET verification:otp{txnId} = "482917" TTL 5min
   status = PENDING_VERIFICATION
8. Kafka: "transaction.otp.generated"
9. Notification terminal: "Your OTP is: 482917"  ← SHOW THIS
```

```bash
curl "http://localhost:8080/api/v1/transactions/TXN_ID"
# Expected: PENDING_VERIFICATION
```

---

## STEP 6 — Verify OTP

```bash
curl -X POST "http://localhost:8080/api/v1/transactions/TXN_ID/verify?otp=482917"
```

**Code path:**
```
Redis GET → match → DELETE key → completeTransaction()
Kafka: transaction.completed → Bob credited
```

```bash
curl "http://localhost:8080/api/v1/accounts/ALICE/balance"   # 4000
curl "http://localhost:8080/api/v1/accounts/BOB/balance"     # 76000
```

---

## STEP 7 — Wrong OTP (optional demo)

```bash
curl -X POST "http://localhost:8080/api/v1/transactions/TXN_ID/verify?otp=000000"
```

**SAGA compensation:**
```
blockAccountAndCompensate()
  → Kafka fraud.detected → Account blocks Alice
  → compensateTransaction() → creditBalance refund
  → Kafka transaction.refunded → Notification alert
```

---

## STEP 8 — Block account

```bash
curl -X PUT "http://localhost:8080/api/v1/accounts/ALICE/block"
```

---

## STEP 9 — Transaction history

```bash
curl "http://localhost:8080/api/v1/transactions/account/ALICE"
```

---

# SECTION 10: AUTHENTICATION & AUTHORIZATION FOR UI

## Current state

> "**No authentication exists today.** Anyone can call any API. For React/Angular UI, we must add JWT security."

## Recommended architecture with UI

```
React UI (localhost:3000)
        │
        │ POST /auth/login → { accessToken, refreshToken }
        ▼
┌─────────────────────────┐
│ Auth Service :9000      │  (NEW — to build)
│ - Register / Login      │
│ - Issue JWT             │
│ - Refresh token         │
└─────────────────────────┘
        │
        │ Authorization: Bearer <JWT>
        ▼
┌─────────────────────────┐
│ API Gateway :8080       │
│ JWT Validation Filter   │  (NEW — add to Gateway)
│ - Verify signature      │
│ - Extract roles         │
│ - 401 if invalid        │
└─────────────────────────┘
        ▼
   Microservices
```

## Phase 1 — Add JWT filter to API Gateway

**pom.xml:**
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

**application.yml:**
```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          secret-key: your-256-bit-secret-key-here
  cloud:
    gateway:
      routes:
        - id: auth-public
          uri: http://localhost:9000
          predicates:
            - Path=/auth/**
        - id: account-service
          uri: http://localhost:8081
          predicates:
            - Path=/api/v1/accounts/**
          filters:
            - name: RequestRateLimiter
```

**SecurityConfig.java (Gateway):**
```java
@Bean
public SecurityWebFilterChain securityFilterChain(ServerHttpSecurity http) {
    return http
        .csrf(ServerHttpSecurity.CsrfSpec::disable)
        .authorizeExchange(ex -> ex
            .pathMatchers("/auth/**", "/actuator/health").permitAll()
            .pathMatchers("/api/v1/**").authenticated()
            .anyExchange().denyAll()
        )
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
        .build();
}
```

## Phase 2 — Auth Service endpoints (new microservice)

```
POST /auth/register
POST /auth/login        → { accessToken, refreshToken, expiresIn }
POST /auth/refresh
POST /auth/logout       → blacklist token in Redis
GET  /auth/me
```

**Login response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "accountNumber": "074599053832"
}
```

## Phase 3 — JWT token contents

```json
{
  "sub": "user-uuid",
  "email": "alice@demo.com",
  "accountNumber": "074599053832",
  "roles": ["ROLE_CUSTOMER"],
  "exp": 1700003600
}
```

## Phase 4 — UI sends token (React example)

```javascript
const token = localStorage.getItem('accessToken');

fetch('http://localhost:8080/api/v1/accounts/074599053832/balance', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

## Phase 5 — Authorization rules

| Endpoint | Role | Rule |
|----------|------|------|
| POST /api/v1/accounts | PUBLIC | Register |
| GET /api/v1/accounts/{id} | CUSTOMER | Own account only |
| POST /api/v1/transactions/transfer | CUSTOMER | Own account as sender |
| PUT /api/v1/accounts/{id}/block | ADMIN | Bank admin only |

**Account Service — check ownership:**
```java
@GetMapping("/{accountNumber}")
public ResponseEntity<AccountResponse> getAccount(
        @PathVariable String accountNumber,
        @AuthenticationPrincipal Jwt jwt) {

    String userAccount = jwt.getClaim("accountNumber");
    if (!userAccount.equals(accountNumber)) {
        throw new AccessDeniedException("Access denied");
    }
    return ResponseEntity.ok(accountService.getAccount(accountNumber));
}
```

## Phase 6 — CORS for UI (add to Gateway)

```yaml
spring:
  cloud:
    gateway:
      globalcors:
        cors-configurations:
          '[/**]':
            allowedOrigins: "http://localhost:3000"
            allowedMethods: GET,POST,PUT,DELETE,OPTIONS
            allowedHeaders: "*"
            allowCredentials: true
```

## Phase 7 — curl with JWT (after auth added)

```bash
# Login
curl -X POST "http://localhost:8080/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@demo.com\",\"password\":\"password123\"}"

# Use token
curl "http://localhost:8080/api/v1/accounts/ALICE/balance" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## Auth implementation options

| Option | Effort | Best for |
|--------|--------|----------|
| Custom Auth Service + JWT | 1–2 weeks | Learning / small projects |
| Keycloak | 3–5 days setup | Production |
| Auth0 / Firebase | 1 day | SaaS, fast MVP |

---

# SECTION 11: TERMINAL CHEAT SHEET

| curl action | Watch terminal |
|-------------|----------------|
| Any request | API Gateway |
| Create account | Account Service |
| Transfer | Transaction Service (SAGA logs) |
| Transfer | Fraud Detection (Redis checks) |
| Large transfer | Notification Service (OTP) |
| Complete transfer | Account Service (credit) |
| Complete transfer | Notification Service (alerts) |

---

# SECTION 12: CODE FILES TO OPEN LIVE

| Topic | File |
|-------|------|
| Gateway routing | `api-gateway/src/main/resources/application.yml` |
| Rate limiting | `api-gateway/.../RateLimiterConfig.java` |
| Account API | `account-service/.../AccountController.java` |
| SAGA start | `transaction-service/.../TransactionService.java` |
| SAGA compensate | `TransactionService.compensateTransaction()` |
| Feign client | `transaction-service/.../AccountServiceClient.java` |
| Kafka producer | `kafkaTemplate.send()` in TransactionService |
| Kafka consumer | `@KafkaListener` in TransactionEventConsumer |
| Redis OTP | `TransactionEventConsumer.java` line 60 |
| Redis fraud | `FraudDetectionService.isVelocityExceeded()` |
| Kafka config | `account-service/application.yml` |
| Account Kafka consumer | `AccountService.consumeTransactionCompleted()` |
| Docker | `docker-compose.yml` |

---

# SECTION 13: Q&A — COMMON QUESTIONS

| Question | Answer |
|----------|--------|
| Why Gateway? | Single entry, routing, rate limit, future auth |
| Why Feign for deduct but Kafka for notify? | Deduct needs sync response; notify is async |
| What if Kafka is down? | Producer fails; need retry/DLQ in production |
| What is SAGA compensation? | Undo previous step — refund deducted amount |
| Where is OTP stored? | Redis `verification:otp{id}` TTL 5 min |
| Why separate DB per service? | Microservice independence |
| How to add auth for UI? | JWT filter on Gateway + Auth service + CORS |

---

# CLOSING LINE

> "We traced a banking request from **curl → Gateway → Redis rate limit → Transaction SAGA → Feign deduct → Kafka fraud → Redis OTP → Kafka complete → Account credit → Notification** — that's production-grade microservices. Your next step: build React UI and add JWT at the Gateway."

---

**Files in this project for your session:**
- `README2.md` — this document (detailed)
- `README1.md` — shorter 1-hour version
- `postman-collection.json` — Postman import
- `start-all.ps1` — auto-start script
