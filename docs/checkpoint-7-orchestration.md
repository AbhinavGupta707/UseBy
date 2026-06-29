# Checkpoint 7 Orchestration Control

Checkpoint 6 completed commit: `f2d1147`.
Checkpoint 7 plan commit: `bf7d84b`.
Worker launch base: `bf7d84b` (`Plan checkpoint 7 surplus orchestration`).
Current worker registry commit: `e2efaab` (`Record checkpoint 7 worker registry`).

## Outcome

Checkpoint 7 delivers merchant surplus drops and a neighbourhood heatmap as live, Aurora-backed product flows:

- Merchants can create, publish, pause, close, and inspect surplus drops for same-day or scheduled pickup.
- Consumers can browse available drops, reserve quantities, cancel active reservations, and see pickup windows and safety notes.
- Reservation availability is computed from current rows, with transactional capacity checks so a drop cannot be over-reserved.
- Merchants can see an anonymised, coarse heatmap of current demand and drop/reservation interest by neighbourhood cell.
- `/proof` and `/api/system/state` expose CP7 drop, reservation, heatmap, job, and audit evidence when routes/tables exist.

Seed data may provide initial merchant drop input rows only. Reservations, sold-out states, heatmap cells, expiry/release job output, and audit proof must be generated from current rows and user/job actions.

## Product Gates

- No Stripe, card, deposit, payment authorization, ledger, captured payment, or paid commitment state is added in CP7. Any price is display/demo intent only.
- Drop quantity, reserved quantity, and remaining quantity must be derived or reconciled from live `store_drop_reservations` rows, not trusted from stale client state.
- Reservation creation must validate drop status, pickup window, positive quantity, household context, capacity, and idempotency.
- A household may have at most one active reservation per drop unless the API intentionally updates that reservation.
- Cancelling a reservation must release capacity and record an audit event.
- Expired, paused, closed, sold-out, or deleted drops cannot accept new reservations.
- Heatmap output must be coarse and privacy-preserving. Do not expose exact household coordinates, unit labels, direct contact fields, or raw household-level need locations to merchants.
- Merchant heatmap and reservation views must use aggregate counts and coarse cells only.
- Safety language must stay conservative: merchant-packed, user/merchant confirmed, no freshness or allergen guarantees.
- Existing grocery, booking, lending, DemandPool, merchant portal, trust, proof, and reset behavior must continue to pass.

## Lane Split

### Lane 7A - Surplus Drop Schema And Runtime

