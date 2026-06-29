# UseBy Manual Live Demo Flow

Created: 2026-06-29
Updated for Checkpoint 9 integration: 2026-06-29

This script is the manual demo path for the redesigned CP9 consumer product. CP9 now includes the premium consumer shell, the receipt-draft/action-plan agent routes, and the `/agent-runs` proof surface. Provider success still depends on installed env keys, the CP9 migration, and live Aurora state; no-key and not-migrated states must stay visible and honest.

## Demo Rule

Seeded data may create input world state only. Final action cards, matches, bookings, DemandPool awards, store-drop reservations, pickup reminder notifications, trust changes, audit events, and agent evidence must be computed from current Aurora rows.

Do not narrate AI as the authority for safety, eligibility, privacy exposure, trust, payment, reservation capacity, or visibility. UseBy code remains the authority; Fireworks can draft, normalize, explain, summarize, or rerank already-eligible deterministic candidates.

## Current Integrated Reality

Known current state after CP9 lane integration:

- Production app: `https://useby-app.vercel.app`.
- Live system proof endpoints exist: `GET /api/system/state` and `GET /api/system/db-proof`.
- Customer routes currently present: `/`, `/grocery`, `/pools`, `/drops`, `/bookings`, `/lending`, `/merchant`, `/proof`, and `/agent-runs`.
- API routes currently present include grocery, matches, bookings, DemandPools, store drops, merchant routes, notifications, jobs, locations, system proof, `POST /api/agent/receipt-draft`, `POST /api/agent/action-plan`, and `GET /api/agent/runs`.
- The receipt agent drafts and explains; the user must review and confirm before any inventory mutation.
- S3 and Textract may be configured in production; geocoding and semantic ranking still depend on env/provider availability.
- Fireworks production agent draft routes are configured and smoked with model `accounts/fireworks/models/kimi-k2p5`; they generated review-only receipt and action-plan drafts on 2026-06-29.
- LangSmith env is configured, but trace ids should not be claimed until a real traced workflow records one.
- Agent run persistence is live after the CP9 `0007_agent_runtime_contracts` migration. `/api/agent/runs` should return persisted redacted run metadata after a receipt/action agent run.
- Pickup reminder notifications require the deployed notifications table to match the runtime contract before claiming fully working notification rows.

## Pre-Demo Setup

Use a resettable demo scope and make each mutation visible from live APIs.

1. Open `https://useby-app.vercel.app/api/system/db-proof`.
2. If Aurora is resuming from auto-pause, the first response may be `503`; retry after a few seconds.
3. Confirm final response is available and names PostgreSQL plus PostGIS/pgvector extensions.
4. Open `https://useby-app.vercel.app/api/system/state`.
5. Confirm row counts and integration states are live, not static page copy.
6. Optional reset before a judged run: `POST /api/demo/reset`.

Expected provider states without keys:

- Fireworks/AI copy: `disabled` or `unavailable`, with deterministic fallback copy.
- Semantic ranking: `disabled` or `unavailable`, and deterministic ordering remains in force.
- LangSmith: `disabled` if tracing is not enabled, or `unavailable` if tracing is enabled without a key.
- Geocoding: unavailable/no-key is acceptable; exact coordinates must stay hidden.
- Notifications/email: in-app notification rows may be ready only if the notifications table contract is available; email can be dry-run or unavailable when no provider key exists.

## Redesigned Consumer Demo Script

### 1. Today

Open `/`.

Show the consumer shell first:

- Desktop left navigation with Today, Inventory, Matches, Pools, Drops, Activity or the closest installed equivalents.
- Search/location/user area in the top bar.
- Warm visual hero, calm off-white background, deep green navigation, sage/gold/coral accents, editorial serif headings, and image-led cards.
- No checkpoint wording or route diagnostics in the primary customer path.

Narration:

"UseBy turns live neighbourhood inventory into a small set of useful decisions for today. The simple cards are backed by Aurora rows and deterministic rules, not cached outcomes."

Expected live behavior:

- Today shows 3 to 5 priorities rather than a raw engine list.
- Proof/admin links are secondary.
- If CP9 UI lanes have not landed yet, mark this as a UI integration gap and use `/grocery` as the functional live fallback.

### 2. Inventory

Open `/grocery`.

Show:

- Inventory/category tabs for groceries, wardrobe, and household, or the current installed route equivalents.
- Product cards with imagery, quantity, expiry/use-by urgency, and one clear primary action.
- Search/filter/sort controls when installed.
- Add groceries, scan label, or receipt text entry.

