# Checkpoint 9 Live Smoke And QA Plan

Created: 2026-06-29

This plan verifies CP9 after the agent runtime, consumer UI, workflow UX, and docs lanes merge. It is the integration smoke plan for the premium UI and live agent routes now installed on `main`.

## Layer Order

When something is missing or unavailable, diagnose in this order:

1. Route/page registration.
2. Discovery in the UI or proof/admin navigation.
3. Install/migration state and env activation flow.
4. Provider/runtime permissions and remote service behavior.

Do not debug Fireworks, LangSmith, notification permissions, or AWS runtime if the route/page/table is not present yet.

## Integrated CP9 Gates

The integrated CP9 codebase now includes the runtime/UI routes below. Treat failures by layer order:

- `POST /api/agent/receipt-draft` is the receipt/manual-input agent draft route.
- `POST /api/agent/action-plan` is the advisory action-plan draft route.
- `GET /api/agent/runs` and `/agent-runs` are admin/proof surfaces for redacted run metadata.
- `/matches` and `/activity` remain folded into the premium Today/Inventory/Bookings surfaces for CP9; absence of separate pages is not a CP9 failure.
- Notification contract tests cover the required runtime columns, but live success still depends on the deployed notifications table matching those columns.

The CP9 `0007_agent_runtime_contracts` migration must be installed before agent run persistence can succeed. A not-migrated response from `/api/agent/runs` is a migration/deploy gate, not a provider-key problem.

## Local Verification

Run from `useby-app`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Run from the repository root:

```bash
git diff --check
```

If browser tools are available, start the app locally:

```bash
cd useby-app
npm run dev
```

Then smoke `http://localhost:3000` at desktop and mobile widths.

## Production Read-Only API Smoke

Base URL:

```text
https://useby-app.vercel.app
```

Read-only endpoints and expected states:

| Endpoint | Expected |
| --- | --- |
| `GET /api/system/db-proof` | HTTP 200 after any Aurora auto-pause retry; database proof names PostgreSQL and installed extensions. |
| `GET /api/system/state` | HTTP 200 with live counts, provider states, row-count evidence, and no plaintext secrets. |
| `GET /api/grocery/inventory` | HTTP 200 or honest unavailable state; rows are current Aurora inventory, not seeded final output. |
| `GET /api/grocery/action-cards` | HTTP 200 or honest unavailable state; action cards are computed from current rows. |
| `GET /api/grocery/matches` | HTTP 200 or honest unavailable state; matches expose coarse distance/location only. |
| `GET /api/bookings` | HTTP 200 or honest unavailable state; booking timeline data hides direct contact details. |
| `GET /api/demand-pools` | HTTP 200 or honest unavailable state; commitments remain unpaid demo intent. |
| `GET /api/store-drops` | HTTP 200 or honest unavailable state; reservation capacity and closed/sold-out status are deterministic. |
| `GET /api/store-drops/reservations` | HTTP 200 or honest unavailable state; no card/deposit/payment capture state. |
| `GET /api/jobs/pickup-reminders` | HTTP 200 with `ok`, `skipped`, or honest unavailable contract reason; must not throw due to notification schema mismatch. |
| `GET /api/notifications` | HTTP 200 scoped notifications or honest unavailable state; no direct contact fields. |
| `GET /api/merchant/heatmap` | HTTP 200 or honest unavailable state; coarse aggregated demand only. |
| `GET /api/merchant/demand-pools` | HTTP 200 or honest unavailable state; bid state comes from current rows. |
| `GET /api/merchant/store-drops` | HTTP 200 or honest unavailable state; merchant drop rows are live. |

Installed CP9 agent endpoints:

| Endpoint | Expected |
| --- | --- |
| `POST /api/agent/receipt-draft` | Registered; without keys returns deterministic/fallback draft state, with keys returns Fireworks draft plus deterministic validation requirements. |
| `POST /api/agent/action-plan` | Registered; returns draft/explanation only from current action cards. |
| `GET /api/agent/runs` | Registered; lists redacted run metadata, fallback state, provider, model, and trace id if available, or reports the CP9 migration as unavailable. |

Deferred CP9-adjacent endpoints:

