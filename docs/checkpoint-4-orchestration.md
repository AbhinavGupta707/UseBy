# Checkpoint 4 Orchestration Control

Checkpoint 3 completed commit: `f5d9c50`.
Worker launch base: `cd62a6a` (`Plan checkpoint 4 lending orchestration`).

## Outcome

Checkpoint 4 delivers wardrobe rental and household lending as live, database-backed product flows:

- A demo household can browse listed fashion and household items that are actually stored in Aurora.
- A borrower can request a rental or lendable household item for a time window.
- Owners can accept, decline, schedule pickup, mark picked up, mark returned, complete, and review through the existing booking/handoff lifecycle.
- Availability, item category, item state, active reservation, blocked-household, and condition/terms checks are enforced from current rows.
- The UI exposes wardrobe and household lending surfaces with request, owner action, return, and review states.
- `/proof` and `/api/system/state` expose Checkpoint 4 lending/rental readiness and live counts when tables exist.

No rental booking, lending request, availability hold, condition event, trust event, review, or handoff may be seeded as a final output. Seeded data may provide listed fashion/household items and open needs only.

## Product Gates

- Only `fashion` and `household` category items in a public/listed state can be requested through CP4 lending APIs.
- Grocery food-sharing policy remains owned by the CP2/CP3 grocery-booking path; CP4 must not weaken food-safety acknowledgement gates.
- A listed item cannot have two overlapping active lending reservations.
- Requester and owner households must be different and must not be blocked in either direction.
- Exact household coordinates and direct contact details are never returned by lending APIs or UI.
- Fashion and household terms are explicit: condition notes, return expectations, cleaning/handling notes, and pickup hints are visible before acceptance where safe.
- Payment/deposit language is honest: Stripe and payment capture are deferred, so any deposit preference is displayed as an owner note only and no payment ledger is written.
- Returning/completing a borrowed item writes live audit, handoff, inventory, trust, and optional review evidence.
- Demo seed/reset may clear CP4 outputs, but seed must not insert final CP4 bookings, holds, condition events, trust events, or reviews.

## Lane Split

### Lane 4A - Lending Schema And Runtime

