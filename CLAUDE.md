# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

AutoClaimX Platform — AI-powered motor insurance claims negotiation SaaS. This is a **pnpm + Turborepo monorepo** containing NestJS backend services, Next.js web apps, and shared packages. Python AI services (`ai-services/`) live in the same repo but are outside the pnpm workspace.

A sibling repo `autoclaimx-mobile` (Expo/React Native) holds the policyholder mobile app and is maintained separately.

### Build Status

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Monorepo bootstrap, Prisma schema, shared packages, service skeletons | ✅ Done |
| Phase 1 | Auth + API Gateway — real DB login/OTP, JWT, proxy error handling | ✅ Done |
| Phase 2 | Core Claims API — FNOL, media upload + confirm, status machine, Kafka events | ✅ Done |
| Phase 3 | AI Pipeline — damage-detection and fraud-ml Kafka consumers | ✅ Done |
| Phase 4 | Workshop & Negotiation — OCR estimates, Claude negotiation agent, Kafka events | ✅ Done |
| Phase 5 | Web UIs — web-insurer and web-workshop connected to real APIs | ✅ Done |
| Phase 6 | Real-time + Analytics — Socket.io live status push, analytics dashboard | ✅ Done |
| Phase 7 | Admin Service + RBAC — service layer, RBAC guard, admin users panel | ✅ Done |
| Phase 8 | Production Deployment — Dockerfiles, docker-compose.prod, CI/CD | 🔜 Next |

---

## Commands

### Infrastructure (required before running any service)
```sh
pnpm infra:up          # Start PostgreSQL, MongoDB, Redis, Neo4j, Kafka, Kafka UI
pnpm infra:down        # Stop infra containers
pnpm up                # Start ALL services + web apps via docker-compose
pnpm down
```

### Database
```sh
pnpm db:generate       # Re-generate Prisma client after schema changes
pnpm db:migrate        # Run Prisma migrations (dev)
pnpm db:push           # Push schema without migration (prototyping only)
pnpm db:seed           # Seed demo tenant, users, workshop, 3 claims
```

### Node.js monorepo
```sh
pnpm install           # Install all workspace dependencies
pnpm build             # Build all packages and apps via Turborepo
pnpm dev               # Start all apps in watch mode
pnpm lint              # ESLint across all workspaces
pnpm typecheck         # tsc --noEmit across all workspaces (12 packages, all must pass)
pnpm test              # Jest across all workspaces
```

### Single package / service
```sh
pnpm --filter @autoclaimx/claims-service dev        # Run one service in watch mode
pnpm --filter @autoclaimx/web-insurer dev           # Run web-insurer on :3010
pnpm --filter @autoclaimx/web-workshop dev          # Run web-workshop on :3011
pnpm --filter @autoclaimx/claims-service test       # Test one service
pnpm --filter @autoclaimx/claims-service test -- --testPathPattern="claims.service"  # Single test file
```

### Python AI services
```sh
cd ai-services/damage-detection
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

cd ai-services/negotiation-llm  # port 8002
cd ai-services/fraud-ml          # port 8003
cd ai-services/ocr-extraction    # port 8004
```

### After changing Prisma schema
Always run `pnpm db:generate` then restart affected services. Schema lives at `packages/db-client/prisma/schema.prisma`.

### After changing shared-types
Run `pnpm --filter @autoclaimx/shared-types build` before typechecking downstream services.

---

## Architecture

### Service Map

| Service | Package name | Port | Tech |
|---|---|---|---|
| api-gateway | `@autoclaimx/api-gateway` | 3000 | NestJS — auth, rate-limit, HTTP proxy to downstream |
| claims-service | `@autoclaimx/claims-service` | 3001 | NestJS — FNOL, workflow, S3 uploads, Kafka events |
| workshop-service | `@autoclaimx/workshop-service` | 3002 | NestJS — workshops, estimate OCR, AI negotiation sessions |
| admin-service | `@autoclaimx/admin-service` | 3003 | NestJS — tenants, users, RBAC |
| damage-detection | — | 8001 | Python FastAPI — YOLOv8 inference + Kafka consumer |
| negotiation-llm | — | 8002 | Python FastAPI — Claude API negotiation agent (HTTP only) |
| fraud-ml | — | 8003 | Python FastAPI — ELA image forgery + Kafka consumer |
| ocr-extraction | — | 8004 | Python FastAPI — PDF estimate parsing (pdfplumber + Claude API) |
| web-insurer | `@autoclaimx/web-insurer` | 3010 | Next.js 14 — adjuster/insurer dashboard |
| web-workshop | `@autoclaimx/web-workshop` | 3011 | Next.js 14 — workshop staff portal |

