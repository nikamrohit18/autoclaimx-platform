# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

AutoClaimX Platform — AI-powered motor insurance claims negotiation SaaS. This is a **pnpm + Turborepo monorepo** containing NestJS backend services, Next.js web apps, and shared packages. Python AI services (`ai-services/`) live in the same repo but are outside the pnpm workspace.

A sibling repo `autoclaimx-mobile` (Expo/React Native) holds the policyholder mobile app and is maintained separately.

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
pnpm typecheck         # tsc --noEmit across all workspaces
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

---

## Architecture

### Service Map

| Service | Package name | Port | Tech |
|---|---|---|---|
| api-gateway | `@autoclaimx/api-gateway` | 3000 | NestJS — auth, rate-limit, HTTP proxy to downstream |
| claims-service | `@autoclaimx/claims-service` | 3001 | NestJS — FNOL, workflow, S3 uploads, Kafka events |
| workshop-service | `@autoclaimx/workshop-service` | 3002 | NestJS — workshops, estimate OCR, AI negotiation sessions |
| admin-service | `@autoclaimx/admin-service` | 3003 | NestJS — tenants, users, RBAC |
| damage-detection | — | 8001 | Python FastAPI — YOLOv8 inference |
| negotiation-llm | — | 8002 | Python FastAPI — Claude API + LangChain negotiation agent |
| fraud-ml | — | 8003 | Python FastAPI — ELA image forgery, Neo4j graph fraud |
| ocr-extraction | — | 8004 | Python FastAPI — PDF estimate parsing (pdfplumber + Claude API) |
| web-insurer | `@autoclaimx/web-insurer` | 3010 | Next.js 14 — adjuster/insurer dashboard |
| web-workshop | `@autoclaimx/web-workshop` | 3011 | Next.js 14 — workshop staff portal |

### Shared Packages

- **`@autoclaimx/shared-types`** — canonical TypeScript interfaces for all domain objects. Import from here, never redefine domain types in service code.
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

### Kafka Event Flow

All async AI pipeline communication goes through Kafka. Topic constants live in `packages/config/src/index.ts`. The canonical flow:

```
POST /claims  →  claims-service  →  kafka: claim.created
                                 →  kafka: media.uploaded  (after S3 upload confirm)
                                 ←  kafka: damage.analyzed  (from damage-detection)
                                 ←  kafka: fraud.score.updated  (from fraud-ml)
```

`KafkaService` in `apps/claims-service/src/kafka/kafka.service.ts` is the reference implementation — copy this pattern for any new service that needs Kafka.

### AI Negotiation Flow

1. `workshop-service` calls `POST /generate-offer` on `negotiation-llm` (HTTP)
2. `negotiation-llm` runs a LangChain agent backed by Claude `claude-sonnet-4-6`
3. Agent uses prompt templates in `ai-services/negotiation-llm/app/agents/prompt_templates.py`
4. Structured `NegotiationOfferOutput` (Pydantic) is returned and stored in `negotiation_offers` table
5. Negotiation style (`AGGRESSIVE | BALANCED | CUSTOMER_FIRST`) is configurable per tenant via `tenant.config`

### Auth

- **Web staff (insurer/adjuster/workshop):** Email+password → JWT. Verified in api-gateway via `JwtStrategy` (Passport).
- **Policyholders:** Phone OTP → JWT. OTP stored in Redis with 5-minute TTL by `OtpService`.
- **Internal service-to-service:** `X-Internal-Service-Secret` header (checked by downstream services).
- JWT payload shape: `{ sub: userId, tenantId, role, type: 'access' | 'refresh' }`.

### Database

PostgreSQL schema is the source of truth. Key relationships:

```
Tenant → Users, Claims, Workshops
Claim → DamageReport (1:1), FraudScore (1:1), NegotiationSession (1:1)
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
- **New Kafka consumer:** use `KafkaService.subscribe()` inside `OnModuleInit.onModuleInit()`.
- **New Python endpoint:** add Pydantic request/response schemas to the service's `app/schemas.py` before implementing the route.
- **Claim status transitions** are the responsibility of `claims-service` only — other services publish events, never mutate claim status directly.
- **Kafka topic names** must come from `KAFKA_TOPICS` in `@autoclaimx/config`, never hardcoded strings.
