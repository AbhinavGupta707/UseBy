# Checkpoint 1 Orchestration Control

Date: 2026-06-29
Project: UseBy
Integration branch: `main`
Checkpoint 0 scaffold commit: `5029affb8afdfaaa4ec979a271cdbc2cf2a383f4`
Worker launch base: current `main` HEAD after this orchestration document is committed.

## Readiness Verification

Checkpoint 0 is verified and ready for Checkpoint 1.

Baseline checks from `useby-app`:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed.
- `git status --short` was clean before this document was added.

AWS/Vercel setup known at launch:

- Aurora cluster ARN: `arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg`
- Aurora database: `useby`
- App secret ARN: `arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/useby/rds/app-user-YkF92c`
- S3 bucket: `h0-useby-assets-222634407676-eu-west-2`
- Aurora Data API enabled.
- Aurora auto-pauses at 0 ACU; Data API callers must retry `DatabaseResumingException`.

## Checkpoint Outcome

Checkpoint 1 delivers the live data foundation:

- Aurora-compatible schema and migrations.
- Demo seed/reset input world, without seeded final outcomes.
- DB runtime helpers for RDS Data API, retries, idempotency, audit, jobs, and system state.
- Live `/api/system/state` and `/api/system/db-proof` endpoints.
- `/proof` UI consuming live endpoints only, with honest unavailable states.

Non-goals:

- No receipt import/action-card engine yet.
- No booking transaction flows yet.
- No DemandPool award algorithm yet.
- No hard-coded final action cards, matches, bookings, pool winners, trust changes, or audit outputs.

## Lane Split

### Lane 1A - Schema And Migrations

Owns:

- `useby-app/src/db/**`
- `useby-app/drizzle/**`
- `useby-app/drizzle.config.*`
- schema tests that validate table/enums/contracts
- package dependencies required for schema/migrations

Must not edit:

- seed content outside minimal schema contract helpers
- UI pages/components
- system route handlers except type-only contract exports if unavoidable

Expected output:

- Drizzle schema for Checkpoint 1 core tables.
- SQL migrations that create/verify `postgis`, `pgcrypto`, `pg_trgm`, and optionally `vector` only when available.
- Enums and indexes needed for neighbourhoods, users, households, merchants, items, needs, demand pools, files, audit events, job runs, idempotency keys, and seed batches.
- Location columns modelled for PostGIS.
- Migration notes for Aurora/Data API execution.

### Lane 1B - Seed And Reset

Owns:

- `useby-app/src/server/seed/**`
- `useby-app/src/app/api/demo/reset/**`
- `useby-app/src/app/api/demo/seed/**`
- seed fixtures under `useby-app/src/server/fixtures/**`
- seed tests

Must not edit:

- migrations or canonical schema files
- proof UI
- DB client internals except through contracts from Lane 1C

Expected output:

- Deterministic Riverside Quarter demo world with 8 households, 2-3 merchants, catalog rows, initial inventory, needs, merchant drops, and demand pools.
- Reset route that clears only demo-scoped rows and reseeds input world.
- No final action cards, matches, bookings, awards, trust changes, or job outputs seeded as results.
- Seed batch/audit metadata so `/api/system/state` can prove latest mutation.

### Lane 1C - DB Runtime And System APIs

Owns:

- `useby-app/src/server/db/**`
- `useby-app/src/server/audit/**`
- `useby-app/src/server/jobs/**`
- `useby-app/src/server/idempotency/**`
- `useby-app/src/app/api/system/state/**`
- `useby-app/src/app/api/system/db-proof/**`
- `useby-app/src/app/api/jobs/**`
- `useby-app/src/lib/system-state/**`
- runtime/API tests

Must not edit:

- migrations unless coordinating a tiny schema contract with Lane 1A
- seed fixtures except minimal integration wiring
- proof UI except shared response types if unavoidable

Expected output:

- RDS Data API client with typed env loading and `DatabaseResumingException` retry/backoff.
- SQL helpers for parameter binding, transactions where possible, and safe query execution.
- Audit-event helper, job-run helper, and idempotency helper.
- `/api/system/state` returning sanitized live counts, latest audit events, latest job runs, and integration status.
- `/api/system/db-proof` returning sanitized extension/database metadata.
- GET job route stubs that record job runs and audit rows for Checkpoint 1.

### Lane 1D - Live Proof UI

Owns:

- `useby-app/src/app/proof/**`
- `useby-app/src/app/page.tsx`
- `useby-app/src/components/**`
- `useby-app/src/lib/proof-ui/**`
- proof UI tests

Must not edit:

- migrations/schema
- seed/reset routes
- DB runtime internals

Expected output:

- `/proof` page shows architecture/database proof, integration status, row counts, latest audit/job events, and demo controls wired to live endpoints.
- Home page links clearly into proof/demo readiness without becoming a marketing landing page.
- Loading, error, and unavailable states are honest and judge-facing.
- UI must not claim live DB success when endpoints fail or env vars are missing.

## Merge Order

1. Lane 1A schema/migrations.
2. Lane 1C DB runtime/API, adjusted to landed schema.
3. Lane 1B seed/reset, adjusted to landed schema/runtime helpers.
4. Lane 1D proof UI, adjusted to landed endpoint contracts.
5. Orchestrator integration patch for cross-lane drift.

## Checkpoint Verification

Run from `useby-app` after integration:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `git diff --check`

Additional review:

- Scan for committed plaintext secrets.
- Confirm seeded data is input world state only.
- Confirm live proof UI consumes endpoint responses, not static final output.
- Confirm no raw exact household coordinates are exposed in public response types.
- Confirm no-key/unavailable DB state is visible and honest.

## Worker Handoff Contract

Each worker must report:

- files changed
- commits/diff summary, if any
- commands run and results
- tests passing/failing
- risks and open integration notes
- migration/env notes
- whether any lane ownership boundary was crossed

## Active Worker Registry

Workers are created from this checkpoint control document. The orchestrator must update this table after thread/worktree creation.

| Lane | Thread ID | Worktree/Pending ID | Status | Notes |
|---|---|---|---|---|
| 1A Schema And Migrations | `019f1092-92d6-7931-b170-12c6188900e8` | `/Users/abhinavgupta/.codex/worktrees/8b4c/UseBy` | Active | Launched from `56d059ebd474d391f903154d48cb0f4f8e87ccda` |
| 1C DB Runtime And System APIs | `019f1092-e2f1-7c51-93ba-c93d091ab883` | `/Users/abhinavgupta/.codex/worktrees/3652/UseBy` | Active | Launched from `56d059ebd474d391f903154d48cb0f4f8e87ccda` |
| 1B Seed And Reset | `019f1093-2770-7170-aaec-0b925d9bf8f2` | `/Users/abhinavgupta/.codex/worktrees/4fdb/UseBy` | Active | Launched from `56d059ebd474d391f903154d48cb0f4f8e87ccda` |
| 1D Live Proof UI | `019f1093-68f6-7e32-b392-a7638e4203b7` | `/Users/abhinavgupta/.codex/worktrees/0770/UseBy` | Active | Launched from `56d059ebd474d391f903154d48cb0f4f8e87ccda` |
