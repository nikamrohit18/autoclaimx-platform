# AutoClaimX Platform

> **AI-powered motor insurance claims negotiation SaaS** — from First Notice of Loss to settled claim, fully automated.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Turborepo](https://img.shields.io/badge/Turborepo-2-EF4444?logo=turborepo&logoColor=white)](https://turbo.build)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-2.2-231F20?logo=apachekafka&logoColor=white)](https://kafka.apache.org)

---

## Overview

AutoClaimX is a multi-tenant SaaS platform that automates the end-to-end motor insurance claims lifecycle. It combines computer vision (YOLOv8 damage detection), large language model negotiation (Claude via Anthropic API), fraud analytics (image forgery + graph-based fraud networks), and document OCR into a cohesive pipeline that reduces claim cycle time from days to hours.

```
Policyholder submits claim (FNOL)
        │
        ▼
┌───────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Damage Detection │────▶│   Fraud Scoring      │────▶│  AI Negotiation  │
│  (YOLOv8 vision)  │     │  (image + graph ML)  │     │  (Claude LLM)    │
└───────────────────┘     └─────────────────────┘     └──────────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
  Damage report             Auto-hold if high risk      Offer ↔ Counter loop
  with cost estimate        Flag suspicious patterns    until agreement
                                                               │
                                                               ▼
                                                         Claim settled ✓
```

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Service Map](#service-map)
- [Development Commands](#development-commands)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Authentication](#authentication)
- [AI Pipeline](#ai-pipeline)
- [Multi-Tenancy](#multi-tenancy)
- [Kafka Event Flow](#kafka-event-flow)
- [Demo Data](#demo-data)

---

## Features

| Capability | Details |
|---|---|
| **FNOL & Claim Intake** | Structured claim creation with vehicle, incident, and policy data |
| **Media Upload** | Presigned S3 URLs for photos and video; angle-tagged (front, rear, damage close-up, etc.) |
| **AI Damage Detection** | YOLOv8 model classifies damage parts (dent, scratch, crack, broken glass, structural) with severity and cost ranges |
| **Fraud Scoring** | Three-layer scoring — image forgery (ELA), behavioral (claim velocity, inception proximity), graph fraud (Neo4j) |
| **OCR Estimate Parsing** | Workshop PDF estimates extracted with pdfplumber + Claude; line items reconciled against benchmark data |
| **AI Negotiation** | Claude-backed LangChain agent conducts multi-round offer/counter negotiation with configurable style (Aggressive / Balanced / Customer-First) |
| **Adjuster Dashboard** | Next.js insurer portal — claim list, damage viewer, fraud flags, negotiation timeline |
| **Workshop Portal** | Next.js workshop portal — estimate upload, negotiation session view, counter-offer submission |
| **Multi-Tenancy** | Full data isolation per insurer via PostgreSQL RLS; per-tenant negotiation config |
| **Audit Trail** | Immutable event log for every claim state change, AI decision, and human override |

---

## Architecture

AutoClaimX is a **pnpm + Turborepo monorepo** with NestJS microservices, Next.js frontends, and Python FastAPI AI services.

```
autoclaimx-platform/
├── apps/                     # Deployable applications
│   ├── api-gateway/          # Auth, rate-limit, HTTP proxy  :3000
│   ├── claims-service/       # FNOL, workflow, media, Kafka  :3001
│   ├── workshop-service/     # Estimates, negotiation         :3002
│   └── admin-service/        # Tenants, users, RBAC           :3003
├── packages/                 # Shared workspace packages
│   ├── shared-types/         # Canonical TypeScript interfaces
│   ├── db-client/            # Prisma client + withTenant()
│   └── config/               # Zod env schemas + Kafka topics
├── ai-services/              # Python FastAPI AI microservices
│   ├── damage-detection/     # YOLOv8 inference               :8001
│   ├── negotiation-llm/      # Claude + LangChain agent       :8002
│   ├── fraud-ml/             # ELA forgery + Neo4j graph      :8003
│   └── ocr-extraction/       # PDF estimate parser            :8004
└── apps/
    ├── web-insurer/          # Next.js adjuster dashboard     :3010
    └── web-workshop/         # Next.js workshop portal        :3011
```

### Request Flow

```
Client ──▶ api-gateway (:3000)
               │ JWT validation
               │ X-Internal-Tenant-ID injection
               │ Rate limiting (Throttler)
               ▼
   ┌───────────────────────────┐
   │  claims-service (:3001)   │
   │  workshop-service (:3002) │
   │  admin-service (:3003)    │
   └───────────────────────────┘
               │
               ▼ Kafka events
   ┌───────────────────────────┐
   │  damage-detection (:8001) │
   │  fraud-ml (:8003)         │
   │  negotiation-llm (:8002)  │
   │  ocr-extraction (:8004)   │
   └───────────────────────────┘
```

---

## Tech Stack

### Node.js Services

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Package manager | pnpm 9 + Turborepo 2 |
| API framework | NestJS 10 |
| Frontend | Next.js 14 (App Router) |
| ORM | Prisma 5 |
| Messaging | KafkaJS (Apache Kafka) |
| Auth | Passport.js + JWT + Redis OTP |
| Validation | class-validator / Zod |
| Storage | AWS S3 (presigned uploads) |

### Python AI Services

| Service | Technology |
|---|---|
| API framework | FastAPI + Uvicorn |
| Damage detection | YOLOv8 (Ultralytics) |
| LLM negotiation | Anthropic Claude API + LangChain |
| Image fraud | ELA (Error Level Analysis) |
| Graph fraud | Neo4j graph traversal |
| OCR | pdfplumber + Claude API |

### Infrastructure

| Component | Technology |
|---|---|
| Primary DB | PostgreSQL (multi-tenant RLS) |
| Document DB | MongoDB |
| Cache / OTP | Redis |
| Graph DB | Neo4j |
| Message broker | Apache Kafka + Zookeeper |
| Kafka UI | Kafka UI (Provectus) |
| Containerization | Docker Compose |

---

## Repository Structure

```
.
├── apps/
│   ├── api-gateway/            NestJS — auth, JWT, proxy, OTP, WebSocket
│   ├── claims-service/         NestJS — FNOL, media S3, claim workflow, Kafka producer
│   ├── workshop-service/       NestJS — workshops, OCR estimates, AI negotiation sessions
│   ├── admin-service/          NestJS — tenant management, user RBAC
│   ├── web-insurer/            Next.js 14 — adjuster/insurer dashboard (:3010)
│   └── web-workshop/           Next.js 14 — workshop staff portal (:3011)
├── packages/
│   ├── shared-types/           Canonical TypeScript interfaces (Claim, FraudScore, etc.)
│   ├── db-client/              Prisma client singleton, withTenant() helper, seed script
│   └── config/                 Zod env schemas, validateEnv(), KAFKA_TOPICS constants
├── ai-services/
│   ├── damage-detection/       FastAPI — YOLOv8 vehicle damage inference
│   ├── negotiation-llm/        FastAPI — Claude-backed LangChain negotiation agent
│   ├── fraud-ml/               FastAPI — image forgery (ELA) + Neo4j graph fraud
│   └── ocr-extraction/         FastAPI — pdfplumber + Claude estimate parsing
├── infra/
│   └── postgres/               RLS policy SQL scripts
├── docker-compose.infra.yml    Infra containers only (Postgres, Mongo, Redis, Neo4j, Kafka)
├── docker-compose.yml          Full stack (infra + all services)
├── turbo.json                  Turborepo pipeline config
└── pnpm-lock.yaml
```

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Docker Desktop** (for infra containers)
- **Python** 3.11+ (for AI services only)
- **Anthropic API key** (required for `negotiation-llm` and `ocr-extraction`)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/autoclaimx-platform.git
cd autoclaimx-platform
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in:
#   JWT_SECRET (32+ chars)
#   INTERNAL_SERVICE_SECRET (16+ chars, quote the value if it contains #)
#   ANTHROPIC_API_KEY (required for AI services)
```

### 3. Start infrastructure

```bash
pnpm infra:up
# Starts: PostgreSQL, MongoDB, Redis, Neo4j, Kafka, Zookeeper, Kafka UI
```

### 4. Run database migrations and seed

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:migrate    # Apply schema migrations (name: "init")
pnpm db:seed       # Insert demo tenant, users, workshop, and 3 claims
```

### 5. Start all services

```bash
pnpm dev
# Turborepo builds shared packages then starts all apps in watch mode
```

| URL | Service |
|---|---|
| `http://localhost:3000` | API Gateway |
| `http://localhost:3010` | Insurer Dashboard (Next.js) |
| `http://localhost:3011` | Workshop Portal (Next.js) |
| `http://localhost:8080` | Kafka UI |

### 6. Start Python AI services (optional)

```bash
# Each in a separate terminal:
cd ai-services/damage-detection && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001
cd ai-services/negotiation-llm  && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8002
cd ai-services/fraud-ml         && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8003
cd ai-services/ocr-extraction   && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8004
```

---

## Service Map

| Service | Package | Port | Responsibility |
|---|---|---|---|
| api-gateway | `@autoclaimx/api-gateway` | 3000 | JWT auth, OTP, rate-limiting, HTTP proxy to downstream services |
| claims-service | `@autoclaimx/claims-service` | 3001 | FNOL intake, claim workflow, S3 media uploads, Kafka event producer |
| workshop-service | `@autoclaimx/workshop-service` | 3002 | Workshop CRUD, estimate OCR, AI negotiation session orchestration |
| admin-service | `@autoclaimx/admin-service` | 3003 | Tenant provisioning, user management, role-based access control |
| damage-detection | — | 8001 | YOLOv8 inference — detects and classifies vehicle damage in photos |
| negotiation-llm | — | 8002 | Claude + LangChain — generates structured repair cost negotiation offers |
| fraud-ml | — | 8003 | ELA image forgery detection + Neo4j fraud ring analysis |
| ocr-extraction | — | 8004 | Parses workshop PDF estimates into structured line-item JSON |
| web-insurer | `@autoclaimx/web-insurer` | 3010 | Adjuster/insurer dashboard — claim review, fraud flags, negotiation timeline |
| web-workshop | `@autoclaimx/web-workshop` | 3011 | Workshop staff portal — estimate upload, negotiation view, counter-offers |

---

## Development Commands

### Monorepo

```bash
pnpm install          # Install all workspace dependencies
pnpm dev              # Start all apps + services in watch mode
pnpm build            # Build all packages and apps via Turborepo
pnpm lint             # ESLint across all workspaces
pnpm typecheck        # tsc --noEmit across all workspaces
pnpm test             # Jest across all workspaces
```

### Single package

```bash
pnpm --filter @autoclaimx/claims-service dev
pnpm --filter @autoclaimx/web-insurer dev
pnpm --filter @autoclaimx/claims-service test -- --testPathPattern="claims.service"
```

### Database

```bash
pnpm db:generate      # Regenerate Prisma client (run after schema changes)
pnpm db:migrate       # Run Prisma migrations (dev)
pnpm db:push          # Push schema without creating a migration (prototyping)
pnpm db:seed          # Seed demo tenant, users, workshop, and 3 claims
```

### Infrastructure

```bash
pnpm infra:up         # Start all infra containers (detached)
pnpm infra:down       # Stop infra containers
pnpm up               # Start full stack via docker-compose
pnpm down             # Stop full stack
```

> **After changing `packages/db-client/prisma/schema.prisma`** always run `pnpm db:generate` and restart affected services.

---

## Environment Variables

Copy `.env.example` to `.env`. Variables marked **required** must be set before services will start.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DATABASE_SHADOW_URL` | ✅ | Shadow DB for Prisma migrations |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `NEO4J_URI` | ✅ | Neo4j Bolt URI |
| `NEO4J_USER` | ✅ | Neo4j username |
| `NEO4J_PASSWORD` | ✅ | Neo4j password |
| `KAFKA_BROKERS` | ✅ | Comma-separated broker list (`localhost:9092`) |
| `JWT_SECRET` | ✅ | 32+ character secret for JWT signing |
| `INTERNAL_SERVICE_SECRET` | ✅ | 16+ chars; **quote in `.env` if value contains `#`** |
| `ANTHROPIC_API_KEY` | ✅ AI only | Required for `negotiation-llm` and `ocr-extraction` |
| `AWS_ACCESS_KEY_ID` | ⬜ | Optional — S3 uploads fail gracefully without it in dev |
| `AWS_SECRET_ACCESS_KEY` | ⬜ | Optional |
| `S3_MEDIA_BUCKET` | ⬜ | S3 bucket for claim photos/videos |
| `TWILIO_ACCOUNT_SID` | ⬜ | SMS OTP — dev mode logs OTPs to console instead |

---

## Database

PostgreSQL is the primary datastore. The schema is managed with **Prisma** and lives at `packages/db-client/prisma/schema.prisma`.

### Key relationships

```
Tenant ──▶ Users, Claims, Workshops, ApiKeys
Claim  ──▶ DamageReport (1:1), FraudScore (1:1), NegotiationSession (1:1)
           ClaimMedia[], WorkshopEstimate[], AuditEvent[]
NegotiationSession ──▶ NegotiationOffer[] (one per round)
Workshop ──▶ WorkshopEstimate[], NegotiationSession[]
```

### Claim lifecycle

```
FNOL_RECEIVED → MEDIA_PROCESSING → UNDER_ASSESSMENT → NEGOTIATING → SETTLED
                                                               └──▶ DISPUTED
                                                               └──▶ CLOSED
```

Only `claims-service` may transition claim status. Other services publish Kafka events; `claims-service` consumes them and updates state.

### JSON columns

Three `Json` columns hold typed domain data — cast through `@autoclaimx/shared-types` when reading:

| Column | Type |
|---|---|
| `damage_reports.ai_damages` | `DetectedDamage[]` |
| `negotiation_offers.breakdown` | `LineItem[]` |
| `fraud_scores.flags` | `FraudFlag[]` |

---

## Authentication

| Actor | Method | Notes |
|---|---|---|
| Insurers / Adjusters / Workshop staff | Email + password → JWT | Verified in api-gateway via `JwtStrategy` (Passport) |
| Policyholders | Phone OTP → JWT | OTP stored in Redis with 5-minute TTL |
| Service-to-service | `X-Internal-Service-Secret` header | Checked by downstream services |

JWT payload shape:
```json
{ "sub": "userId", "tenantId": "...", "role": "ADJUSTER", "type": "access" }
```

The api-gateway injects `X-Internal-Tenant-ID` on every proxied request. Downstream NestJS services read it via `@Headers('x-internal-tenant-id')`.

---

## AI Pipeline

### Damage Detection (`damage-detection` — port 8001)

- Accepts image URLs or S3 keys
- Runs **YOLOv8** fine-tuned on vehicle damage datasets
- Returns bounding boxes, damage class (`DENT`, `SCRATCH`, `CRACK`, `BROKEN_GLASS`, `STRUCTURAL`, …), severity, and cost range per detected part
- Triggered via Kafka `media.uploaded` event consumed by the service

### AI Negotiation (`negotiation-llm` — port 8002)

- Called by `workshop-service` via HTTP `POST /generate-offer`
- Runs a **LangChain** agent backed by **Claude** (`claude-sonnet-4-6`)
- Receives: damage report, workshop estimate line items, benchmark data, conversation history
- Returns: structured `NegotiationOfferOutput` (recommended total, per-line breakdown, message, confidence, flags)
- Negotiation style (`AGGRESSIVE | BALANCED | CUSTOMER_FIRST`) is configurable per tenant

### Fraud ML (`fraud-ml` — port 8003)

- **Image fraud**: Error Level Analysis (ELA) detects JPEG re-compression artefacts from tampering
- **Graph fraud**: Neo4j query surfaces connected fraud rings (shared phones, workshops, policy holders)
- Combined with behavioral scoring (claim velocity, policy inception proximity) into a composite `FraudScore`

### OCR Extraction (`ocr-extraction` — port 8004)

- Accepts S3 key of a workshop PDF estimate
- Uses **pdfplumber** for table extraction + **Claude API** for structured parsing
- Returns normalized `LineItem[]` with part descriptions, quantities, labour hours, and totals

---

## Multi-Tenancy

Every PostgreSQL table carries a `tenant_id` column. All queries **must** pass through the `withTenant()` helper from `@autoclaimx/db-client`, which sets the PostgreSQL RLS context for the transaction:

```typescript
import { withTenant } from '@autoclaimx/db-client';

const claims = await withTenant(tenantId, (tx) =>
  tx.claim.findMany({ where: { tenantId } })
);
```

RLS policies in `infra/postgres/rls-policies.sql` ensure rows from one tenant are never visible to another, even if `withTenant()` is accidentally omitted.

---

## Kafka Event Flow

All async AI pipeline communication goes through Kafka. Topic names come from `KAFKA_TOPICS` in `@autoclaimx/config` — never hardcode strings.

```
POST /claims  ──▶  claims-service  ──▶  Kafka: claim.created
                                   ──▶  Kafka: media.uploaded     (after S3 confirm)
                                   ◀──  Kafka: damage.analyzed    (from damage-detection)
                                   ◀──  Kafka: fraud.score.updated (from fraud-ml)
                                   ──▶  Kafka: audit.event        (every state change)
```

`KafkaService` in `apps/claims-service/src/kafka/kafka.service.ts` is the reference implementation for any new service that needs Kafka.

---

## Demo Data

Running `pnpm db:seed` inserts the following demo data into the `stellar-insurance` tenant:

### Login credentials (password: `Demo@1234`)

| Email | Role |
|---|---|
| `admin@stellar.com` | INSURER_ADMIN |
| `adjuster@stellar.com` | ADJUSTER |
| `wsadmin@stellar.com` | WORKSHOP_ADMIN |

### Policyholder accounts (phone OTP)

| Phone | Name |
|---|---|
| `+60123456789` | Ahmad Farid |
| `+60198765432` | Siti Noraini |
| `+60111234567` | Kumar Rajan |

### Sample claims

| Claim # | Vehicle | Status | Notes |
|---|---|---|---|
| `ACX-2024-00001` | Perodua Myvi 2021 | UNDER_ASSESSMENT | Rear-end collision, damage report complete |
| `ACX-2024-00002` | Honda City 2022 | NEGOTIATING | Workshop estimate + AI offer round 1 sent |
| `ACX-2024-00003` | Toyota Vios 2020 | SETTLED | Settled at MYR 2,200 |

---

## Related Repositories

| Repo | Description |
|---|---|
| `autoclaimx-mobile` | Expo / React Native policyholder mobile app (separate repo) |

---

## License

Private — All rights reserved. © 2024 AutoClaimX.
