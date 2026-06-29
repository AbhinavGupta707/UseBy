# Checkpoint 2 Orchestration Control

Checkpoint 1 live-smoke commit: `c584f08`
Worker launch base: current `main` after this control document is committed.

## Outcome

Checkpoint 2 delivers the grocery product loop:

- A demo household can create grocery inventory through receipt/manual input.
- Expiry observations and storage/label edits update live Aurora rows.
- Deterministic action cards are recomputed from current inventory, expiry, safety, and need rows.
- PostGIS food matches are generated from live item and need rows.
- The consumer UI shows live grocery shelf, action cards, receipt input, expiry edit/scan surfaces, and match rationale.

No final action card or match output may be seeded. Seed data remains input world state only.

## Product Gates

- Importing a receipt creates `receipt_imports`, `receipt_line_items`, `item_instances`, `inventory_events`, expiry observations where relevant, audit rows, and then recomputed action cards/matches.
- Changing storage state, label date, or expiry confidence changes action cards after recompute.
- Adding a neighbour food need creates a live match when a safe eligible item exists within radius.
- Restricted/opened/high-risk grocery items do not create neighbour-sharing cards or matches.
- `/proof` and system state expose action-card/match counts once tables exist.
- Public APIs do not expose exact household coordinates.
- Demo actor/household context is explicit and replaceable by real auth later.

## Lane Split

### Lane 2A - Grocery Schema And Inventory Runtime