Owns all Checkpoint 4 schema/migration changes and the base lending API contract.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/lending/**`
- `useby-app/src/app/api/lending/**`
- `useby-app/src/server/bookings/**` only for generic booking metadata hooks needed by lending
- `useby-app/src/server/demo/**` only for demo actor/context helpers needed by lending
- focused tests for lending runtime and contracts
- `.env.example` only if a new non-secret env var is strictly required

Must deliver:

- Drizzle schema and migration for CP4 lending-specific tables if absent, including at minimum availability/hold/condition evidence needed beyond generic bookings.
- A clear schema decision on whether CP4 uses new tables, booking metadata, or both. Prefer reusing `bookings` and `handoffs` for lifecycle state.
- API routes:
  - `GET /api/lending/listings`
  - `GET /api/lending/requests`
  - `POST /api/lending/request`
  - `POST /api/lending/:bookingId/accept`
  - `POST /api/lending/:bookingId/decline`
  - `POST /api/lending/:bookingId/cancel`
  - `POST /api/lending/:bookingId/schedule-pickup`
  - `POST /api/lending/:bookingId/picked-up`
  - `POST /api/lending/:bookingId/returned`
  - `POST /api/lending/:bookingId/complete`
  - `POST /api/lending/:bookingId/review`
- Transactional request/accept semantics that prevent overlapping active reservations for the same item and time window.
- Public DTOs for listings, lending requests, and booking details that omit exact coordinates and direct personal contact data.
- Honest unavailable responses when Aurora env or CP4 schema is missing.

Avoid:

- `/lending` frontend pages/components except minimal API smoke helpers
- proof UI wiring owned by Lane 4D
- Stripe, payment ledger, or captured deposit state
- grocery food-safety policy edits beyond preserving existing hooks

### Lane 4B - Lending Policy, Availability, And Terms

Owns category, availability, condition, terms, and safety policy on top of Lane 4A contracts.

May edit:

- `useby-app/src/server/lending/policy.ts`
- `useby-app/src/server/lending/availability.ts`
- `useby-app/src/server/lending/terms.ts`
- `useby-app/src/server/bookings/policy.ts` only for narrow reusable policy extraction that preserves grocery behavior
- `useby-app/src/server/moderation/**` only for block-check integration
- focused tests for lending policy and unavailable states

Must deliver:

- Policy guards for CP4 category eligibility: allow `fashion` and `household`; reject grocery through lending APIs.
- Availability-window and overlapping-active-booking checks from live rows.
- Condition and return-term normalization from item rows/metadata without exposing private owner notes.
- Deposit/payment-deferred handling that never writes payment state and never claims money was collected.
- Block/report/trust compatibility with CP3 moderation and booking lifecycle.
- Tests proving grocery safety policy still requires acknowledgement and CP4 lending policy does not.

Avoid:

- migrations/schema edits
- frontend implementation
- proof UI
- Stripe/payment state

### Lane 4C - Wardrobe And Household Lending UI

Owns the consumer and owner UI for CP4.

May edit:

- `useby-app/src/app/lending/**`
- `useby-app/src/components/lending/**`
- `useby-app/src/lib/lending/**`
- `useby-app/src/app/bookings/**` only for links/reuse of generic booking detail UI
- `useby-app/src/components/bookings/**` only for reusable non-food labels/states
- page/component tests

Must deliver:

- `/lending` page with wardrobe/fashion and household tabs or equivalent filters.
- Listing cards with size/condition/availability/terms, coarse owner area, and request controls.
- Request flow for a chosen borrow/rental window, with loading, empty, error, unavailable, and success states.
- Owner and borrower controls for accept/decline/cancel/schedule/picked-up/returned/complete/review using CP4 APIs.
- Clear non-payment wording for deposit preferences and cleaning/return expectations.
- Mobile and desktop responsive layout without text overlap.

Avoid:

- migrations/schema
- DB runtime internals
- food-safety acknowledgement UI changes unless a shared component needs a label fix
- Stripe/payment controls

### Lane 4D - CP4 Proof, Contracts, And Docs

Owns verification, proof wiring, and checkpoint documentation.

May edit:

- `useby-app/src/lib/system-state/**`
- `useby-app/src/lib/proof-ui/**`
- `useby-app/src/components/proof/**`
- `useby-app/src/app/proof/**`
- `docs/**`
- tests and fixtures

Must deliver:

- System state/proof counts for CP4 lending tables and reused booking/handoff evidence.
- Proof cards or controls showing CP4 listing, request, accept/reserve, return, complete, and review flows when routes exist.
- Contract tests for lending listing/request/accept/decline/cancel/return/complete/review, overlap conflict, policy rejection, and no-final-output seed guarantees.
- Privacy and safety scans: no exact coordinates, no direct personal contact leakage, no payment-captured claims, and no weakening of grocery food-safety copy.
- `docs/checkpoint-4-live-smoke.md` with local, migration, production, API, browser, and Aurora smoke expectations.

Avoid:

- migrations/schema except documentation of contracts
- implementation of core lending algorithms owned by Lane 4A/4B
- `/lending` page implementation owned by Lane 4C
- Stripe/payment implementation

## Merge Order

1. Lane 4A schema and lending runtime.
2. Lane 4B policy, availability, and terms, adjusted to landed contracts.
3. Lane 4C wardrobe/household lending UI, adjusted to landed APIs.
4. Lane 4D proof, contracts, and docs.
5. Master integration patch for contract drift.

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

Live/prod smoke, after CP4 migration and deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/lending/listings
curl -i -X POST https://useby-app.vercel.app/api/lending/request
curl -i https://useby-app.vercel.app/api/lending/requests
curl -i https://useby-app.vercel.app/api/system/state
```

Browser smoke:

- Open `https://useby-app.vercel.app/lending`.
- Verify fashion and household listings are loaded from live Aurora item rows.
- Request a fashion or household item for a live borrow/rental window.
- Accept it from the owner context and verify the item/time window reserves.
- Attempt a second overlapping request for the same item and verify a live conflict.
- Advance picked-up, returned, completion, and review states.
- Open `https://useby-app.vercel.app/proof` and verify CP4 lending/rental evidence.

## Worker Handoff Contract

Each lane must report:

- files changed
- commits/diff summary
- tests run and results
- unavailable checks and why
- migration/env notes
- API/DTO contracts changed
- safety/privacy/payment risks
- merge instructions

## Active Worker Registry

The orchestrator must update this table after worker creation.

| Lane | Thread ID | Worktree/Pending ID | Status | Notes |
|---|---|---|---|---|
| 4A Lending Schema And Runtime | `019f11c9-df8e-7861-96c7-cb223a9d6f19` | `/Users/abhinavgupta/.codex/worktrees/1597/UseBy` | Merged | Worker commit `38f5133`; merge commit `b56d9ec`; migration `0003_lending_schema_runtime.sql` hash `efe8381a07ffe76b227e482f42482fc6263f980ee8b9ec5f25059d8ad5dd18ab` |
| 4B Lending Policy, Availability, And Terms | `019f11ca-1df6-7b01-be0e-a23ba18f6038` | `/Users/abhinavgupta/.codex/worktrees/bcc3/UseBy` | Merged | Worker commit `4a9dd72`; merge commit `18ec164`; focused policy/availability/terms checks passed |
| 4C Wardrobe And Household Lending UI | `019f11ca-5ec4-72c3-ac84-7b670ae950d4` | `/Users/abhinavgupta/.codex/worktrees/a757/UseBy` | Merged | Worker commit `babf859`; merge commit `2788f9c`; `/lending` page and API client landed |
| 4D CP4 Proof, Contracts, And Docs | `019f11ca-9972-7152-b0ad-223d524223cd` | `/Users/abhinavgupta/.codex/worktrees/f5ca/UseBy` | Merged | Worker commit `d0ce264`; merge commit `f8b1745`; proof contracts and live-smoke doc landed |

## Integration Status

Checkpoint 4 merge integration completed on 2026-06-29.

- Final integration commit: `bfd55f1`.
- Proof-state fix commit: `81b3c0f`.
- Production deployment: `dpl_Cx525YGZcNYWx1XJwoerS7RkACao`.
- Public production alias: `https://useby-app.vercel.app`.
- Master patch added live demo reset cleanup for `lending_condition_events`, `lending_reservations`, and `lending_availability_windows`.
- Master patch aligned CP4 proof contracts and docs to the actual Lane 4A table names.
- Master patch fixed `/api/system/state` CP4 counts to use `item_state` and actual CP4 tables: `lending_availability_windows`, `lending_reservations`, and `lending_condition_events`.
- Local verification passed from `useby-app`: `npm run lint`, `npm run typecheck`, `npm run test` (32 files, 116 tests), and `npm run build`.
- Repository whitespace check passed with `git diff --check`.
- Aurora migration `useby-app/drizzle/0003_lending_schema_runtime.sql` was applied through the RDS Data API with Drizzle hash `efe8381a07ffe76b227e482f42482fc6263f980ee8b9ec5f25059d8ad5dd18ab`.
- Production API smoke passed for `/api/system/db-proof`, `/api/system/state`, `/api/lending/listings`, `/api/lending/requests`, and the invalid-body guard on `POST /api/lending/request`.
- Production mutation smoke passed with live booking `e8e5c79d-9634-4d76-98ab-216cd02f9168`: request `200`, accept/reserve `200`, overlapping conflict `409`, schedule pickup `200`, picked up `200`, returned `200`, complete `200`, review `200`.
- Post-mutation system state reported CP4 live evidence: `cp4LendingReservations=1`, `cp4LendingConditionEvents=5`, `cp4LendingHandoffs=1`, `cp4LendingTrustEvents=3`, and `cp4LendingReviews=1`.
- Chrome rendered smoke passed for `/lending` and `/proof`: live wardrobe/household listings, request controls, no-payment copy, and CP4 proof evidence rendered from production.
