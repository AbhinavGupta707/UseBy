# Checkpoint 8 Orchestration Control

Checkpoint 7 completed commit: `f9f4c61`.
Checkpoint 8 plan commit: `5f821f3` (`Plan checkpoint 8 external integrations orchestration`).
Worker launch base: `5f821f3`.
Current worker registry commit: pending while CP8 workers are active.

## Outcome

Checkpoint 8 delivers external integrations and AI polish as honest, live product capabilities:

- Receipt or expiry-label uploads are stored privately, can be parsed when Textract/S3 credentials are present, and degrade to explicit unavailable or fixture-parse states when they are not.
- Address and postcode inputs can be geocoded into exact internal geography plus public coarse labels, while public/merchant-facing APIs continue to hide exact household coordinates and direct contact fields.
- In-app notification rows and reminder jobs are generated from current bookings, lending reservations, DemandPool orders, pickup tasks, and surplus drop reservations.
- AI and semantic matching improve copy, explanations, and optional ranking only after deterministic safety, privacy, distance, status, quantity, and eligibility filters have already passed.
- `/proof` and `/api/system/state` expose CP8 integration readiness, rows, job runs, no-key states, and privacy/AI guardrail evidence.

## Product Gates

- No key/no env states must be honest and usable. A missing provider key must not look like a successful live parse, geocode, notification send, or AI decision.
- Uploaded files are private by default. Public APIs must return file IDs/statuses or signed access affordances, not public bucket URLs.
- Do not print or commit plaintext secrets. Secret ARNs and non-secret resource IDs are acceptable.
- AI output is copy, explanation, summarisation, or secondary ranking only. AI cannot decide eligibility, payment, trust, safety, reservation capacity, or household visibility.
- pgvector or embeddings may only run after deterministic filters. Deterministic filters remain the source of truth.
- Exact household coordinates, unit labels, personal email addresses, phone numbers, raw addresses, and raw need locations must not be exposed in public, merchant, proof, or heatmap DTOs.
- Keep Stripe/payment, card authorization, deposit, captured-charge, payment ledger, and paid commitment state out of CP8.
- Existing grocery, booking, lending, DemandPool, surplus drop, trust, proof, reset, and no-env behavior must continue to pass.

## Lane Split

### Lane 8A - S3 And Textract Ingestion