| Endpoint | State |
| --- | --- |
| `POST /api/agent/match-explanations` | Deferred; match copy remains deterministic/customer-safe in CP9. |
| `POST /api/agent/pool-assistant` | Deferred; merchant bid/drop assistant is not part of the CP9 installed route contract. |
| `POST /api/agent/drop-assistant` | Deferred; merchant surplus assistant is not part of the CP9 installed route contract. |
| `GET /api/agent/runs/[runId]` | Deferred; CP9 lists redacted run summaries only. |
| `POST /api/agent/runs/[runId]/resume` | Deferred; CP9 receipt review uses explicit user confirmation in the UI. |

If an installed CP9 agent endpoint is `404`, record "route not registered/deployed" and stop that branch of diagnosis.

## Provider State Matrix

No-key state:

- Fireworks: API routes and UI must return fallback/unavailable states. No page should claim AI extraction, agent planning, or semantic ranking succeeded.
- LangSmith: `disabled` when tracing is off; `unavailable` when tracing is on without a key. Do not show fake trace ids.
- Semantic ranking: disabled/unavailable; deterministic order is used and candidate eligibility is still enforced.
- Notifications/email: in-app row generation may work if table contract is present; email must be `email_dry_run`, `email_unavailable`, or equivalent no-key wording.
- Geocoding: unavailable/no-key is acceptable. Coarse fixture/demo labels can still display, exact coordinates cannot.

Keyed state:

- Fireworks calls use OpenAI-compatible `/chat/completions` and configured model names.
- Fireworks failures return deterministic fallback drafts/copy.
- LangSmith records trace metadata only after an actual agent run executes.
- LangSmith trace ids must be metadata links/proof, not proof that AI made a product decision.
- Provider errors should not block deterministic grocery, match, booking, pool, or drop flows.

## UI Reference Fidelity Checklist

Use `design-system/useby/MASTER.md` and `UI References/11.png` through `UI References/14.png`.

### Reference 11 - Today

- Left rail on desktop with UseBy brand and primary nav.
- Top bar includes location selector, search, notification/user controls.
- Greeting and hero illustration/photography are first-viewport signals.
- Four simple priority cards with large imagery and one CTA each.
- Nearby opportunities are compact, visual, and below the priorities.
- Proof/checkpoint/system state copy is demoted out of the customer path.
- Mobile keeps the same hierarchy without horizontal scroll or covered content.

### Reference 12 - Inventory

- Inventory title uses editorial serif scale, not dashboard microcopy.
- Category tabs cover groceries, wardrobe, and household.
- Search/filter/sort controls sit above product cards.
- Product cards show imagery, expiry/status chip, quantity, and one clear action.
- Ready-to-share cards are wider and more editorial than proof tables.
- Scan/add label CTA is visible but not noisy.
- Desktop card density resembles the reference; mobile preserves readable spacing.

### Reference 13 - Matches

- Matches page has filter pills and a map strip/list blend.
- Map is coarse/neighbourhood-level, not exact household coordinates.
- Match cards include image, need/title, distance, pickup timing, area, trust/review signal, reason chip, and one CTA.
- Reason chips are compact and plain-language.
- Safety acknowledgement gates booking; safety proof is not an oversized paragraph in the list.
- Mobile cards stack without button/text overlap.

### Reference 14 - Pools

- Featured pool card dominates the first pool view with merchant/product imagery.
- Progress, target, savings, participants, close time, and pickup/delivery are visible.
- CTA says join/view pool without implying payment capture.
- Supporting pool cards use compact progress bars and merchant identity.
- Best bid/offer is plain-language and still payment-deferred.
- Footer proof copy is small; proof is secondary.

### Global Visual QA

- Palette: warm cream base plus deep green, sage, soft gold, coral; avoid one-note beige or green-only screens.
- Typography: editorial serif headings and readable sans UI text; no negative letter spacing.
- Imagery: customer pages use meaningful product/neighbourhood/merchant images.
- Card density: cards are compact enough for repeat use and do not become giant proof panels.
- Spacing: verify 320, 375, 414, 768, 1024, 1280, 1440, and 1920 widths.
- Controls: 44px minimum tap target, visible focus states, cursor on clickable elements.
- Motion: no layout-shifting hovers; reduced-motion support for non-essential animation.
- Privacy: no exact household coordinates, unit labels, raw addresses, direct email/phone, or raw uploaded file text.
- Proof demotion: Proof and Agent runs are available for judges/admin, but not the primary customer journey.

## Browser Smoke Path

Smoke these routes in order:

1. `/`
2. `/grocery`
3. `/pools`
4. `/drops`
5. `/bookings`
6. `/merchant`
7. `/proof`
8. `/agent-runs`

