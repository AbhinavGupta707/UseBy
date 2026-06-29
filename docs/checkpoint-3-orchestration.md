# Checkpoint 3 Orchestration Control

Checkpoint 2 completed commit: `5d1f47c`
Worker launch base: current `main` after this control document is committed.

## Outcome

Checkpoint 3 delivers the shared booking, handoff, trust, and safety lifecycle:

- A live food match can become a booking request.
- A receiving household must record food-safety acknowledgement before requesting shared food.
- An owner can accept, decline, or cancel a request.
- Accepting a request transactionally reserves the item and prevents double reservation.
- Handoff state advances through pickup scheduling, picked-up, completed, and reviewed states.
- Completion writes trust events, audit events, inventory events, and safe public DTOs.
- The UI shows booking timeline, safety acknowledgement, coarse-to-specific location reveal, and completion/review controls.

No booking transition, handoff, trust event, review, or safety acknowledgement may be seeded as a final output. Seeded data may provide open matches/items/needs only.

## Product Gates

- Two concurrent requests for the same eligible item cannot both reserve it.
- Food booking request fails without a recorded safety acknowledgement.
- Restricted/opened/blocked/high-risk grocery items cannot be requested or accepted for neighbour sharing.
- Blocked users/households cannot request, accept, or complete bookings with each other.
- Exact household coordinates are never exposed by public booking/match APIs. Before acceptance, only coarse labels/approximate distance are exposed. After acceptance, a coarse pickup hint may be revealed, not raw coordinates.
- Completing a booking writes `trust_events`, optional review data, `inventory_events`, `audit_events`, and recomputes/invalidates affected matches/action cards.
- `/proof` and `/api/system/state` expose booking, handoff, safety acknowledgement, trust event, report, and block counts when tables exist.

## Lane Split

### Lane 3A - Booking Schema And Transactions

