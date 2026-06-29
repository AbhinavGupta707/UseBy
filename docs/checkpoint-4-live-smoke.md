# Checkpoint 4 Live Smoke

Checkpoint 4 proves wardrobe rental and household lending against live Aurora rows. Seed data may create listed fashion/household items and open needs, but lending requests, reservations, handoffs, returns, completions, reviews, trust changes, and CP4 audit evidence must come from live API actions.

## Completed Local And Migration Evidence

Completed on 2026-06-29 before production deployment:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed: 32 files, 116 tests.
- `npm run build` passed.
- `git diff --check` passed.
- Aurora migration `useby-app/drizzle/0003_lending_schema_runtime.sql` applied through the RDS Data API.
- Migration hash recorded in `drizzle.__drizzle_migrations`: `efe8381a07ffe76b227e482f42482fc6263f980ee8b9ec5f25059d8ad5dd18ab`.
- Verified live Aurora tables: `lending_availability_windows`, `lending_reservations`, and `lending_condition_events`.
- `drizzle-kit migrate` woke the paused cluster but exited without a usable diagnostic, so the same SQL was applied in one explicit RDS Data API transaction and the Drizzle hash was recorded manually.

## Local Checks

Run from `useby-app`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Focused pre-merge checks for Lane 4D:

```bash
npm run test -- src/lib/system-state/service.test.ts src/lib/proof-ui/adapters.test.ts src/lib/proof-ui/checkpoint-4-contracts.test.ts
npm run typecheck
```

Then run from the repository root:

```bash
git diff --check
```

Expected local proof behavior:

- `/api/system/state` reports CP4 counts for listed fashion/household inputs and reused booking, handoff, trust, and review evidence.
- CP4 lending tables such as `lending_availability_windows`, `lending_reservations`, and `lending_condition_events` are reported as unavailable until the migration installs them.
- `/proof` shows CP4 lending controls. Missing lending routes must appear unavailable rather than successful.
- Wording remains privacy-safe: no exact coordinates, no direct contact fields, and no payment-captured claims.
- Grocery safety copy remains uncertainty-based and must not claim certified freshness or guaranteed safety.

## Aurora Migration

Apply the Lane 4A migration before production smoke. Keep the Aurora/free-credit posture:

- Do not enable AWS Organizations or IAM Identity Center via Organizations.
- Do not print or commit plaintext secrets.
- Secret ARNs, cluster ARNs, database names, and resource IDs may be referenced in deployment settings.

After migration, verify the schema layer before debugging runtime symptoms:

1. Confirm `/api/system/db-proof` can reach Aurora and reports required extensions.
2. Confirm `/api/system/state` includes available CP4 counts for installed tables.
3. Confirm any optional CP4 tables expected by Lane 4A exist before testing policy/runtime failures.

## Production Deployment

Deploy the merged CP4 app only after schema/runtime/policy/UI/proof lanes are merged in orchestration order. Preserve SSO protection on non-public Vercel deployment URLs; use the public production alias for judging.

Production URL:

```text
https://useby-app.vercel.app
```

Required environment posture:

- Aurora Data API variables configured in Vercel.
- S3 variables configured only when storage proof is expected.
- No Stripe/payment capture variables are required for CP4.

## API Smoke

Use `curl -i` so status codes and headers are visible:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/system/state
curl -i https://useby-app.vercel.app/api/lending/listings
curl -i https://useby-app.vercel.app/api/lending/requests
curl -i -X POST https://useby-app.vercel.app/api/lending/request
```

For mutation smoke, send the required JSON body from current demo rows and a fresh idempotency key. Do not reuse stale booking IDs from seed output; choose IDs returned by live listing/request responses.

Expected API results:

- Listings include only `fashion` and `household` items in a public/listed state.
- Responses expose coarse area or pickup hints only, not exact latitude/longitude or direct contact fields.
- Request rejects grocery, private/unlisted items, same-household requests, blocked relationships, invalid windows, and overlapping active reservations.
- Accept/reserve prevents a second overlapping active lending booking for the same item/window.
- Return, complete, and review write live handoff, inventory, trust/review, and audit evidence.
- Payment/deposit wording is informational only. No response may claim Stripe, card, deposit, or payment capture.

## Browser Smoke

Open:

```text
https://useby-app.vercel.app/lending
```

Check:

1. Fashion and household tabs or filters load live Aurora item rows.
2. Listing cards show condition, availability, return/cleaning expectations, and coarse owner area.
3. Request a wardrobe or household item for a real window.
4. Accept the request from the owner context and verify the item/window becomes reserved.
5. Attempt a second overlapping request and verify a live conflict.
6. Advance picked-up/returned/complete/review states when the UI exposes those controls.
7. Open `/proof` and verify CP4 row counts and lending controls reflect the live actions.

## No-Payment Constraint

Checkpoint 4 has no Stripe or payment ledger implementation. Deposit preferences may appear as owner terms only. The product must not:

- claim money was captured, charged, collected, or processed;
- write payment/deposit ledger rows;
- block completion on payment status;
- imply UseBy is holding a deposit.

Any future payment work belongs to a later checkpoint and must be introduced with a separate contract, migration, and smoke plan.
