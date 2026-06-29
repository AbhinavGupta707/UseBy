# Checkpoint 2 Live Smoke Expectations

Checkpoint 2 proves the grocery loop is live, not precomputed:

- receipt or manual grocery input writes input rows to Aurora;
- expiry/storage/label edits write observations and inventory events;
- action cards are recomputed from current rows;
- food matches are generated from live item and need rows;
- `/proof` and `/api/system/state` expose `action_cards` and `matches` counts when those tables exist.

Seed data may create the Riverside Quarter input world only. It must not insert final `action_cards`, `matches`, bookings, awards, trust changes, reservations, notifications, or job output rows.

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

With Aurora env missing, the expected local state is honest unavailability:

- `/api/system/state` returns unavailable or partial state with every unavailable count carrying a reason.
- `action_cards` and `matches` appear in the count list as unavailable until the CP2 schema is applied.
- `/api/jobs/recompute-matches` returns `status: "unavailable"` rather than pretending a recompute succeeded.

With Aurora env configured and CP2 migrations applied:

- `POST /api/grocery/import` writes `receipt_imports`, `receipt_line_items`, `item_instances`, `inventory_events`, `expiry_observations`, and `audit_events`, and returns affected item ids for recompute.
- `PATCH /api/grocery/items/:itemId` writes `expiry_observations`, `inventory_events`, and `audit_events`, then changes active action-card counts after recompute.
- `GET /api/grocery/action-cards` returns public action-card DTOs without exact household coordinates.
- `POST /api/jobs/recompute-matches` refreshes `matches` and action cards from current rows and records `job_runs` plus `audit_events`.
- `GET /api/grocery/matches` returns public match DTOs without exact household coordinates.

## Production Smoke

After merge, migration, and deployment:

```bash
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i -X POST https://useby-app.vercel.app/api/demo/reset
curl -i -X POST https://useby-app.vercel.app/api/jobs/recompute-matches
curl -i https://useby-app.vercel.app/api/system/state
```

Expected production evidence:

- `db-proof` reports Aurora/PostGIS availability using sanitized metadata.
- `demo/reset` reseeds input rows only.
- `recompute-matches` records a real job or reports a precise unavailable reason.
- `system/state` reports live counts for `action_cards` and `matches` once the CP2 tables exist.
- `/proof` shows action-card and match row counts as live numbers, not hidden behind generic table totals.

Browser smoke:

- Open `https://useby-app.vercel.app/grocery`.
- Import a demo receipt and confirm new grocery rows and visible cards.
- Edit an expiry/storage/label field and confirm card state changes after recompute.
- Add a nearby food need and confirm an eligible sealed/package-safe item can produce a match.
- Confirm restricted, opened, unknown, or high-risk grocery items do not produce neighbour-sharing cards or matches.

## Completed Production Smoke

Completed on 2026-06-29 against `https://useby-app.vercel.app`.

- Production deployment: `dpl_DvdCPj48gJgLa1N3kyXeLB3X2SJj`.
- Aurora migration: `drizzle/0001_grocery_inventory_runtime.sql` applied through AWS CloudShell/RDS Data API; Drizzle hash `be9570ba951834fd4a854dc69f27601f578ee8e3b291ecd8655c60ec99747e93`.
- `GET /api/system/db-proof` returned `status: "available"` with PostgreSQL `17.7` and installed `postgis`, `vector`, `pgcrypto`, and `pg_trgm`.
- `POST /api/jobs/recompute-matches` returned `status: "succeeded"`, `actionCards.generated: 39`, and `matches.generated: 3`.
- `GET /api/grocery/action-cards` returned `status: "available"` and `count: 39`.
- `GET /api/grocery/matches` returned `status: "available"` and `count: 3`, with coarse locations and approximate distances only.
- `GET /api/system/state` returned live counts for `action_cards` and `matches` plus a succeeded recompute job/audit event.
- Browser smoke for `/grocery` showed `Live`, `3/3 grocery routes live`, `39` action cards, and `3` matches.
- Browser smoke for `/proof` showed live Aurora/Data API/PostGIS status and HTTP 200 system endpoints.

## Integrated Unavailable States

Before Aurora env is configured or before the CP2 migration has run:

- `action_cards` may be reported as unavailable because the CP2 table is missing in the live database.
- `matches` may be reported as unavailable if the table or active-count status column is missing in the live database.
- `/api/grocery/import`, `/api/grocery/items/:itemId`, and `/api/jobs/recompute-matches` must return precise unavailable/error JSON rather than seeded final output.
- `/proof` must surface missing-table or missing-env reasons instead of implying live recompute success.

## Safety And Privacy

- Do not claim UseBy certifies food safety or freshness.
- Neighbour food sharing is limited to eligible sealed/package-safe grocery items until fuller compliance rules are implemented.
- Public APIs must expose coarse area or approximate distance only, not exact household coordinates.
- Do not print or commit plaintext secrets; ARNs and resource IDs are acceptable.
