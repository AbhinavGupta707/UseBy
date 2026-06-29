# Checkpoint 6 Orchestration Control

Checkpoint 4 completed commit: `d7777f5`.
Checkpoint 6 plan commit: `8720a21`.
Worker launch base: `8720a21` (`Plan checkpoint 6 demandpool orchestration`).
Current registry commit: `2576aab`.

## Outcome

Checkpoint 6 delivers DemandPool group buying and the first merchant portal as live, Aurora-backed product flows, without Stripe or payment capture:

- A demo household can create or join a DemandPool from current neighbourhood demand.
- Joining a pool writes a live unpaid/demo commitment, updates committed quantity and household counts, and can cross the threshold from current rows.
- Merchants can view anonymised active pools and submit bids with price, quantity, pickup window, substitutions, and fulfilment terms.
- The close-demand-pools job is real, not a stub: it transitions pools, scores current merchant bids, awards a winner, and creates individual pickup/order rows for active commitments.
- Consumer and merchant UIs expose pool progress, commitment state, merchant bids, award state, pickup readiness, and collected/fulfilled state.
- `/proof` and `/api/system/state` expose CP6 pool, bid, order, pickup, job, and audit evidence when tables/routes exist.

Seed data may provide initial merchants, pools, sub-threshold commitments, and submitted bids as input state only. Threshold crossings, awards, orders, pickup tasks, fulfilled states, and audit proof must be generated from live actions/jobs.

## Product Gates

- No Stripe, card, deposit, payment authorization, ledger, or captured-payment state is added in CP6. Commitment copy must say unpaid/demo intent until payments are reintroduced.
- A household may have at most one active commitment per pool. Rejoining must be idempotent or update the live commitment intentionally.
- Commitment quantity and max-price intent are validated from the request and written to Aurora.
- Adding one live commitment can cross a pool threshold and transition the pool from `gathering` to `threshold_met` or `bidding`.
- Merchant bid submission must validate merchant/location ownership, pool status, positive price, available quantity, pickup window order, and substitution/fulfilment terms.
- Awarding must score at least two current bids deterministically. Changing price, capacity, pickup window, or substitution quality must be able to change the winner after recompute.
- Awarding must be transactional: one winning bid, non-winning bids rejected, `demand_pools.awarded_bid_id` set, pool status updated, and individual order/pickup rows created for active commitments.
- Consumer APIs and UI must not expose exact household coordinates or direct contact fields to merchants.
- Merchant APIs and UI may show pickup/order lists only after award, and must keep contact/location details coarse and demo-safe.
- Existing grocery, booking, lending, trust, and proof behavior must continue to pass.

## Lane Split

### Lane 6A - DemandPool Schema And Consumer Runtime

