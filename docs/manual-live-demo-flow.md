# UseBy Manual Live Demo Flow

Created: 2026-06-29

This document describes how to manually test the current live product and what the intended post-redesign demo flow should become.

## Current Reality

The deployed app is live-data backed, but it is not yet a polished consumer journey.

What currently works live:

- Production app loads at `https://useby-app.vercel.app`.
- `/api/system/state` returns Aurora-backed counts and provider states.
- `/api/system/db-proof` confirms PostgreSQL 17.7 plus PostGIS, pgvector, pgcrypto, and pg_trgm after Aurora resumes from auto-pause.
- `/grocery` shows live inventory, action cards, and matches.
- `/proof` shows backend/provider proof.
- S3 and Textract are configured.
- Geocoding, AI copy, and semantic ranking correctly show no-key/disabled states.

What is not fully end-to-end yet:

- AI is not active because provider keys are not configured.
- Semantic ranking is not active because provider keys/models are not configured.
- Geocoding is not active because `MAPBOX_ACCESS_TOKEN` is not configured.
- Pickup reminder notifications need a schema/runtime fix before they can be called fully working.
- The current UI exposes proof and route/status concepts that should be hidden from ordinary customers.

## Current Manual Smoke

### 1. Wake And Verify Backend

Open:

```text
https://useby-app.vercel.app/api/system/db-proof
```

Expected:

- First request may return a 503 if Aurora is resuming from auto-pause.
- Retry after a few seconds.
- Final expected result is `status: "available"`, database `useby`, PostgreSQL `17.7`, and installed PostGIS/vector extensions.

Open:

```text
https://useby-app.vercel.app/api/system/state
```

Expected:

- `status: "available"`.
- Counts for inventory, action cards, matches, bookings, DemandPools, merchant bids, audit events, and job runs.
- CP8 providers show S3/Textract configured, geocoding unavailable/no-key, AI disabled/no-key, semantic ranking disabled/no-key.

### 2. Grocery Inventory

Open:

```text
https://useby-app.vercel.app/grocery
```

Expected:

- Current grocery shelf loads from live rows.
- Action cards are computed from current rows.
- Matches show coarse location and distance, not exact household coordinates.
- Import and label-edit controls render.

Current caveat:

- The page is proof/workbench style. It is expected to be dense and text-heavy right now.

### 3. Manual Grocery Input

On `/grocery`:

1. Enter receipt lines or a manual item.
2. Choose quantity, unit, storage, and optional label date.
3. Use `Draft with agent` to create a reviewable receipt/action draft.
4. Confirm one reviewed draft line, or use the direct import path as a fallback.

Expected:

- If Lane 9A agent routes are installed, provider status should distinguish generated, fallback, and unavailable states.
- If agent routes are not installed, the UI should say provider unavailable and show only a local review scaffold.
- New inventory rows should be created only after `Confirm reviewed import` or direct import calls the live grocery API.
- Action cards should change based on current rows after refresh.
- If OCR/Textract is used without a file upload path, the UI should honestly show fallback/manual behavior.
- LangSmith should not be claimed unless run metadata includes a trace id.

### 4. Label Edit

On `/grocery`:

1. Select an item.
2. Change label date, storage, or safety status.
3. Save.

Expected:

- Inventory row updates.
- Eligibility-sensitive match/action behavior changes after recomputation/refresh.

### 5. Match And Booking Request

On `/grocery`, find the neighbour match card:

1. Read the distance and rationale.
2. Tick the safety acknowledgement.
3. Request booking if the button is enabled.

Expected:

- Booking should only be available when the backend match is active and eligible.
- Exact household coordinates and direct contact fields should never be shown.
- If the current sample match says unavailable, that is a safety/eligibility gate working rather than a broken button.

### 6. Proof

Open:

```text
https://useby-app.vercel.app/proof
```

Expected:

- Proof cards show live integration state.
- AI guardrails show copy/explanation only and deterministic-first.
- Provider no-key states are explicit.

### 7. Agent Runs

Open:

```text
https://useby-app.vercel.app/agent-runs
```

Expected:

- The route first reports agent route discovery state.
- Missing `/api/agent/runs` style routes are shown as unavailable, not as empty success.
- Run rows, when present, show status, generated/fallback/unavailable provider state, redaction state, deterministic guardrails, and LangSmith trace id only if returned by metadata.
- No exact household coordinates, direct contacts, secrets, or raw uploaded-file contents appear in this admin surface.

## Target Post-Redesign Demo

The redesigned demo should be much simpler for the viewer.

### Consumer Flow

1. Open `Today`.
2. See a warm consumer dashboard with 3 to 5 high-priority cards:
   - Use tonight
   - Share sealed item
   - Join local pool
   - Nearby surplus drop
3. Click `Add groceries`.
4. Upload receipt/label or paste receipt text.
5. Receipt agent extracts a draft using Textract plus Fireworks when configured, or shows an honest local fallback when unavailable.
6. User reviews the draft and confirms.
7. Aurora inventory updates.
8. Action cards recompute.
9. `Today` updates with new recommendations.
10. Open `Matches`.
11. See visual match cards with reason chips.
12. Acknowledge safety rules and request booking.
13. Open `Activity`.
14. See the booking timeline and next pickup step.

### Merchant Flow

1. Open `Merchant`.
2. See demand heatmap and pool/drop opportunities.
3. Merchant assistant drafts a bid or surplus drop.
4. Merchant reviews and confirms.
5. Pool/drop updates in Aurora.
6. Optional UiPath job triggers for external operational follow-up.

### Proof Flow

1. Open `Proof` or `Agent runs`.
2. Show that the consumer UI was backed by:
   - Aurora rows
   - PostGIS distance logic
   - deterministic safety and eligibility filters
   - Fireworks model call only when provider metadata says generated
   - LangGraph workflow state
   - LangSmith trace id only when a run returns trace metadata
   - optional UiPath job id
3. Explain in narration, not in the primary product UI.

## Agentic Capability Expectations

Without keys:

- The app must stay live and deterministic.
- AI states must say disabled/unavailable.
- No fake agent success should be shown.

With keys:

- Fireworks handles model inference for extraction, copy, tool-use reasoning, and secondary semantic ranking.
- LangGraph coordinates multi-step workflows and human approval.
- LangSmith records traces, feedback, and evals.
- UiPath can trigger or receive external automation events where useful.

The deterministic UseBy backend remains the authority for:

- safety eligibility
- privacy exposure
- booking capacity
- reservation capacity
- trust changes
- payment state
- household visibility

AI can help explain, draft, normalize, summarize, and rerank already-eligible candidates. It cannot approve or override product rules.