Owns private upload records, signed access, Textract parsing adapters, fixture fallback, and receipt/label parse APIs.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/storage/**`
- `useby-app/src/server/textract/**`
- `useby-app/src/server/grocery/**`
- `useby-app/src/app/api/grocery/**`
- `useby-app/src/app/api/system/**` only for CP8 storage/Textract state shape
- `useby-app/src/server/seed/**` only for cleanup/no-final-output contracts
- `.env.example` only for non-secret provider variable names
- focused tests for storage, Textract, grocery import, schema, and no-key behavior

Must deliver:

- Storage/Textract runtime wrappers that use AWS SDK/provider env when present and return honest unavailable states when missing.
- API support for receipt or label upload/intake with private file metadata and parse status.
- S3 signed upload/download or server-mediated access semantics; no public object URLs by default.
- Textract parse path that maps parsed receipt/label lines into existing `receipt_imports`, `receipt_line_items`, and `expiry_observations` contracts when applied.
- Fixture parse mode that is clearly labelled as fixture/dry-run when live Textract is unavailable.
- Audit events for upload/parse/apply outcomes.
- CP8 schema/migration changes if existing tables are insufficient, owned only by this lane.

Avoid:

- map/geocoding routes owned by Lane 8B
- notification job/runtime owned by Lane 8C
- AI/semantic matching owned by Lane 8D
- UI-heavy polish except minimal API contracts
- Stripe/payment state

### Lane 8B - Maps And Geocoding

Owns geocode adapters, address/postcode intake, internal exact geography updates, public coarse labels, and map/list DTO support.

May edit:

- `useby-app/src/server/geocoding/**`
- `useby-app/src/server/locations/**`
- `useby-app/src/server/demo/**`
- `useby-app/src/server/merchant/**`
- `useby-app/src/server/store-drops/**`
- `useby-app/src/server/demand-pools/**`
- `useby-app/src/app/api/**/locations/**`
- `useby-app/src/app/api/system/**` only for CP8 geocoding state shape
- `useby-app/src/lib/**` and `useby-app/src/components/**` only for map/list helpers that consume coarse DTOs
- `.env.example` only for non-secret provider variable names
- focused tests for geocoding, location privacy, PostGIS updates, and no-key behavior

Must deliver:

- Geocoding provider adapter for configured keys plus deterministic local fallback for demo/postcode fixtures.
- Address/postcode route(s) that write exact `geography(Point, 4326)` internally and compute coarse public labels.
- Map/list DTOs that show neighbourhood, distance bands, or coarse pickup areas without exact household coordinates.
- Tests proving public, merchant, proof, and heatmap DTOs do not expose exact coordinates, unit labels, raw addresses, personal emails, or phone numbers.
- Honest unavailable responses when geocoding env is missing.

Avoid:

- S3/Textract parsing internals
- notification delivery internals
- AI/embedding internals
- schema/migration edits unless explicitly coordinated with Lane 8A
- Stripe/payment state

### Lane 8C - Notifications And Reminder Jobs

Owns in-app notification rows, notification APIs, reminder jobs, and optional email provider adapter with no-key fallback.

May edit:

- `useby-app/src/db/schema.ts` only if Lane 8A confirms no conflicting migration ownership is active
- `useby-app/drizzle/**` only if Lane 8A confirms no conflicting migration ownership is active
- `useby-app/src/server/notifications/**`
- `useby-app/src/server/jobs/**`
- `useby-app/src/app/api/notifications/**`
- `useby-app/src/app/api/jobs/**`
- `useby-app/src/lib/notifications/**`
- `useby-app/src/components/**` only for compact notification surfaces
- `useby-app/src/app/proof/**` and `useby-app/src/lib/proof-ui/**` only for notification proof evidence
- `.env.example` only for non-secret provider variable names
- focused tests for notification contracts, job idempotency, and no-key email behavior

Must deliver:

- In-app notifications generated from current live rows for upcoming pickups, DemandPool awards/orders, booking handoffs, lending reservations, and surplus drop reservations.
- Idempotent reminder job(s), including the existing `/api/jobs/pickup-reminders` contract if appropriate.
- Optional email provider adapter that records `email_unavailable` or dry-run status when keys are missing; no fake sent status.
- Notification list/read APIs with actor/household/merchant scoping.
- Audit/job proof for generated notifications and reminder runs.

Avoid:

- S3/Textract parsing internals
- geocoding provider internals
- AI/embedding internals
- double-owning migration files without explicit coordination
- Stripe/payment state

### Lane 8D - AI, Semantic Matching, Proof, And Docs

Owns AI copy/explanation adapters, optional embeddings/pgvector ranking, guardrail tests, proof UI, and CP8 docs.

May edit:

- `useby-app/src/server/ai/**`
- `useby-app/src/server/matching/**`
- `useby-app/src/server/actions/**`
- `useby-app/src/server/safety/**`
- `useby-app/src/lib/proof-ui/**`
- `useby-app/src/components/proof/**`
- `useby-app/src/app/proof/**`
- `useby-app/src/app/api/system/**`
- `docs/**`
- `.env.example` only for non-secret provider variable names
- focused tests for AI/no-key behavior, deterministic-first ranking, proof adapters, and safety/privacy copy

Must deliver:

- Provider adapter for AI copy/explanation with honest no-key fallback.
- Optional pgvector/embedding path that is gated by deterministic filters and clearly disabled when vector/provider env is unavailable.
- Guardrail tests proving AI cannot decide eligibility, trust, payment, safety, reservation capacity, or visibility.
- Proof/system-state cards for CP8 providers, no-key states, private files, geocoding privacy, notifications, and AI guardrails.
- `docs/checkpoint-8-live-smoke.md` with local, production, provider/no-key, browser, and live smoke expectations.

Avoid:

- S3/Textract upload and parse internals
- geocoding provider internals
- notification delivery internals
- schema/migration edits unless explicitly coordinated with Lane 8A
- Stripe/payment state

## Merge Order

1. Lane 8A S3/Textract ingestion and any CP8-owned schema/migration.
2. Lane 8B maps/geocoding and location DTO privacy.
3. Lane 8C notifications and reminder jobs.
4. Lane 8D AI/semantic proof/docs.
5. Master integration patch for contract drift.

## Worker Registry

| Lane | Thread | Worktree | Status |
| --- | --- | --- | --- |
| 8A S3 And Textract Ingestion | `019f127b-13df-7890-8e27-5f7ad52c2007` | `/Users/abhinavgupta/.codex/worktrees/19e5/UseBy` | active |
| 8B Maps And Geocoding | `019f127b-5341-7832-8fab-361a4690ea7e` | `/Users/abhinavgupta/.codex/worktrees/f895/UseBy` | active |
| 8C Notifications And Reminder Jobs | `019f127b-9516-7b41-9b1d-a24506aa4114` | `/Users/abhinavgupta/.codex/worktrees/d680/UseBy` | active |
| 8D AI, Semantic Matching, Proof, And Docs | `019f127b-e189-7892-93b4-a5fef30cf8bc` | `/Users/abhinavgupta/.codex/worktrees/4eaa/UseBy` | active |

## Integration Log

- `5f821f3` created the CP8 external integrations orchestration plan.
- CP8 workers launched from `5f821f3` in four isolated Codex worktrees. Merge order remains 8A, 8B, 8C, 8D, then master integration patch.

## Verification

After each merge, run narrow checks for the changed area.

After all lanes merge, run from `useby-app`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Then run from repo root:

```bash
git diff --check
```

Live/prod smoke after deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/state
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/grocery/import
curl -i https://useby-app.vercel.app/api/jobs/pickup-reminders
```

Provider/no-key smoke:

- Verify storage, Textract, geocoding, email, and AI surfaces return honest unavailable/dry-run states when keys are absent.
- Verify any configured providers use private access patterns and do not leak plaintext secrets in logs or responses.
- Verify uploaded files are private by default and signed access is scoped and time-bound.
- Verify AI and vector results are disabled or marked unavailable when provider/vector env is absent.

Browser smoke:

- Open `https://useby-app.vercel.app/grocery`.
- Verify upload/import surfaces render live, unavailable, or fixture states honestly.
- Open `https://useby-app.vercel.app/merchant`.
- Verify location, notification, and CP8 integration summaries do not expose exact household data.
- Open `https://useby-app.vercel.app/proof`.
- Verify CP8 provider readiness, no-key states, private-file evidence, notification jobs, and AI guardrails.

## Worker Handoff Contract

Each lane must report:

- files changed
- commits/diff summary
- tests run and results
- unavailable checks and why
- migration/env notes
- API/DTO contracts changed
- privacy/payment/AI risks
- merge instructions
