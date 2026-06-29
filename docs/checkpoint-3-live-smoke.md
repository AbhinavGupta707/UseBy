# Checkpoint 3 Live Smoke Expectations

Checkpoint 3 proves the booking, handoff, trust, and safety lifecycle is live, transactional, and privacy-safe:

- a live eligible grocery match can become a booking request;
- food sharing requests require a recorded safety acknowledgement;
- owner accept/decline/cancel and receiver pickup/completion/review actions mutate Aurora rows;
- accepting a booking transactionally reserves the item and rejects double reservation;
- completion writes trust, inventory, and audit evidence from current rows;
- `/proof` and `/api/system/state` expose booking, handoff, safety acknowledgement, trust event, review, report, and block counts when those tables exist.

Seed data may create the Riverside Quarter input world only. It must not insert final booking transitions, handoffs, safety acknowledgements, trust events, reviews, reports, blocks, reservations, notifications, or audit/job outputs that should be produced by user actions.

## Local Checks

Run from `useby-app`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Then run from the repository root:

```bash
git diff --check
```

Focused CP3 checks while lanes are integrating:

```bash
npm run test -- src/lib/system-state/service.test.ts src/lib/proof-ui/adapters.test.ts src/lib/proof-ui/checkpoint-3-contracts.test.ts
```

Before CP3 runtime routes are merged, the CP3 contract suite is expected to fail usefully on missing route/runtime files. After Lane 3A/3B integration, the same suite should pass route installation and transaction-contract checks.

### Integrated Main Result

After merging Lanes 3A, 3B, 3C, and 3D into `main`, the master integration patch connected the booking runtime to the safety/trust policy hooks and removed public wording that could be read as a food-safety overclaim.

Verified locally from `useby-app`:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed: 24 files, 83 tests.
- `npm run build` passed.

Verified from the repository root:

- `git diff --check` passed.

Production migration, deployment, and browser/API smoke are complete for Checkpoint 3.

Additional production-smoke fixes:

- `ccdd34b` fixed `safety_acknowledgements` writes so live inserts include required `neighbourhood_id`, `demo_scope_id`, and `is_demo`.
- `2fc9b3c` removed an invalid `SET TRANSACTION ISOLATION LEVEL` call from booking acceptance after RDS Data API had already started the transaction. The accept path still uses row locking and the active-reservation exclusion/unique-index contract.

## Migration Notes

Lane 3A owns schema and migrations. The CP3 migration should add or verify these tables and contracts:

- `bookings` with statuses including `requested`, `accepted`, `reserved`, `pickup_scheduled`, `picked_up`, `completed`, `reviewed`, `cancelled`, `declined`, and `disputed`;
- `handoffs` with pickup window, coarse pickup hint, actor timestamps, and completion metadata;
- `safety_acknowledgements`;
- `trust_events`;
- `reviews`;
- `reports`;
- `blocks`.

Applied through the established Aurora/RDS Data API path:

- Migration file: `useby-app/drizzle/0002_booking_handoff_trust.sql`.
- Drizzle hash: `191bafac29eac912908c7ef3932fce2e7d70ea9e6dba6aa52a3ea8e2247bfa19`.
- Verified tables: `bookings`, `handoffs`, `safety_acknowledgements`, `trust_events`, `reviews`, `reports`, and `blocks`.
- Verified Drizzle record exists.

## Local Runtime Smoke

With Aurora env missing, the expected local state is honest unavailability:

- `/api/system/state` returns unavailable or partial state with every unavailable count carrying a reason.
- CP3 proof rows for `bookings`, `handoffs`, `safety_acknowledgements`, `trust_events`, `reviews`, `reports`, and `blocks` remain visible with unavailable reasons.
- CP3 routes return `status: "unavailable"` or HTTP errors with precise reasons, not seeded success.

With Aurora env configured and CP3 migrations applied:

- `POST /api/safety/acknowledgements` writes `safety_acknowledgements` and `audit_events`.
- `POST /api/bookings/request` fails without acknowledgement, unsafe food, or blocked relationship; succeeds for eligible sealed/package-safe grocery items.
- `POST /api/bookings/:bookingId/accept` reserves the item transactionally and writes `bookings`, `inventory_events`, and `audit_events`.
- A second accept/request path for the same item returns a live conflict and does not reserve the item twice.
- `POST /api/bookings/:bookingId/decline` and `POST /api/bookings/:bookingId/cancel` write terminal booking/audit state and release reservations when applicable.
- `POST /api/bookings/:bookingId/schedule-pickup`, `picked-up`, `complete`, and `review` advance handoff state and write the expected trust/review/audit rows.
- `POST /api/reports` and `POST /api/blocks` write moderation rows and are enforced by booking guards.