### Shared Packages

- **`@autoclaimx/shared-types`** — canonical TypeScript interfaces for all domain objects. Import from here, never redefine domain types in service code. Must be rebuilt (`pnpm --filter @autoclaimx/shared-types build`) after changes.
- **`@autoclaimx/db-client`** — Prisma client singleton + `withTenant()` helper. All DB queries must go through `withTenant()` to set the RLS context.
- **`@autoclaimx/config`** — Zod env validation schemas per service (`baseEnvSchema`, `claimsServiceEnvSchema`, etc.) and `KAFKA_TOPICS` constants.

### Multi-tenancy Pattern

Every PostgreSQL table has a `tenant_id` column. All queries **must** use `withTenant(tenantId, tx => ...)` from `@autoclaimx/db-client`:

```ts
import { withTenant } from '@autoclaimx/db-client';

const result = await withTenant(tenantId, (tx) =>
  tx.claim.findMany({ where: { tenantId } })
);
```

The api-gateway injects `X-Internal-Tenant-ID` on every proxied request. Downstream NestJS controllers read it via `@Headers('x-internal-tenant-id')`.

### Claim Status Machine

Only `claims-service` may mutate claim status. Transitions are driven by Kafka events consumed in `WorkflowService`:

```
FNOL_RECEIVED
  → MEDIA_PROCESSING     (first media confirmed via POST /claims/:id/media/confirm)
  → UNDER_ASSESSMENT     (damage.analyzed event received from damage-detection)
  → NEGOTIATING          (negotiation.offer.made event, round=1, offerer=AI)
  → SETTLED              (negotiation resolved via AGREED)
  → CLOSED               (manual close)
  → DISPUTED             (fraud autoHold triggered, or manual dispute)
```

### Full Kafka Event Flow

Topic constants live in `packages/config/src/index.ts`. Never hardcode topic strings.

```
POST /claims
  → claims-service → kafka: claim.created
      → WorkflowService → FraudService.scoreBehavioral() → kafka: fraud.score.updated
                                                         → FraudScore DB (behavioral)

POST /claims/:id/media/confirm
  → claims-service → kafka: media.uploaded
      → damage-detection (Kafka consumer)
          → YOLOv8 inference → kafka: damage.analyzed
              → WorkflowService → applyDamageAnalyzed() → claim: UNDER_ASSESSMENT
      → fraud-ml (Kafka consumer)
          → ELA image forgery → kafka: fraud.score.updated (imageScore set)
              → WorkflowService → FraudService.applyImageScore() → FraudScore DB (merged)

POST /claims/:claimId/negotiation
  → workshop-service → startSession() → generateAiOffer() → negotiation-llm (HTTP)
      → kafka: negotiation.offer.made (round=1, offerer=AI)
          → WorkflowService → claim: NEGOTIATING

POST /claims/:claimId/negotiation/counter
  → workshop-service → workshopCounter() → kafka: negotiation.offer.made (offerer=WORKSHOP)
                     → generateAiOffer() → negotiation-llm (HTTP)
                     → kafka: negotiation.offer.made (offerer=AI, round N)
```

### Fraud Scoring — Two Components

Fraud score is composed of two independent signals merged in `FraudService`:

| Component | Weight | Source | When |
|---|---|---|---|
| Behavioral (claim velocity) | 35% | `claims-service/FraudService.scoreBehavioral()` | On `claim.created` |
| Image forgery (ELA) | 65% | `fraud-ml/kafka_worker.py` via `applyImageScore()` | On `media.uploaded` |

`autoHold` uses raw signal thresholds (not combined score): behavioral ≥ 0.75 or image ≥ 0.90 triggers `DISPUTED`.

### AI Negotiation Flow