Live action:

1. Paste a small receipt or add a manual grocery item.
2. Submit through the installed grocery intake/import route.
3. Refresh or navigate back to Today/Inventory.
4. Confirm inventory rows and action cards reflect current data.

Expected without provider keys or migration:

- Manual/deterministic input still works or returns an honest unavailable state.
- Do not claim Fireworks extracted the receipt if `/api/agent/receipt-draft` reports fallback/unavailable or provider status is no-key.

Expected with CP9 agent routes and provider availability:

- The receipt/label agent creates a draft only.
- The user reviews normalized items, quantities, storage hints, dates, and confidence.
- The user explicitly confirms before any inventory mutation.
- Aurora rows update only through deterministic validation.

### 3. Matches

Open the installed match surface. In the current base this is `/grocery`; after the CP9 UI remodel it should be `/matches` or a Matches section in the redesigned shell.

Show:

- Visual list/map-strip blend when installed.
- Coarse distance and pickup window.
- Reason chips, not long internal proof paragraphs.
- No exact coordinates, raw address, direct phone/email, or direct contact details.

Live action:

1. Pick an active eligible match.
2. Open or expand the match.
3. Read the customer-safe "why this match" copy.
4. Acknowledge safety rules.
5. Request a booking only if the backend match is active and eligible.

Expected:

- The booking request writes through `/api/bookings/request`.
- Ineligible or unavailable matches stay blocked with a clear reason.
- Any semantic/reranker copy is secondary after deterministic filters; it cannot create eligibility.

### 4. Activity And Booking Timeline

Open `/bookings`.

Show:

- Booking status, pickup window, coarse pickup hint, and next step.
- No direct contact details or exact household location.
- Timeline events created from current booking/handoff rows.

Optional mutation if demo-safe:

1. Accept/reserve the booking from the owner/demo context.
2. Schedule pickup.
3. Mark picked up or complete only when the demo narrative needs it.

Expected:

- Status transitions are reflected in Aurora-backed API responses.
- Trust/review/report behavior stays deterministic and scoped.

### 5. Pools

Open `/pools`.

Show:

- Featured pool card with merchant image, target/progress, savings, and one CTA.
- Supporting pool cards with joined count, threshold, close time, and pickup/delivery mode.
- Payment-deferred wording. CP9 still has no Stripe/card/deposit capture.

Live action:

1. Commit to a pool through `/api/demand-pools/:poolId/commit`.
2. Confirm the response records unpaid demo intent.
3. If threshold and bids exist, run or show `/api/jobs/close-demand-pools`.
4. Show pool order/pickup task updates if created from current rows.

Expected:

- Commitments are unpaid demo intent only.
- Awards and pickup tasks are computed from current rows, not seeded final output.

### 6. Drops

Open `/drops`.

Show:

- Visual merchant surplus cards with quantity, pickup window, price display/demo intent, and reservation status.
- No card capture or deposit copy.

Live action:

1. Reserve an available drop through `/api/store-drops/:dropId/reserve`.
2. Confirm capacity changes from live rows.
3. Optionally cancel through `/api/store-drops/:dropId/cancel-reservation`.

Expected:

- Reservation capacity is deterministic.
- Sold-out/closed drops cannot be reserved.

### 7. Receipt Agent Review

Open `/grocery`.

Live action:

1. Enter receipt lines or a manual item.
2. Choose quantity, unit, storage, and optional label date.
3. Use `Draft with agent` to create a reviewable receipt/action draft.
4. Confirm one reviewed draft line, or use the direct import path as a fallback.

Expected:

- `/api/agent/receipt-draft` distinguishes generated, fallback, and unavailable provider states.
- If Fireworks is unavailable, the UI should say provider unavailable/fallback and show reviewable local scaffolding.
- New inventory rows should be created only after `Confirm reviewed import` or direct import calls the live grocery API.
- Action cards should change based on current rows after refresh.
- If OCR/Textract is used without a file upload path, the UI should honestly show fallback/manual behavior.
- LangSmith should not be claimed unless run metadata includes a trace id.

### 8. Merchant Assistant And Proof

Open `/merchant`, then `/proof`.

Integrated expectation:

- `/merchant` shows live demand/pool/drop surfaces.
- `/proof` shows Aurora/provider proof, no-key states, audit/job evidence, and AI guardrails.
- `/agent-runs` shows redacted CP9 agent run metadata when the agent runtime migration is installed.