Owns CP7 schema/migration changes and the baseline consumer-facing surplus drop runtime.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/store-drops/**`
- `useby-app/src/app/api/store-drops/**`
- `useby-app/src/server/seed/**` only for reset cleanup, seed input rows, and no-final-output contract updates
- focused tests for store drop contracts/runtime
- `.env.example` only if a new non-secret env var is strictly required

Must deliver:

- Drizzle schema and migration for CP7 tables that are currently absent, including at minimum `store_drops` and `store_drop_reservations`.
- Status enums or constrained values for drops and reservations.
- Public drop DTOs for list/detail/reserve/cancel flows that omit exact household coordinates and direct contact fields.
- API routes:
  - `GET /api/store-drops`
  - `GET /api/store-drops/:dropId`
  - `POST /api/store-drops/:dropId/reserve`
  - `POST /api/store-drops/:dropId/cancel-reservation`
  - `GET /api/store-drops/reservations`
- Live availability recomputation from current `store_drop_reservations` rows.
- Idempotency protection for reservation creation/update.
- Honest unavailable responses when Aurora env or CP7 schema is missing.
- Reset cleanup for CP7 final outputs without seeding reservations, heatmap outputs, or job outputs.

Avoid:

- merchant create/update/publish APIs owned by Lane 7B
- heatmap aggregation internals owned by Lane 7B
- consumer page UI owned by Lane 7C
- merchant portal/proof UI owned by Lane 7D
- Stripe/payment state

### Lane 7B - Merchant Drop Policy, Reservation Engine, And Heatmap

Owns merchant-side drop management, transactional reservation policy, heatmap aggregation, and expiry/release jobs on top of Lane 7A schema.

May edit:

- `useby-app/src/server/merchant/**`
- `useby-app/src/server/store-drops/**`
- `useby-app/src/server/heatmap/**`
- `useby-app/src/server/jobs/**`
- `useby-app/src/app/api/merchant/store-drops/**`
- `useby-app/src/app/api/merchant/heatmap/**`
- `useby-app/src/app/api/jobs/expire-store-drops/route.ts`
- focused tests for merchant policy, reservation transactions, heatmap privacy, and job behavior

Must deliver:

- Merchant drop APIs:
  - `GET /api/merchant/store-drops`
  - `POST /api/merchant/store-drops`
  - `POST /api/merchant/store-drops/:dropId/publish`
  - `POST /api/merchant/store-drops/:dropId/pause`
  - `POST /api/merchant/store-drops/:dropId/close`
- Merchant heatmap API:
  - `GET /api/merchant/heatmap`
- A real `expire-store-drops` job that expires old drops, releases stale reservations when applicable, records `job_runs`, and writes audit events.
- Reservation transaction helpers that prevent over-reservation under concurrent requests.
- Heatmap cells computed from current needs, published drops, active reservations, and merchant service areas at a coarse neighbourhood grid.
- Tests proving the heatmap never returns exact household coordinates or direct contact fields.

Avoid:

- migrations/schema edits except minimal shared type alignment after 7A lands
- consumer surplus UI
- merchant portal page UI except shared API helpers
- proof UI
- Stripe/payment state

### Lane 7C - Consumer Surplus Drops UI

Owns household-facing surplus drop UX.

May edit:

- `useby-app/src/app/drops/**`
- `useby-app/src/components/store-drops/**`
- `useby-app/src/lib/store-drops/**`
- `useby-app/src/app/page.tsx` only for navigation/link wiring
- page/component tests

Must deliver:

- `/drops` page with live drop list, remaining quantity, pickup windows, reserve/cancel affordances, current household reservation state, and sold-out/expired/unavailable states.
- Drop detail or inline expanded view showing merchant display name, coarse pickup area, price display/demo wording, safety notes, pickup window, and reservation status.
- Reservation flow with quantity, loading, success, empty, unavailable, validation, and error states.
- Clear no-payment wording: surplus reservations are unpaid demo intent and do not capture cards, deposits, or charges.
- Mobile and desktop responsive layout without text overlap.

Avoid:

- migrations/schema
- merchant create/update internals
- heatmap algorithm internals
- merchant portal UI except shared components
- Stripe/payment controls

### Lane 7D - Merchant Surplus Portal, Proof, Contracts, And Docs

Owns merchant-facing CP7 surfaces plus proof wiring and checkpoint documentation.

May edit:

- `useby-app/src/app/merchant/**`
- `useby-app/src/components/merchant/**`
- `useby-app/src/lib/merchant/**`
- `useby-app/src/lib/system-state/**`
- `useby-app/src/lib/proof-ui/**`
- `useby-app/src/components/proof/**`
- `useby-app/src/app/proof/**`
- `docs/**`
- tests and fixtures

Must deliver:

- `/merchant` dashboard section for surplus drops with create/edit/publish/pause/close controls, active reservations, remaining capacity, pickup windows, and heatmap summary.
- System state/proof counts for CP7 routes/tables: published drops, active reservations, sold-out/closed drops, heatmap cells, expiry job runs, and CP7 audit events.
- Proof cards or controls for publish drop, reserve drop, cancel reservation, close/expire drop, and heatmap privacy evidence.
- Contract tests for reservation capacity, idempotency, cancellation release, merchant status transitions, heatmap privacy, and no-final-output seed guarantees.
- `docs/checkpoint-7-live-smoke.md` with local, migration, production, API, browser, and Aurora smoke expectations.

Avoid:

- migrations/schema except documentation of contracts
- core reservation transaction and heatmap implementation owned by Lane 7B
- consumer drops UI owned by Lane 7C
- Stripe/payment implementation

## Merge Order

1. Lane 7A schema and consumer surplus drop runtime.
2. Lane 7B merchant drop policy, reservation engine, heatmap, and jobs.
3. Lane 7C consumer surplus drops UI.
4. Lane 7D merchant portal, proof, contracts, and docs.
5. Master integration patch for contract drift.

## Worker Registry

| Lane | Thread | Worktree | Status |
| --- | --- | --- | --- |
| 7A Surplus Drop Schema And Runtime | `019f1242-4336-77a1-8d56-8d9046055006` | `/Users/abhinavgupta/.codex/worktrees/9499/UseBy` | active |
| 7B Merchant Drop Policy, Reservation Engine, And Heatmap | `019f1242-cb01-7531-b36b-095ed28e4a02` | `/Users/abhinavgupta/.codex/worktrees/3bce/UseBy` | active |
| 7C Consumer Surplus Drops UI | `019f1243-2cfe-7fd3-9f96-08bc24908de2` | `/Users/abhinavgupta/.codex/worktrees/0fba/UseBy` | active |
| 7D Merchant Surplus Portal, Proof, Contracts, And Docs | `019f1243-8685-7113-96d6-d0c50c8e256b` | `/Users/abhinavgupta/.codex/worktrees/aaf9/UseBy` | active |

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

Live/prod smoke, after CP7 migration and deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/system/state
curl -i https://useby-app.vercel.app/api/store-drops
curl -i https://useby-app.vercel.app/api/store-drops/reservations
curl -i https://useby-app.vercel.app/api/merchant/store-drops
curl -i https://useby-app.vercel.app/api/merchant/heatmap
curl -i https://useby-app.vercel.app/api/jobs/expire-store-drops
```

Mutation smoke:

- Publish or update a live merchant drop from a demo merchant.
- Reserve quantity from a household that does not already have an active reservation for that drop.
- Verify remaining quantity changes from current rows.
- Try a reservation that exceeds remaining capacity and verify it is rejected.
- Cancel a reservation and verify capacity is released.
- Close or expire a drop and verify new reservations are blocked.
- Verify merchant heatmap cells update from current demand/reservation/drop rows and do not expose exact household coordinates or direct contact fields.
- Verify no payment/deposit/captured-charge state is written or claimed.

Browser smoke:

- Open `https://useby-app.vercel.app/drops`.
- Verify drops, remaining quantity, reserve/cancel flow, sold-out/expired states, and no-payment copy render from live rows.
- Open `https://useby-app.vercel.app/merchant`.
- Verify merchant surplus drop controls, reservations, remaining capacity, and heatmap summary render from live rows.
- Open `https://useby-app.vercel.app/proof` and verify CP7 surplus drop and heatmap evidence.

## Worker Handoff Contract

Each lane must report:

- files changed
- commits/diff summary
- tests run and results
- unavailable checks and why
- migration/env notes
- API/DTO contracts changed
- privacy/payment risks
- merge instructions