1. `workshop-service` calls `POST /generate-offer` on `negotiation-llm` (HTTP), passing real damage report and workshop estimate from DB
2. `negotiation-llm` runs a Claude `claude-sonnet-4-6` agent with style-specific prompts (`AGGRESSIVE | BALANCED | CUSTOMER_FIRST`)
3. Structured `NegotiationOfferOutput` (Pydantic) returned — `should_accept` / `should_escalate` drive session status
4. Offer stored in `negotiation_offers` table; `kafka: negotiation.offer.made` published
5. Round continues until `AGREED`, `ESCALATED` (max rounds), or `ABANDONED`
6. Negotiation style defaults to `BALANCED`; configurable per tenant via `tenant.config.negotiationStyle`

### Auth

- **Web staff (insurer/adjuster/workshop):** Email + password → bcrypt verify → JWT. `loginWithPassword()` in `api-gateway/auth.service.ts` queries tenant by slug then user by email.
- **Policyholders:** Phone OTP → JWT. OTP stored in Redis with 5-minute TTL by `OtpService`.
- **Internal service-to-service:** `X-Internal-Service-Secret` header (checked by downstream services).
- JWT payload shape: `{ sub: userId, tenantId, role, type: 'access' | 'refresh' }`.
- All auth endpoints validated with class-validator DTOs (`auth.dto.ts`).

### Media Upload Flow

Two-step process — presigned URL then confirm:

```
POST /claims/:id/media/upload-url  → returns { uploadUrl, mediaAssetId, s3Key }
  → creates ClaimMedia record (processingStatus: PENDING, sizeBytes: 0)

Client uploads directly to S3 using uploadUrl

POST /claims/:id/media/confirm     → body: { mediaAssetId, s3Key, contentType, sizeBytes }
  → updates ClaimMedia (processingStatus: PROCESSING, sizeBytes)
  → claim status: FNOL_RECEIVED → MEDIA_PROCESSING (updateMany guards re-entry)
  → kafka: media.uploaded
```

### Database

PostgreSQL schema is the source of truth. Key relationships:

```
Tenant → Users, Claims, Workshops
Claim → DamageReport (1:1), FraudScore (1:1), NegotiationSession (1:1), ClaimMedia[]
NegotiationSession → NegotiationOffer[] (rounds)
Workshop → WorkshopEstimate[], NegotiationSession[]
```

`Json` columns (not typed by Prisma): `damage_reports.ai_damages` (array of `DetectedDamage`), `negotiation_offers.breakdown` (array of `LineItem`), `fraud_scores.flags` (array of `FraudFlag`). Cast these through `@autoclaimx/shared-types` when reading.

### Environment

Copy `.env.example` to `.env`. The only secrets needed for local dev without AWS:
- `JWT_SECRET` (any 32+ char string)
- `INTERNAL_SERVICE_SECRET` (any 16+ char string)
- `ANTHROPIC_API_KEY` (required for negotiation-llm and ocr-extraction)

AWS credentials are only needed if testing actual S3 uploads; the services will fail gracefully without them in dev.

---

## Key Conventions

- **New NestJS service:** copy the structure of `claims-service` — `main.ts` calls `validateEnv()`, health controller at `/health`, tenant header read from `x-internal-tenant-id`.
- **New Kafka producer (NestJS):** copy `apps/workshop-service/src/kafka/kafka.service.ts` — producer-only, `@Global()` module registered in `AppModule`.
- **New Kafka producer + consumer (NestJS):** copy `apps/claims-service/src/kafka/kafka.service.ts` — add `subscribe()` calls inside `OnModuleInit.onModuleInit()` in a `WorkflowService`.
- **New Kafka consumer (Python):** copy `ai-services/damage-detection/app/kafka_worker.py` — threaded consumer started in FastAPI `lifespan`, stopped via `threading.Event`.
- **New Python endpoint:** add Pydantic request/response schemas to the service's `app/schemas.py` before implementing the route.
- **Claim status transitions** are the responsibility of `claims-service` only — other services publish events, never mutate claim status directly.
- **Kafka topic names** must come from `KAFKA_TOPICS` in `@autoclaimx/config`, never hardcoded strings.
- **Fraud score DB** is owned by `claims-service/FraudService`. `fraud-ml` publishes signals; `applyImageScore()` merges them.
- **WorkshopEstimate OCR fields:** always save `subtotal`, `laborTotal`, `partsTotal`, `total`, and `ocrConfidence` from the OCR response — do not leave them as schema defaults.