For each route:

- Hard refresh once.
- Confirm no console-breaking visual state is visible.
- Confirm loading/error states are honest and do not show fake provider success.
- Confirm page content fits at mobile and desktop widths.
- Confirm customer pages keep proof/admin text out of the main path.

## Mutation Smoke Path

Use current live IDs returned by list endpoints. Do not reuse stale IDs from old smoke logs.

1. `POST /api/demo/reset` if a clean demo scope is required.
2. Add or import grocery rows through the installed grocery intake/import route.
3. Run or refresh action-card/match routes.
4. Request a booking through `POST /api/bookings/request` only for an active eligible match.
5. Commit to a pool through `POST /api/demand-pools/:poolId/commit`.
6. Reserve and optionally cancel a store drop through `POST /api/store-drops/:dropId/reserve` and `POST /api/store-drops/:dropId/cancel-reservation`.
7. Run `GET /api/jobs/pickup-reminders`.
8. Check `/proof` and `/api/system/state` for current audit/job/provider evidence.

Passing smoke means each mutation is reflected by a later read from Aurora-backed routes, and no mutation claims payment, safety certification, exact contact/location exposure, or AI authority.

## Integration Risk Log

- Agent routes and `/agent-runs` are CP9 integrated deliverables. Treat absence as route-registration/deploy gap.
- Notifications are only fully working when deployed schema includes the runtime columns in `REQUIRED_NOTIFICATION_COLUMNS`.
- LangSmith evidence is valid only when a real run has a trace id. Configured env alone is readiness, not trace proof.
- UI fidelity must be judged from rendered screenshots, not static docs.
- Browser smoke may be skipped in isolated lane worktrees; record the exact manual path above when browser tooling is unavailable.

## Completed Production Smoke

Completed on 2026-06-29 after CP9 integration commit `8091d08`.

Full-smoke deployment:

- Production deployment id: `dpl_2gkXv8BFzE6XeHrAvYrNvLviED5K`.
- Public alias: `https://useby-app.vercel.app`.

Final alias deployment after the docs-only smoke record:

- Production deployment id: `dpl_BV5WB3XprPNExjBhzvNN6m1ViQfm`.
- Public alias: `https://useby-app.vercel.app`.
- Quick post-alias smoke passed for `/api/system/state`, `/api/agent/receipt-draft`, `/api/agent/action-plan`, and `/grocery`.

Local verification:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed with `65` files and `223` tests.
- `npm run build` passed.
- `git diff --check` passed.

Provider and API smoke:

- Fireworks key and base URL were configured, but the earlier default model `accounts/fireworks/models/kimi-k2-instruct-0905` was not available in this Fireworks account. Production env and tracked defaults were switched to `accounts/fireworks/models/kimi-k2p5`.
- `POST /api/agent/receipt-draft` returned HTTP `201`, `providerStatus: generated`, `providerName: fireworks`, model `accounts/fireworks/models/kimi-k2p5`, and `3` reviewable draft items.
- `POST /api/agent/action-plan` returned HTTP `201`, `providerStatus: generated`, `providerName: fireworks`, model `accounts/fireworks/models/kimi-k2p5`, and `3` advisory cards.
- LangSmith readiness returned `configured`; trace ids remain absent because CP9 does not yet run a LangGraph traced workflow and agent persistence is not migrated.
- `GET /api/agent/runs` returned HTTP `503` with an honest migration-unavailable message for the missing `agent_runs` table.
- `GET /api/system/db-proof` and `GET /api/system/state` returned HTTP `200` available states.
- `GET /api/jobs/pickup-reminders` returned HTTP `200` with a skipped state.

Browser smoke:

- Rendered `/`, `/grocery`, `/pools`, `/drops`, `/bookings`, `/proof`, and `/agent-runs` at desktop `1440x1000` and mobile `390x844`.
- Customer pages had no horizontal overflow, no console errors, and no checkpoint/route-state diagnostics.
- `/agent-runs` had expected console fetch errors from `GET /api/agent/runs` returning HTTP `503` and a deferred-route probe returning HTTP `404`.
- Screenshots were captured in `/private/tmp/useby-cp9-production-smoke`.

Still required:

- Apply Aurora migration `0007_agent_runtime_contracts` before claiming persisted agent run ledger, LangSmith trace-id rows, or durable agent-run proof in production.
