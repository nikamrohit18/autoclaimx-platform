Perform a full end-to-end smoke test of the AutoClaimX claim pipeline by reading the source code and checking for integration gaps. Do NOT run any services or commands — this is a static code trace only.

## What to check

Work through each stage of the pipeline in order. For each stage, read the relevant source files and verify the integration points listed below.

---

### Stage 1 — FNOL → claim.created Kafka event

Files to read:
- `apps/api-gateway/src/gateway/proxy.controller.ts` — verify SERVICE_MAP routes `claims` → claims-service and `negotiations` → workshop-service
- `apps/claims-service/src/claims/claims.controller.ts` — verify `POST /claims` exists
- `apps/claims-service/src/claims/claims.service.ts` — verify `create()` publishes `KAFKA_TOPICS.CLAIM_CREATED`
- `apps/claims-service/src/workflow/workflow.service.ts` — verify `CLAIM_CREATED` subscriber calls `fraud.scoreBehavioral()`
- `apps/claims-service/src/fraud/fraud.service.ts` — verify `scoreBehavioral()` publishes `KAFKA_TOPICS.FRAUD_SCORE_UPDATED`

Check:
- `ClaimCreatedPayload` fields produced match fields consumed
- `KAFKA_TOPICS` constants used (no hardcoded strings)

---

### Stage 2 — Media upload → media.uploaded → damage + fraud pipeline

Files to read:
- `apps/claims-service/src/claims/media.service.ts` — verify `confirmUpload()` publishes `KAFKA_TOPICS.MEDIA_UPLOADED`
- `packages/shared-types/src/claims.types.ts` — check `MediaUploadedPayload` field names
- `ai-services/damage-detection/app/kafka_worker.py` — check it reads the same field names from the event
- `ai-services/fraud-ml/app/kafka_worker.py` — same check
- `ai-services/damage-detection/app/kafka_worker.py` — check `damage.analyzed` payload field names it publishes
- `apps/claims-service/src/workflow/workflow.service.ts` — check `DAMAGE_ANALYZED` subscriber reads same field names, calls `claims.applyDamageAnalyzed()`
- `apps/claims-service/src/claims/claims.service.ts` — verify `applyDamageAnalyzed()` sets status to `UNDER_ASSESSMENT`

Check:
- Python snake_case field names match TypeScript camelCase counterparts via the shared payload interfaces
- `DamageAnalyzedPayload` fields: `claimId`, `damageReportId`, `overallSeverity`, `totalLossProbability`, `estimatedCostMin`, `estimatedCostMax`, `currency`
- `FraudScoreUpdatedPayload` fields: `claimId`, `fraudScoreId`, `totalScore`, `riskLevel`, `autoHold`, `imageScore?`, `flags?`

---

### Stage 3 — Fraud score → autoHold path

Files to read:
- `apps/claims-service/src/workflow/workflow.service.ts` — `FRAUD_SCORE_UPDATED` subscriber
- `apps/claims-service/src/fraud/fraud.service.ts` — `applyImageScore()` merge logic

Check:
- `autoHold` flag correctly triggers `updateStatus(DISPUTED)`
- `imageScore` field from fraud-ml is the conditional used to distinguish behavioral vs image events
- Two-component merge: behavioral (35%) + image (65%) — verify weights in `applyImageScore()`

---

### Stage 4 — Negotiation start → negotiation.offer.made → NEGOTIATING

Files to read:
- `apps/workshop-service/src/negotiation/negotiation.controller.ts` — verify `POST /negotiations` route
- `apps/workshop-service/src/negotiation/negotiation.service.ts` — verify `startSession()` uses claim currency (not hardcoded), calls `generateAiOffer()`
- `apps/workshop-service/src/negotiation/negotiation.service.ts` — verify `generateAiOffer()` includes `sessionStatus` in `NegotiationOfferMadePayload`
- `packages/shared-types/src/claims.types.ts` — verify `NegotiationOfferMadePayload` has `sessionStatus?: NegotiationStatus`
- `apps/claims-service/src/workflow/workflow.service.ts` — `NEGOTIATION_OFFER_MADE` subscriber: check round=1+AI→NEGOTIATING, AGREED→SETTLED, ESCALATED→DISPUTED

Check:
- Full claim lifecycle is reachable: FNOL_RECEIVED → MEDIA_PROCESSING → UNDER_ASSESSMENT → NEGOTIATING → SETTLED
- No terminal states are unreachable from normal flow

---

### Stage 5 — Workshop counter-offer loop

Files to read:
- `apps/workshop-service/src/negotiation/negotiation.service.ts` — `workshopCounter()`: verify it publishes `NegotiationOfferMadePayload` with offerer=WORKSHOP, then calls `generateAiOffer()` for next round
- Check that `workshopCounter()` Kafka payload also includes `sessionStatus` (it currently doesn't — check if this is still true and flag it if so)

---

### Stage 6 — Seed data integrity

Files to read:
- `packages/db-client/src/seed.ts`
- `packages/shared-types/src/claims.types.ts` — `DetectedDamage`, `LineItem` interfaces

Check:
- `aiDamages` array entries use correct field names: `partLabel`, `damageClass`, `severity`, `confidence`, `recommendation`, `estimatedCostMin`, `estimatedCostMax`, `mediaAssetId`
- `workshopEstimate.lineItems` use `unitCost`/`totalCost` (not `unitPrice`/`total`)
- `workshopEstimate` uses `upsert` with a fixed ID (not `create`) so it survives re-runs
- `negotiationSession.upsert` `where` clause uses a unique field

---

### Stage 7 — API Gateway RBAC routing

Files to read:
- `apps/api-gateway/src/gateway/proxy.controller.ts` — SERVICE_MAP entries and route regex
- `apps/api-gateway/src/auth/roles.guard.ts` — RESOURCE_ROLES map

Check:
- All resources used by web-insurer and web-workshop (`claims`, `negotiations`, `workshops`, `users`, `tenants`, `auth`) are present in SERVICE_MAP
- RBAC guard doesn't block legitimate role/resource combinations (e.g. WORKSHOP_ADMIN can reach `negotiations`)

---

### Stage 8 — Frontend API alignment

Files to read:
- `apps/web-insurer/src/lib/api.ts` — all API call URLs and request body shapes
- `apps/web-workshop/src/lib/api.ts` — same

Check:
- URLs in the frontend match the controller routes in the backend (e.g. `POST /negotiations` not `/claims/:id/negotiation`)
- Request body field names match DTO field names in NestJS controllers
- `negotiationsApi.counter(sessionId, { amount, message })` matches the counter endpoint signature

---

## How to report

After reading all files, produce a report with two sections:

**PASSED** — list each check that looks correct (one line each)

**ISSUES** — for each problem found:
- Severity: CRITICAL / WARNING / INFO
- File and line number
- What is wrong
- What the fix should be

If everything passes, say so explicitly. Do not speculate about runtime behaviour — only report what is visible in the code.