Owns all Checkpoint 2 schema/migration changes.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/grocery/**`
- `useby-app/src/server/demo/**`
- `useby-app/src/app/api/grocery/**`
- focused tests for these areas
- `.env.example` only if a new non-secret env var is strictly required

Must deliver:

- Drizzle schema and migration for CP2 tables not already present, including at minimum `action_cards` and `matches`.
- Any enum additions needed by action-card/match status.
- Demo actor/household context helper, defaulting to a seeded Riverside Quarter household/user while accepting explicit demo household/user selectors through safe headers or query params.
- Receipt/manual grocery import route that writes input rows and audit events, idempotently.
- Expiry/storage/label update route that writes expiry observations, inventory events, and audit events.
- Public response DTOs that omit exact coordinates.

Avoid:

- frontend pages/components except minimal smoke helpers
- action-card/match ranking logic beyond invoking the Lane 2B contract if present
- booking, trust, payments, DemandPool award logic

### Lane 2B - Action Engine And Food Matching

Owns computed grocery outputs.

May edit:

- `useby-app/src/server/actions/**`
- `useby-app/src/server/matching/**`
- `useby-app/src/server/jobs/**`
- `useby-app/src/app/api/jobs/recompute-matches/**`
- `useby-app/src/app/api/grocery/action-cards/**`
- `useby-app/src/app/api/grocery/matches/**`
- focused tests for these areas

Must deliver:

- Deterministic action-card recompute from live inventory rows.
- Food safety eligibility rules. Share cards/matches require eligible, sealed/package-safe item state; restricted/opened/unknown items must not be shareable.
- PostGIS food matching between live needs and eligible item instances, with distance, score, and explanation fields.
- Idempotent recompute route/job that writes `job_runs` and `audit_events`.
- Honest unavailable response if CP2 schema has not landed yet.

Avoid:

- editing migrations or `src/db/schema.ts`
- UI implementation
- booking/reservation state transitions

### Lane 2C - Consumer Grocery UI

Owns the grocery user experience.

May edit:

- `useby-app/src/app/page.tsx`
- `useby-app/src/app/grocery/**`
- `useby-app/src/components/grocery/**`
- `useby-app/src/lib/grocery/**`
- page/component tests

Must deliver:

- Live Home Shelf or `/grocery` surface consuming CP2 API routes.
- Inventory list with expiry bands, safety status, and storage state.
- Receipt/manual import form using live API.
- Expiry/label edit controls using live API.
- Action card and match panels with rationale, safety wording, loading/error/unavailable/empty states.
- Mobile and desktop responsive layout without text overlap.

Avoid:

- migrations/schema
- DB runtime internals
- final booking/handoff flows

### Lane 2D - QA, Contracts, And Proof Integration

Owns verification and proof wiring.

May edit:

- `useby-app/src/lib/system-state/**`
- `useby-app/src/lib/proof-ui/**`
- `useby-app/src/components/proof/**`
- `useby-app/src/app/proof/**`
- `docs/**`
- tests and fixtures

Must deliver:

- System state/proof counts for `action_cards` and `matches` when tables exist.
- Contract tests for receipt import, expiry edits, action-card recompute, matching, and no-final-output seed guarantees.
- Safety wording scan/tests for food claims.
- Update docs with CP2 live-smoke expectations.

Avoid:

- migrations/schema except documentation of contracts
- UI grocery pages/components owned by Lane 2C
- implementation of core action/match algorithms owned by Lane 2B

## Merge Order

1. Lane 2A schema/inventory runtime.
2. Lane 2B action engine/matching, adjusted to landed schema.
3. Lane 2C grocery UI, adjusted to landed APIs.
4. Lane 2D QA/proof/docs.
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

Live/prod smoke, after deployment if CP2 passes local checks:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i -X POST https://useby-app.vercel.app/api/demo/reset
curl -i -X POST https://useby-app.vercel.app/api/jobs/recompute-matches
curl -i https://useby-app.vercel.app/api/system/state
```

Browser smoke:

- Open `https://useby-app.vercel.app/grocery` or the CP2 grocery surface.
- Verify receipt/manual input creates rows and visible cards.
- Verify expiry edit changes card state.
- Verify proof page shows action-card/match evidence.

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
| 2A Grocery Schema And Inventory Runtime | `019f10d5-68d7-7220-9286-9ce00cdcb77a` | `/Users/abhinavgupta/.codex/worktrees/0005/UseBy` | Merged | Worker commit `e81b63f`; merge commit `4491df8`; owns all CP2 migrations/schema |
| 2B Action Engine And Food Matching | `019f10d5-b450-7151-a62a-565f4e78afa1` | `/Users/abhinavgupta/.codex/worktrees/ccd1/UseBy` | Merged | Worker commit `f266e91`; merge commit `3bcb131`; no schema edits |
| 2C Consumer Grocery UI | `019f10d7-687f-7c23-959b-552f7b0da41a` | `/Users/abhinavgupta/.codex/worktrees/1325/UseBy` | Merged | Worker commit `79fb3d9`; merge commit `5cec929`; API route alignment commit `5cd6c1a` |
| 2D QA Contracts And Proof Integration | `019f10d7-9c3d-7820-941e-61df0f663866` | `/Users/abhinavgupta/.codex/worktrees/f534/UseBy` | Merged | Worker commit `32410ab`; merge commit `1e2f728`; proof docs/tests reconciled after API route merge |

## Integration Result

Merged on `main` in dependency order. Master integration fixes:

- `5cd6c1a` aligned the grocery UI helper with landed live routes: `/api/grocery/import`, `/api/grocery/items/:itemId`, `/api/grocery/action-cards`, `/api/grocery/matches`, and `/api/jobs/recompute-matches`.
- Proof contract tests and `docs/checkpoint-2-live-smoke.md` were updated after merge to remove pre-merge route guesses.
- `273cb5c` made the recompute job idempotent against the partial `job_runs_idempotency_key_idx` index.
- `1dc0727` cast recompute job status values to `job_run_status` for Aurora PostgreSQL enum writes.
- `d6cda72` aligned CP2 action-card/match runtime SQL with the landed schema: `recompute_key` plus JSONB rationale payloads.

Local verification after live-smoke fixes:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed: 15 files, 49 tests.
- `npm run build` passed and listed the CP2 grocery routes plus `/grocery`.
- `git diff --check` passed.

Live verification completed on 2026-06-29:

- Applied `drizzle/0001_grocery_inventory_runtime.sql` to Aurora `useby` via AWS CloudShell and RDS Data API in one transaction.
- Recorded Drizzle migration hash `be9570ba951834fd4a854dc69f27601f578ee8e3b291ecd8655c60ec99747e93` with `created_at` `1782694741126`.
- Final production deployment: `dpl_DvdCPj48gJgLa1N3kyXeLB3X2SJj`, aliased to `https://useby-app.vercel.app`.
- `POST /api/jobs/recompute-matches` returned `status: "succeeded"` with `39` generated action cards and `3` generated matches.
- `GET /api/grocery/action-cards` returned `status: "available"` with `count: 39`.
- `GET /api/grocery/matches` returned `status: "available"` with `count: 3`.
- `GET /api/system/state` returned Aurora-backed counts including `actionCards: 39`, `matches: 3`, and the latest recompute job as `succeeded`.
- Browser smoke for `/grocery` showed `Live`, `3/3 grocery routes live`, `39` action cards, and `3` matches.
- Browser smoke for `/proof` showed live Aurora/Data API/PostGIS status and HTTP 200 system endpoints.