## Production API Smoke

After merge, migration, and deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/system/state
curl -i -X POST https://useby-app.vercel.app/api/safety/acknowledgements
curl -i -X POST https://useby-app.vercel.app/api/bookings/request
curl -i https://useby-app.vercel.app/api/bookings
curl -i -X POST https://useby-app.vercel.app/api/reports
curl -i -X POST https://useby-app.vercel.app/api/blocks
```

Expected production evidence:

- `db-proof` reports Aurora/PostGIS availability using sanitized metadata.
- `system/state` reports CP3 counts when tables exist and exact unavailable reasons when they do not.
- mutation routes reject missing demo actor/body inputs with clear JSON rather than claiming success.
- successful booking/handoff actions update `/api/system/state` counts and latest audit events.
- public booking and match DTOs do not include raw latitude/longitude or direct contact fields.

### Completed Production Result

Deployment:

- Production deployment: `dpl_HZ6jvZNpmugJ9wnVvGNEJXSgKAyU`.
- Public alias: `https://useby-app.vercel.app`.

API smoke:

- `GET /api/system/db-proof` returned `status: "available"` with Aurora PostgreSQL `17.7`, PostGIS, pgvector, pgcrypto, and pg_trgm available.
- `GET /api/system/state` returned CP3 counts for all migrated tables.
- Invalid empty `POST` requests to `/api/safety/acknowledgements`, `/api/bookings/request`, `/api/reports`, and `/api/blocks` returned clear HTTP `400` JSON errors.
- Live booking flow succeeded from current Aurora rows:
  - run id: `cp3-live-1782709367234`;
  - booking id: `1cc06fa5-d95c-408d-88c4-a5c71a45ceb4`;
  - match id: `f5c7a439-6f04-4fb7-9217-16ae1c34d31e`;
  - item id: `d524c70c-b88d-5810-af8b-f77ca5ee041c`;
  - duplicate reservation attempt returned HTTP `409` with `Item state is reserved.`;
  - final booking status: `reviewed`.
- System-state count movement during the successful flow:
  - `handoffs`: `0` to `1`;
  - `safetyAcknowledgements`: `1` to `2`;
  - `trustEvents`: `0` to `3`;
  - `reviews`: `0` to `1`.

Aurora auto-pause note:

- The first production proof request returned an honest unavailable state while Aurora Serverless was resuming. A retry after wake-up returned available state and the smoke proceeded.

## Browser Smoke

- Open `https://useby-app.vercel.app/grocery`.
- Record the food safety acknowledgement from the booking request flow.
- Request a booking from an eligible sealed/package-safe food match.
- Accept the booking from the owner context and verify the item becomes reserved.
- Attempt a second reservation for the same item and verify a conflict/unavailable state.
- Schedule pickup, mark picked up, complete, and submit a review.
- Open `https://useby-app.vercel.app/proof` and verify booking, handoff, safety acknowledgement, trust, review, report, and block proof rows.

Completed browser result:

- `/grocery` rendered on the production alias with live route state and no app error.
- `/bookings` rendered on the production alias with live booking route state and no app error.
- `/proof` rendered on the production alias with CP3 architecture/proof state and no app error.

## Unavailable States

Unavailable CP3 states are acceptable only when explicit and actionable:

- missing Aurora env should name the missing env keys without printing secret values;
- missing CP3 tables should show `table is not available` or missing-column reasons;
- missing routes should return 404/unavailable and should appear as unavailable in `/proof`;
- blocked, unsafe, unauthorised, and duplicate-reservation attempts should return conflict/policy errors without mutating final state.

## Safety And Privacy

- Do not claim UseBy certifies food safety or freshness.
- Neighbour food sharing remains limited to eligible sealed/package-safe grocery items.
- Show allergen and uncertainty warnings before handoff.
- Before acceptance, expose only coarse labels or approximate distance.
- After acceptance, expose only a coarse pickup hint, never raw household coordinates.
- Do not expose direct phone, email, address, or other personal contact fields in public APIs.
- Reports and blocks must affect booking request, accept, complete, and review policy.
