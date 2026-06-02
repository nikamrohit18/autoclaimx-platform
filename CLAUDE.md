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
| Phase 8 | Production Deployment — Dockerfiles, docker-compose.prod, CI/CD | ✅ Done |
| Phase 9 | Observability — structured logging, Prometheus metrics, Grafana dashboards, health checks | ✅ Done |
| Phase 10a | Unit Tests — Jest (56) for 4 NestJS services, pytest (28) for fraud-ml + negotiation-llm | ✅ Done |
| Phase 10b | E2E / Integration Tests — Supertest API flows for all 4 NestJS services (37 tests) | ✅ Done |

---

## Commands

### Production deployment
```sh
# One-time setup — copy and fill in all secrets
cp .env.prod.example .env.prod

# Run DB migrations against the production DB
pnpm db:migrate:prod

# Pull latest images and start all production services
pnpm prod:pull
pnpm prod:up

# Tail production logs
pnpm prod:logs

# Tear down (keeps volumes)
pnpm prod:down
```

### Infrastructure (required before running any service)
```sh
pnpm infra:up          # Start PostgreSQL, MongoDB, Redis, Neo4j, Kafka, Kafka UI
                       # + Prometheus (:9090) + Grafana (:3100)
pnpm infra:down        # Stop infra containers
pnpm up                # Start ALL services + web apps via docker-compose
pnpm down
```

### Observability (Phase 9)
```sh
# Monitoring UIs (started automatically by pnpm infra:up)
# Prometheus:  http://localhost:9090
# Grafana:     http://localhost:3100  (admin / autoclaimx_secret)

# Health endpoints on every NestJS service
GET /api/v1/health        # backward-compatible simple check
GET /api/v1/health/live   # liveness probe (always 200 if process is up)
GET /api/v1/health/ready  # readiness probe (checks DB + memory)

# Metrics endpoint on every service
GET /metrics              # Prometheus scrape endpoint (NestJS and Python services)

# Logs — JSON in production, pretty-printed in development
# Set LOG_LEVEL=debug in .env for verbose output
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

### Testing (Phase 10a unit tests + Phase 10b E2E)
```sh
# NestJS unit tests (Jest + ts-jest) — 56 tests across 4 services
# admin-service: 7  |  api-gateway: 15  |  claims-service: 25  |  workshop-service: 9
pnpm test                                   # all 4 services via Turborepo
pnpm --filter @autoclaimx/admin-service test
pnpm --filter @autoclaimx/api-gateway test
pnpm --filter @autoclaimx/claims-service test
pnpm --filter @autoclaimx/workshop-service test

# NestJS E2E tests (Supertest) — 37 tests across 4 services
# admin-service: 9  |  api-gateway: 12  |  claims-service: 9  |  workshop-service: 7
pnpm --filter @autoclaimx/admin-service test:e2e
pnpm --filter @autoclaimx/api-gateway test:e2e
pnpm --filter @autoclaimx/claims-service test:e2e
pnpm --filter @autoclaimx/workshop-service test:e2e

# Python unit tests (pytest) — 28 tests, no real API calls or external services needed
# fraud-ml: 18  |  negotiation-llm: 10
python -m pytest ai-services/fraud-ml/tests/ -v
python -m pytest ai-services/negotiation-llm/tests/ -v

# No DB/Kafka/Redis/S3 needed for any of the above — all external dependencies are mocked
# Unit test artifacts per NestJS service: jest.config.js + tsconfig.spec.json
# E2E test artifacts per NestJS service: test/jest-e2e.config.js + test/*.e2e-spec.ts
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

### Observability Stack

| Component | Port | Purpose |
|---|---|---|
| Prometheus | 9090 | Metrics scraping + storage |
| Grafana | 3100 | Dashboards (service health, claim pipeline, AI inference) |