Owns CP6 schema/migration changes and consumer-facing pool contracts.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/demand-pools/**`
- `useby-app/src/app/api/demand-pools/**`
- `useby-app/src/server/seed/**` only for reset cleanup and no-final-output contract updates
- focused tests for pool contracts/runtime
- `.env.example` only if a new non-secret env var is strictly required

Must deliver:

- Drizzle schema and migration for CP6 output tables that are currently missing, including at minimum pool orders and pickup task/order status evidence.
- Public pool DTOs for list/detail/create/join/cancel/update commitment flows that omit exact coordinates and direct contact fields.
- API routes:
  - `GET /api/demand-pools`
  - `GET /api/demand-pools/:poolId`
  - `POST /api/demand-pools`
  - `POST /api/demand-pools/:poolId/commit`
  - `POST /api/demand-pools/:poolId/cancel-commitment`
  - `GET /api/demand-pools/orders`
- Live threshold recomputation from current `demand_pool_commitments` rows.
- Idempotency protection for commitment creation/update.
- Honest unavailable responses when Aurora env or CP6 schema is missing.
- Reset cleanup for CP6 final outputs without seeding awards, orders, pickup tasks, or job outputs.

Avoid:

- merchant portal frontend
- bid scoring/award job internals owned by Lane 6B except shared contracts
- proof UI wiring owned by Lane 6D
- Stripe/payment state

### Lane 6B - Merchant Bid, Award, And Pickup Runtime

Owns merchant-side bid contracts, award scoring, and pickup/order state transitions on top of Lane 6A schema.

May edit:

- `useby-app/src/server/merchant/**`
- `useby-app/src/server/demand-pools/award.ts`
- `useby-app/src/server/demand-pools/scoring.ts`
- `useby-app/src/server/jobs/**`
- `useby-app/src/app/api/merchant/**`
- `useby-app/src/app/api/jobs/close-demand-pools/route.ts`
- focused tests for bid policy, scoring, award transactions, pickup state, and unavailable states

Must deliver:

- Merchant pool list/detail APIs using anonymised aggregate demand and merchant service area/location checks.
- Merchant bid APIs:
  - `GET /api/merchant/demand-pools`
  - `GET /api/merchant/bids`
  - `POST /api/merchant/bids`
  - `POST /api/merchant/bids/:bidId/withdraw`
- Pickup/order APIs after award:
  - `GET /api/merchant/pickups`
  - `POST /api/merchant/pickups/:orderId/ready`
  - `POST /api/merchant/pickups/:orderId/collected`
- A real `close-demand-pools` job that transitions expired/threshold pools, scores current bids, awards a winner, creates orders/pickups, records `job_runs`, and writes audit events.
- Bid score components for price, pickup window, distance/serviceability, available quantity, merchant reliability defaults, and substitution quality.
- Tests proving winner changes when meaningful bid inputs change.

Avoid:

- migrations/schema edits
- consumer pool UI
- merchant portal UI
- proof UI
- Stripe/payment state

### Lane 6C - Consumer DemandPool UI

Owns household-facing DemandPool UX.

May edit:

- `useby-app/src/app/pools/**`
- `useby-app/src/components/demand-pools/**`
- `useby-app/src/lib/demand-pools/**`
- `useby-app/src/app/page.tsx` only for navigation/link wiring
- page/component tests

Must deliver:

- `/pools` page with active pool list, create/join affordances, threshold progress, committed household counts, current user commitment state, and award/pickup state.
- Pool detail or inline expanded view showing requested items, max-price intent, pickup radius/area copy, merchant bids when safe, winning merchant after award, and pickup readiness.
- Commitment flow with quantity and max-price intent, loading, success, empty, unavailable, and validation/error states.
- Clear no-payment wording: commitments are unpaid demo intent and do not capture deposits/cards.
- Mobile and desktop responsive layout without text overlap.

Avoid:

- migrations/schema
- award algorithm internals
- merchant portal UI except shared components
- Stripe/payment controls

### Lane 6D - Merchant Portal UI, Proof, Contracts, And Docs

Owns merchant-facing pages plus CP6 proof wiring and checkpoint documentation.

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

- `/merchant` dashboard with active pools, bid form, submitted/winning/rejected bids, awarded pickup list, ready/collected controls, and demand summary.
- System state/proof counts for CP6 routes/tables: active pools, live commitments, merchant bids, awarded pools, pool orders, pickup tasks/orders, job runs, and CP6 audit events.
- Proof cards or controls for create/join pool, submit bids, close/award pool, ready pickup, collected pickup, and no-payment status.
- Contract tests for pool join threshold transition, bid submission, award winner selection, order creation, pickup ready/collected, privacy, and no-final-output seed guarantees.
- `docs/checkpoint-6-live-smoke.md` with local, migration, production, API, browser, and Aurora smoke expectations.

Avoid:

- migrations/schema except documentation of contracts
- core award algorithm implementation owned by Lane 6B
- consumer pool UI owned by Lane 6C
- Stripe/payment implementation

## Merge Order

1. Lane 6A schema and consumer DemandPool runtime.
2. Lane 6B merchant bid, award, job, and pickup runtime.
3. Lane 6C consumer DemandPool UI.
4. Lane 6D merchant portal UI, proof, contracts, and docs.
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

Live/prod smoke, after CP6 migration and deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/system/state
curl -i https://useby-app.vercel.app/api/demand-pools
curl -i https://useby-app.vercel.app/api/merchant/demand-pools
curl -i https://useby-app.vercel.app/api/jobs/close-demand-pools
```

Mutation smoke:

- Join a live pool from a household that is not already committed enough to be a duplicate-only path.
- Cross a threshold from current rows.
- Submit two merchant bids for the same pool.
- Change price or pickup window and verify score/winner changes before final award.
- Run close/award and verify one winning bid, rejected non-winners, generated orders/pickups, `job_runs`, and audit events.
- Mark a pickup ready and collected.
- Verify no payment/deposit/captured-charge state is written or claimed.

Browser smoke:

- Open `https://useby-app.vercel.app/pools`.
- Verify pools, threshold progress, join/create flow, award state, and pickup state render from live rows.
- Open `https://useby-app.vercel.app/merchant`.
- Verify merchant bid form, active pools, bid status, award status, and pickup list render from live rows.
- Open `https://useby-app.vercel.app/proof` and verify CP6 DemandPool and merchant evidence.

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

## Active Worker Registry

The orchestrator must update this table after worker creation.

| Lane | Thread ID | Worktree/Pending ID | Status | Notes |
|---|---|---|---|---|
| 6A DemandPool Schema And Consumer Runtime | `019f11f6-7b46-7600-ad63-6759126a6a16` | `/Users/abhinavgupta/.codex/worktrees/cecf/UseBy` | Active | Owns CP6 migration/schema and consumer pool APIs |
| 6B Merchant Bid, Award, And Pickup Runtime | `019f11f6-7b46-7600-ad63-676fbd2d7186` | `/Users/abhinavgupta/.codex/worktrees/bbb6/UseBy` | Active | Depends on 6A schema; no migrations |
| 6C Consumer DemandPool UI | `019f11f6-7d61-74f3-b8b7-547158565685` | `/Users/abhinavgupta/.codex/worktrees/b1cd/UseBy` | Active | Depends on 6A APIs |
| 6D Merchant Portal UI, Proof, Contracts, And Docs | `019f11f6-7f6f-7243-94d2-fd732f140d8c` | `/Users/abhinavgupta/.codex/worktrees/3c20/UseBy` | Active | Depends on 6A/6B routes and contracts |
