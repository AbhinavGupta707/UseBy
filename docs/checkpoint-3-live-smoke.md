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

Production migration, deployment, and browser/API smoke are still pending until `0002_booking_handoff_trust.sql` is applied to Aurora and the merged app is deployed.

## Migration Notes

Lane 3A owns schema and migrations. The CP3 migration should add or verify these tables and contracts:

- `bookings` with statuses including `requested`, `accepted`, `reserved`, `pickup_scheduled`, `picked_up`, `completed`, `reviewed`, `cancelled`, `declined`, and `disputed`;
- `handoffs` with pickup window, coarse pickup hint, actor timestamps, and completion metadata;
- `safety_acknowledgements`;
- `trust_events`;
- `reviews`;
- `reports`;
- `blocks`.

Apply the migration through the established Aurora/RDS Data API path. Record the migration file, Drizzle hash, production deployment id, and any unavailable table reasons in the checkpoint handoff.

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

## Browser Smoke

- Open `https://useby-app.vercel.app/grocery`.
- Record the food safety acknowledgement from the booking request flow.
- Request a booking from an eligible sealed/package-safe food match.
- Accept the booking from the owner context and verify the item becomes reserved.
- Attempt a second reservation for the same item and verify a conflict/unavailable state.
- Schedule pickup, mark picked up, complete, and submit a review.
- Open `https://useby-app.vercel.app/proof` and verify booking, handoff, safety acknowledgement, trust, review, report, and block proof rows.

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
