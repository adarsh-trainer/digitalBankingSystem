# Digital Banking System — Microservices

Teaching / demo project: Spring Boot microservices + Kafka + Redis + MySQL + Meridian UI.

## Services Overview

| Service | Port | Responsibility |
|---|---|---|
| **Meridian UI** | **3000** | Browser frontend (proxies API to gateway) |
| api-gateway | 8080 | Single entry point, rate limiting |
| account-service | 8081 | Account management, balance |
| transaction-service | 8082 | Money transfers, history, OTP verify |
| payment-service | 8083 | Payment orders / webhooks |
| fraud-detection-service | 8084 | Fraud checks via Redis + Kafka |
| notification-service | 8085 | Alerts / OTP logs |

## What runs where (important for class)

| Layer | Runs in | Examples |
|------|---------|----------|
| Infrastructure | **Docker** | MySQL, Redis, Kafka, Zookeeper |
| Microservices | **Java JARs on host** | account, transaction, gateway, … |
| Frontend | **Node** | `banking-ui` on port 3000 |

> Docker Desktop will only show MySQL / Redis / Kafka / Zookeeper.  
> Account / Payment / etc. are `java -jar` processes (not containers) in the local student setup.

## Prerequisites

- Java 17+
- Maven (optional if JARs already built under each `*/target`)
- Docker Desktop
- Node.js (for UI)

## How to run (recommended)

```powershell
# 1) Copy env template
copy .env.example .env

# 2) Start infra + all Java microservices
.\start-all.ps1

# 3) Start UI (new terminal)
.\start-ui.ps1
```

Open:
- UI → http://localhost:3000  
- API Gateway → http://localhost:8080  

## Manual alternative

```powershell
# Infra only
docker compose up -d redis mysql zookeeper kafka

# Each service (separate terminals) — after mvn package or with existing JARs
cd account-service; mvn spring-boot:run
cd transaction-service; mvn spring-boot:run
# ... payment, fraud-detection, notification, api-gateway
```

## Architecture

```
Browser → Meridian UI (:3000)
            ↓ proxy /api
         API Gateway (:8080)
            ↓
   Account / Transaction / Payment
            ↓
         Apache Kafka
            ↓
   Fraud Detection + Notification
```

## Kafka topics

| Topic | Publisher | Consumer |
|---|---|---|
| transaction.initiated | Transaction | Fraud Detection |
| fraud.check.result | Fraud Detection | Transaction |
| transaction.completed | Transaction | Account, Notification |
| fraud.detected | Fraud | Account, Notification |
| payment.completed | Payment | Notification |

## Teaching materials

- `CLASS-SESSION-SCRIPT.md` — full classroom script (Docker vs Java, UI, demo flows)
- `postman-collection.json` — API collection
- `README1.md` / `README2.md` — extra session notes

## Project layout

```
├── banking-ui/              # Meridian frontend + Node proxy
├── api-gateway/
├── account-service/
├── transaction-service/
├── payment-service/
├── fraud-detection-service/
├── notification-service/
├── docker-compose.yml       # Infra (MySQL, Redis, Kafka, Zookeeper)
├── start-all.ps1            # Infra + Java services
├── start-ui.ps1             # UI on :3000
└── CLASS-SESSION-SCRIPT.md
```