**Logging:** All NestJS services use `nestjs-pino` (JSON output). All Python services use `python-json-logger`. Every log line includes `service`, `env`, and `correlationId` (when an HTTP request is in scope). Set `LOG_LEVEL` env var to control verbosity.

**Correlation IDs:** `X-Correlation-ID` is generated by api-gateway middleware for every inbound request. It is forwarded to all downstream HTTP calls and embedded in Kafka `KafkaEvent.correlationId`. Downstream services read it via pino's `genReqId`.

**Metrics:**
- Default Node.js runtime metrics (heap, event loop, GC) on all NestJS services.
- Default HTTP request metrics on all Python FastAPI services.
- Custom business counters: `claims_created_total`, `claim_status_transitions_total`, `kafka_messages_processed_total`, `negotiation_rounds_total`, `negotiation_outcomes_total`.
- Custom histogram: `ai_inference_duration_seconds` (labels: `service`).

**Scrape configs:**
- Dev: `infra/prometheus/prometheus.yml` (uses `host.docker.internal` to reach services running on the host)
- Prod: `infra/prometheus/prometheus.prod.yml` (uses Docker service names — works inside the `autoclaimx` bridge network)

**Grafana dashboards** are auto-provisioned from `infra/grafana/provisioning/`. Add new dashboards as JSON files in `infra/grafana/provisioning/dashboards/json/`.

### Environment

Copy `.env.example` to `.env`. The only secrets needed for local dev without AWS:
- `JWT_SECRET` (any 32+ char string)
- `INTERNAL_SERVICE_SECRET` (any 16+ char string)
- `ANTHROPIC_API_KEY` (required for negotiation-llm and ocr-extraction)

AWS credentials are only needed if testing actual S3 uploads; the services will fail gracefully without them in dev.

---

## Key Conventions

- **New NestJS service:** copy the structure of `claims-service` — `main.ts` calls `validateEnv()` and `app.useLogger(app.get(Logger))`, imports `PrometheusModule` + `LoggerModule` in `AppModule`, health controller at `/health` + `/health/live` + `/health/ready`, tenant header read from `x-internal-tenant-id`.
- **New Kafka producer (NestJS):** copy `apps/workshop-service/src/kafka/kafka.service.ts` — producer-only, `@Global()` module registered in `AppModule`.
- **New Kafka producer + consumer (NestJS):** copy `apps/claims-service/src/kafka/kafka.service.ts` — add `subscribe()` calls inside `OnModuleInit.onModuleInit()` in a `WorkflowService`.
- **New Kafka consumer (Python):** copy `ai-services/damage-detection/app/kafka_worker.py` — threaded consumer started in FastAPI `lifespan`, stopped via `threading.Event`.
- **New Python endpoint:** add Pydantic request/response schemas to the service's `app/schemas.py` before implementing the route.
- **Claim status transitions** are the responsibility of `claims-service` only — other services publish events, never mutate claim status directly.
- **Kafka topic names** must come from `KAFKA_TOPICS` in `@autoclaimx/config`, never hardcoded strings.
- **Fraud score DB** is owned by `claims-service/FraudService`. `fraud-ml` publishes signals; `applyImageScore()` merges them.
- **WorkshopEstimate OCR fields:** always save `subtotal`, `laborTotal`, `partsTotal`, `total`, and `ocrConfidence` from the OCR response — do not leave them as schema defaults.
- **New Python AI service:** add `_setup_logging('service-name')` at module top (copy pattern from `ai-services/damage-detection/app/main.py`), wire `Instrumentator().instrument(app).expose(app)` after `FastAPI()`, and add `/health/live` + `/health/ready` endpoints.
- **New business metric:** define it in the service's `metrics/metrics.module.ts` using `makeCounterProvider` or `makeHistogramProvider`, add it to both `providers` and `exports` arrays, then inject with `@InjectMetric(METRIC_NAME)` in the target service.
- **Correlation ID in Kafka:** pass `correlationId` as the 4th arg to `kafka.publish()` when it is available from the HTTP request context.