Owns all Checkpoint 3 schema/migration changes.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/bookings/**`
- `useby-app/src/app/api/bookings/**`
- `useby-app/src/server/demo/**` only for demo actor/context helpers needed by bookings
- focused tests for booking runtime
- `.env.example` only if a new non-secret env var is strictly required

Must deliver:

- Drizzle schema and migration for CP3 tables/enums, including at minimum `bookings`, `handoffs`, `safety_acknowledgements`, `trust_events`, `reviews`, `reports`, and `blocks` if absent.
- Booking state enum aligned to `requested`, `accepted`, `reserved`, `pickup_scheduled`, `picked_up`, `returned`, `completed`, `reviewed`, `cancelled`, `declined`, `disputed`.
- Handoff state/model with pickup window, coarse pickup hint, actor timestamps, and completion metadata.
- Transactional booking request/accept/decline/cancel/pickup/complete/review helpers.
- API routes:
  - `POST /api/bookings/request`
  - `POST /api/bookings/:bookingId/accept`
  - `POST /api/bookings/:bookingId/decline`
  - `POST /api/bookings/:bookingId/cancel`
  - `POST /api/bookings/:bookingId/schedule-pickup`
  - `POST /api/bookings/:bookingId/picked-up`
  - `POST /api/bookings/:bookingId/complete`
  - `POST /api/bookings/:bookingId/review`
  - `GET /api/bookings`
  - `GET /api/bookings/:bookingId`
- Row-lock or serializable transaction semantics for acceptance so only one active booking can reserve a given item.
- Audit and inventory event writes for every state transition.
- Public DTOs that omit exact coordinates and direct personal contact data.

Avoid:

- frontend pages/components except minimal route smoke helpers
- proof UI wiring owned by Lane 3D
- wardrobe/rental-specific fit windows beyond generic reusable booking fields
- payments/Stripe

### Lane 3B - Trust, Safety, And Moderation Runtime

Owns policy/runtime rules on top of Lane 3A schema contracts.

May edit:

- `useby-app/src/server/safety/**`
- `useby-app/src/server/trust/**`
- `useby-app/src/server/moderation/**`
- `useby-app/src/server/bookings/**` only for policy hook integration, not schema ownership
- `useby-app/src/app/api/safety/**`
- `useby-app/src/app/api/reports/**`
- `useby-app/src/app/api/blocks/**`
- focused tests for policy/trust/moderation

Must deliver:

- Safety acknowledgement create/check runtime and API route for food handoff acknowledgement.
- Food sharing policy guard that rejects unsafe categories, missing acknowledgement, restricted/blocked safety statuses, opened/cooked storage states, expired items, and blocked relationships.
- Trust event calculation from completed bookings and negative events, with deterministic score/rationale output.
- Report and block runtime APIs with audit events.
- Integration hooks that Lane 3A booking transitions can call without circular imports.
- Honest unavailable responses if CP3 schema has not landed yet.

Avoid:

- migrations/schema edits
- UI implementation
- payments
- final trust scores seeded as outputs

### Lane 3C - Booking And Handoff UI

Owns the consumer booking experience.

May edit:

- `useby-app/src/app/grocery/**`
- `useby-app/src/app/bookings/**`
- `useby-app/src/components/bookings/**`
- `useby-app/src/components/grocery/**`
- `useby-app/src/lib/bookings/**`
- `useby-app/src/lib/grocery/**` only for match-to-booking integration
- page/component tests

Must deliver:

- Match cards with request-booking action for eligible food matches.
- Safety acknowledgement UI before requesting shared food.
- Booking timeline with request, accepted/reserved, pickup scheduled, picked up, completed, reviewed, declined/cancelled/disputed states.
- Owner/receiver action controls with loading, error, unavailable, empty, and success states.
- Coarse-to-specific location reveal: pre-acceptance coarse labels only; post-acceptance pickup hint without raw coordinates.
- Mobile and desktop responsive layout without text overlap.

Avoid:

- migrations/schema
- DB runtime internals
- trust score calculation internals
- payments/Stripe

### Lane 3D - Concurrency QA, Proof, And Docs

Owns verification, proof wiring, and checkpoint docs.

May edit:

- `useby-app/src/lib/system-state/**`
- `useby-app/src/lib/proof-ui/**`
- `useby-app/src/components/proof/**`
- `useby-app/src/app/proof/**`
- `docs/**`
- tests and fixtures

Must deliver:

- System state/proof counts for `bookings`, `handoffs`, `safety_acknowledgements`, `trust_events`, `reviews`, `reports`, and `blocks` when tables exist.
- Contract tests for booking request/accept/decline/cancel/complete/review, safety acknowledgement, trust event creation, block/report policy, and no-final-output seed guarantees.
- Concurrency tests or transaction-level tests proving double reservation is rejected.
- Privacy/safety wording scans: no exact coordinates, no personal contact leakage, no certified food-safety/freshness claims.
- `docs/checkpoint-3-live-smoke.md` with local, migration, production, API, and browser smoke expectations.

Avoid:

- migrations/schema except documentation of contracts
- implementation of core booking algorithms owned by Lane 3A
- implementation of safety/trust algorithms owned by Lane 3B
- grocery/booking UI owned by Lane 3C

## Merge Order

1. Lane 3A schema/booking transactions.
2. Lane 3B trust/safety/moderation runtime, adjusted to landed schema.
3. Lane 3C booking/handoff UI, adjusted to landed APIs.
4. Lane 3D QA/proof/docs.
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

Live/prod smoke, after CP3 migration and deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/grocery/matches
curl -i -X POST https://useby-app.vercel.app/api/bookings/request
curl -i https://useby-app.vercel.app/api/bookings
curl -i https://useby-app.vercel.app/api/system/state
```

Browser smoke:

- Open `https://useby-app.vercel.app/grocery`.
- Request a booking from a live eligible food match after recording safety acknowledgement.
- Accept it from the owner context and verify the item reserves.
- Attempt a second booking for the same item and verify a live conflict.
- Advance pickup/completion/review and verify trust/proof counts update.
- Open `https://useby-app.vercel.app/proof` and verify booking/handoff/trust evidence.

## Worker Handoff Contract

Each lane must report:

- files changed
- commits/diff summary
- tests run and results
- unavailable checks and why
- migration/env notes
- API/DTO contracts changed
- safety/privacy risks
- merge instructions

## Active Worker Registry

The orchestrator must update this table after worker creation.

| Lane | Thread ID | Worktree/Pending ID | Status | Notes |
|---|---|---|---|---|
| 3A Booking Schema And Transactions | `019f110f-8a5c-7061-a078-01c3fb21cf24` | `/Users/abhinavgupta/.codex/worktrees/d288/UseBy` | Active | Owns all CP3 migrations/schema |
| 3B Trust, Safety, And Moderation Runtime | `019f110f-de83-7421-ba5a-87a399fb4d99` | `/Users/abhinavgupta/.codex/worktrees/3394/UseBy` | Active | No schema edits |
| 3C Booking And Handoff UI | `019f1110-282e-78f1-96a8-b93cbd1fce7c` | `/Users/abhinavgupta/.codex/worktrees/488e/UseBy` | Active | API consumer only |
| 3D Concurrency QA, Proof, And Docs | `019f1110-7205-7803-bd9a-7f06b1fce258` | `/Users/abhinavgupta/.codex/worktrees/0cf2/UseBy` | Active | Proof/docs/tests |