Expected with CP9 agent UX:

- Merchant assistant endpoints are deferred unless separately installed; do not claim they exist in CP9.
- `/agent-runs` shows provider status, fallback state, redacted metadata, deterministic guardrails, and LangSmith trace id only when a trace id exists.

Narration:

"The product UI stays simple. The proof surface is where judges can see Aurora, PostGIS, provider states, guardrails, audit events, job runs, and agent trace metadata."

## Exact Smoke Endpoints

Read-only production checks:

- `GET /api/system/db-proof`
- `GET /api/system/state`
- `GET /api/grocery/inventory`
- `GET /api/grocery/action-cards`
- `GET /api/grocery/matches`
- `GET /api/bookings`
- `GET /api/demand-pools`
- `GET /api/store-drops`
- `GET /api/store-drops/reservations`
- `GET /api/jobs/pickup-reminders`
- `GET /api/notifications`
- `GET /api/merchant/heatmap`
- `GET /api/merchant/demand-pools`
- `GET /api/merchant/store-drops`

Expected CP9 agent endpoints:

- `POST /api/agent/receipt-draft`
- `POST /api/agent/action-plan`
- `GET /api/agent/runs`

If these routes return `404`, stop at registration/discovery and report that the CP9 route is not deployed. Do not debug keys, permissions, or provider runtime before the routes exist.

## Browser Route Smoke

### Agent Runs

Open:

```text
https://useby-app.vercel.app/agent-runs
```

Expected:

- The route first reports agent route discovery state.
- Missing or not-migrated `/api/agent/runs` states are shown as unavailable, not as empty success.
- Run rows, when present, show status, generated/fallback/unavailable provider state, redaction state, deterministic guardrails, and LangSmith trace id only if returned by metadata.
- No exact household coordinates, direct contacts, secrets, or raw uploaded-file contents appear in this admin surface.

Desktop widths: 1024, 1280, 1440, 1920.

Mobile widths: 320, 375, 414, 768.

Routes:

- `/`
- `/grocery`
- `/pools`
- `/drops`
- `/bookings`
- `/merchant`
- `/proof`
- `/agent-runs` only if registered

Target post-redesign story:

1. Open `Today`.
2. See a warm consumer dashboard with 3 to 5 high-priority cards.
3. Open `Inventory`.
4. Paste receipt text or add a manual item.
5. Receipt agent extracts a draft using Fireworks when configured, or shows an honest fallback when unavailable.
6. User reviews the draft and confirms.
7. Aurora inventory updates.
8. Action cards recompute.
9. `Today` updates with current-row recommendations.
10. Open `Matches`.
11. See visual match cards with reason chips.
12. Acknowledge safety rules and request booking.
13. Open `Activity`.
14. See the booking timeline and next pickup step.

Check:

- No horizontal scroll on mobile.
- Navigation is usable and does not cover content.
- Buttons are at least 44px high/tappable.
- Text does not overlap cards, images, buttons, or adjacent sections.
- Consumer routes do not expose checkpoint/proof copy as the main story.
- Proof/admin pages may be dense, but customer pages should remain calm and visual.

## Demo Close

End on `/proof` or `/agent-runs` only after showing the consumer flow. The closing proof should verify, not replace, the product story:

- Aurora rows changed.
- Action cards/matches/bookings/pools/drops were recomputed from current rows.
- Provider states are honest.
- AI guardrails are deterministic-first and copy/draft-only.
- LangSmith trace ids appear only when actual traced agent runs exist.

## Final Clean Smoke Reference

The final clean production smoke on 2026-06-29 used deployment `dpl_6usQUz9qQgYC1z785tymfiA43iD9` at `https://useby-app.vercel.app` and passed the full mutation path:

1. Reset demo world.
2. Generate Fireworks receipt draft with recorded agent run.
3. Generate Fireworks action-plan draft with recorded agent run.
4. Import a grocery item.
5. Recompute action cards and matches.
6. Acknowledge safety and request a booking from an active eligible match.
7. Create and commit to a DemandPool with unpaid demo intent only.
8. Create, publish, reserve, and cancel a merchant surplus drop with unpaid demo pickup intent only.
9. Run pickup reminders.
10. Confirm `/agent-runs`, `/proof`, and `/api/system/state` all return live production evidence.

Use that order for the judged walkthrough when you want a clean, repeatable end-to-end path.