### Unit Test Conventions (Phase 10a)

**NestJS (Jest + ts-jest):**
- Config file is `jest.config.js` (CommonJS `.js`, not `.ts`) — no `ts-node` dependency needed. `tsconfig.spec.json` extends the service `tsconfig.json` and includes `src/**/*.ts`.
- Transform pattern is `'^.+\\.ts$'` (TypeScript only). Do **not** use `'(t|j)s'` — it causes ts-jest to try to compile built `.js` dist files from workspace packages.
- Services are instantiated directly with `new Service(mockDep)`, not via `NestJS TestingModule` — avoids DI boilerplate for pure service logic.
- `jest.mock()` is hoisted above all code. Two safe patterns for mocking workspace packages:
  - **`withTenant` pattern** (admin/claims/workshop): define `mockTx` at module level, reference it **inside the callback body** (lazy — runs at test time, not at hoist time). OK to write `jest.mock('@autoclaimx/db-client', () => ({ withTenant: jest.fn((_, fn) => fn(mockTx)) }))`.
  - **`prisma` pattern** (api-gateway): define the mock structure **inline inside the factory**, then get a reference with `require('@autoclaimx/db-client').prisma` after the `jest.mock()` call. Never reference a `const` variable from the outer scope directly in the factory return value.
- Use `toBeCloseTo(n, precision)` for any computed float (fraud scores, weighted sums). Never use `toBe()` for floats.

**Python (pytest):**
- Tests live in `ai-services/<service>/tests/`. Each `tests/` dir has an `__init__.py`.
- The Anthropic client is mocked by patching `app.agents.negotiation_agent.anthropic.Anthropic`. Always pair this with `patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"})` inside the same `with` block — the constructor reads the env var before the client mock intercepts it.
- Patch the **module-local name** (`app.detectors.image_forgery.ela_score`), not the global import path, when patching functions within a module under test.
- No `requirements.txt` install needed to run tests locally if numpy/Pillow are already in the environment; pytest and anthropic are the only test-specific dependencies.

### E2E Test Conventions (Phase 10b)

**NestJS Supertest E2E:**
- Config file is `test/jest-e2e.config.js`; test files are `test/*.e2e-spec.ts`. `tsconfig.spec.json` must include `test/**/*.ts` alongside `src/**/*.ts`.
- Use `import request = require('supertest')` (not `import * as`) — `esModuleInterop` is not set and supertest v7 uses ESM exports; the assignment form avoids TS2349.
- Use **targeted `TestingModule`** (controller + service providers only, no `AppModule`) — avoids pulling in Kafka `OnModuleInit`, PrometheusModule DI, and WebSocket gateways that require real infra.
- Mock metric injection with `{ provide: getToken(METRIC_NAME), useValue: { inc: jest.fn() } }` — import `getToken` from `@willsoto/nestjs-prometheus` (not `getMetricToken`, which does not exist in v6).
- `KafkaService`, `ClaimsGateway`, and any service that connects to external systems must be provided as `useValue` mocks — they implement `OnModuleInit` and will attempt real connections otherwise.
- `OtpService` creates a `new Redis(...)` in its constructor; override it entirely with `.overrideProvider(OtpService).useValue(mockOtp)` rather than mocking the Redis module.
- Set `process.env.JWT_SECRET` at the top of the file (before imports resolve) so `JwtModule`/`JwtStrategy` initialise with a known key.
- **Refresh token pitfall:** `jwtService.verify()` returns the full JWT payload including `iat` and `exp`. Strip those before re-signing — pass only `{ sub, tenantId, role, type }` to `issueTokens()`, otherwise `sign()` throws "payload already has an exp property".
- When a controller returns `null` (e.g. a not-yet-populated relation), the response has no body and Supertest's `res.body` is `{}`. Assert on status only, not on `res.body`.
