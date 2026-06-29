# Checkpoint 9 Orchestration Control

Checkpoint 8 completed commit: `c275504`.
Provider/env setup commits: `4f3612f`, `659dd0b`, `762b687`.
Checkpoint 9 plan base: `762b687`.
Checkpoint 9 goal: live agent workflows plus a premium consumer UI remodel aligned with `UI References/`.

## Outcome

Checkpoint 9 turns the post-CP8 proof/workbench into a demo-ready consumer product:

- Fireworks-backed agent workflows produce structured receipt/action/match drafts with honest fallbacks and deterministic validation.
- LangSmith is configured for trace metadata once LangGraph-style agent runs execute.
- Notification/reminder live-flow defects are fixed enough that pickup reminder jobs can create or honestly skip real notification rows.
- The primary UI becomes a premium consumer experience: visual, calm, image-led, and close in style to `UI References/11.png` through `UI References/14.png`.
- Proof, diagnostics, checkpoint wording, and backend readiness move out of the customer path and into proof/admin/agent-run surfaces.
- A manual demo flow can show live Aurora mutations, recomputation, agent draft/review, and proof traces without pretending AI decides safety, eligibility, privacy, payment, trust, reservation capacity, or visibility.

## Non-Goals

- No Stripe/payment/card/deposit/paid commitment state.
- No UiPath integration in CP9 unless explicitly reopened; Fireworks + LangSmith are enough for this increment.
- No Mapbox dependency for the first UI/agent flow; keep geocoding no-key states honest.
- No fake successful provider states.
- No exact household coordinates, raw addresses, direct contact details, or raw uploaded file contents in public/customer UI or agent traces.

## Visual Contract

Use `UI References/` as the design target and `design-system/useby/MASTER.md` as the shared source of truth.

Reference translation:

- `11.png`: customer home/Today dashboard with left rail, greeting, search/location topbar, large warm visual hero, four simple priority cards, and nearby opportunities.
- `12.png`: inventory with category tabs, product cards, imagery, search/filter/sort, and a scan/add CTA.
- `13.png`: matches with filters, map strip/list blend, rich cards, reason chips, distance/pickup/trust signals, and one primary CTA.
- `14.png`: pools with a featured pool card, progress/value/savings, merchant image, supporting pool cards, and plain-language status.

Required feel:

- Premium consumer, not internal proof dashboard.
- Cream/off-white base with deep green, sage, soft gold, coral, and rich photography/illustration.
- Editorial serif headings plus readable sans-serif UI text.
- Desktop left nav plus mobile-friendly navigation.
- Visual assets for product cards, nearby opportunities, pools, drops, and merchant contexts.
- Compact reason chips instead of paragraphs of internal explanation.
- Primary customer nav: Today, Inventory, Matches, Pools, Drops, Activity.
- Secondary/admin nav: Merchant, Proof, Agent runs.

Avoid:

- Checkpoint copy in customer UI.
- Route state panels on customer pages.
- Giant raw action-card lists.
- One-note beige or green-only palettes.
- Decorative gradient blobs/orbs.
- Text overlap or tiny controls.

## Product And AI Guardrails

- Deterministic UseBy code remains the authority for safety, eligibility, privacy exposure, trust, reservation capacity, payment, and visibility.
- AI may only draft, extract, explain, summarize, or rerank already-eligible deterministic candidates.
- Fireworks failures must fall back to deterministic copy/drafts and surface honest unavailable/fallback states.
- LangSmith tracing may record redacted run metadata and trace ids only; no secrets, raw exact coordinates, direct contact details, or raw file contents.
- Uploaded files remain private by default.
- Seed data can create input world state only; final actions, matches, bookings, pool awards, trust changes, and audit output must be computed from current rows.

## Lane Split

### Lane 9A - Agent Runtime, Notification Fix, And Contracts

Owns schema/runtime/API contracts for CP9 live agent workflows and the known notification/reminder defect.

May edit:

- `useby-app/src/db/schema.ts`
- `useby-app/drizzle/**`
- `useby-app/src/server/ai/**`
- `useby-app/src/server/agent/**`
- `useby-app/src/server/notifications/**`
- `useby-app/src/server/jobs/**`
- `useby-app/src/app/api/agent/**`
- `useby-app/src/app/api/jobs/**`
- `useby-app/src/app/api/notifications/**`
- `useby-app/src/lib/system-state/**`
- `.env.example`
- focused backend tests for agents, notifications, provider fallbacks, and schema contracts

Must deliver:

- Fix or reconcile notification runtime vs table schema so pickup reminder jobs do not fail on missing columns.
- Add agent run/tool-call/artifact/feedback persistence or a narrowly scoped equivalent, with redaction-safe metadata.
- Add Fireworks-backed structured receipt/action/match draft helpers using OpenAI-compatible `/chat/completions`.
- Add API route(s) for at least one live agent flow, preferably receipt/action plan draft, with deterministic validation and fallback.
- Add LangSmith readiness/trace-id hooks without leaking keys.
- Keep semantic ranking off unless a real scorer is installed and deterministic filters are enforced.

Verification:

- `npm run test -- --run <focused agent/notification/system tests>`
- `npm run typecheck`

### Lane 9B - Premium Consumer UI Remodel

Owns the customer-facing visual experience. This is the most judge-visible lane; polish matters.

May edit:

- `useby-app/src/app/layout.tsx`
- `useby-app/src/app/page.tsx`
- `useby-app/src/app/grocery/page.tsx`
- `useby-app/src/app/pools/page.tsx`
- `useby-app/src/app/drops/page.tsx`
- `useby-app/src/app/bookings/page.tsx`
- `useby-app/src/app/lending/page.tsx`
- `useby-app/src/components/**`
- `useby-app/src/lib/**` only for frontend adapters/helpers
- `useby-app/src/app/globals.css`
- `useby-app/public/**`
- `design-system/useby/**`

Avoid:

- backend schema/migration changes
- changing product decision logic
- exposing proof/status/checkpoint text in primary customer pages
- editing `useby-app/src/server/**` except read-only analysis

Must deliver:

- Consumer shell matching the references: left rail, top search/location/user area, responsive mobile navigation.
- Today dashboard with live data transformed into a few premium visual cards.
- Inventory, Matches, Pools, Drops, and Activity surfaces using live APIs, image-led cards, reason chips, and clear CTAs.
- Proof/admin links demoted out of the primary customer path.
- Responsive spacing at 320, 375, 414, 768, 1024, 1280, 1440, and 1920 widths.
- Accessible focus states, buttons at least 44px, reduced-motion support, and no text overlap.

Verification:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Browser/manual screenshots if possible.

### Lane 9C - Agent-To-Consumer Workflow UX

Owns the bridge between Lane 9A backend agent contracts and Lane 9B UI: review/confirm flows, agent state, and trace/proof surfaces.

May edit:

- `useby-app/src/components/**` for agent workflow components
- `useby-app/src/app/api/agent/**` only to consume Lane 9A contracts if needed
- `useby-app/src/app/proof/**`
- `useby-app/src/app/agent-runs/**`
- `useby-app/src/lib/proof-ui/**`
- `useby-app/src/lib/agent-ui/**`
- docs related to live demo flow

Avoid:

- migrations/schema unless coordinated with 9A
- broad customer-page restyling owned by 9B
- claiming LangSmith traces exist before a run has trace metadata

Must deliver:

- Agent draft/review/confirm UI for at least one live flow.
- Compact "How this was decided" customer-safe panel.
- Admin/proof surface for agent run status, provider fallback, LangSmith trace id if available, deterministic guardrails, and redaction.
- No-key/fallback states that are honest and demo-safe.

Verification:

- `npm run test -- --run <focused proof/agent-ui tests if added>`
- `npm run lint`
- `npm run typecheck`

### Lane 9D - Live Demo QA, Docs, And Browser Smoke

Owns verification, docs, test plan, and final demo script.

May edit:

- `docs/**`
- `useby-app/src/**/*.test.ts`
- `useby-app/src/**/*.test.tsx`
- `useby-app/vitest.config.ts` only if needed
- proof/system docs

Avoid:

- product runtime changes unless tiny QA fixes are coordinated after other lanes land

Must deliver:

- Updated manual demo script for the redesigned consumer UI and live agent flow.
- Production/live smoke plan with exact endpoints and expected provider states.
- Regression tests for the notification defect and agent guardrails if not already covered by 9A.
- QA checklist for UI reference fidelity, mobile/desktop spacing, provider fallbacks, and privacy/AI guardrails.

Verification:

- `npm run test`
- `npm run lint`
- `npm run typecheck`

## Merge Order

1. 9A agent runtime, notification fix, and contracts.
2. 9B premium consumer UI remodel.
3. 9C agent-to-consumer workflow UX.
4. 9D live demo QA/docs.
5. Master integration patch for cross-lane contract/UI gaps.

After each merge, run narrow checks for the merged area. After all lanes merge, run from `useby-app`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Then from repo root:

```bash
git diff --check
```

Run local/browser smoke before deploy where practical. After deploy, verify:

- `GET /api/system/state`
- `GET /api/system/db-proof`
- at least one agent route
- `GET /api/jobs/pickup-reminders`
- `/`, `/grocery`, `/pools`, `/drops`, `/bookings`, `/proof`, and `/agent-runs` if present

## Worker Registry

| Lane | Thread | Worktree | Status |
| --- | --- | --- | --- |
| 9A Agent Runtime, Notification Fix, And Contracts | `019f1340-3aa8-73c0-a2af-764253861445` | `/Users/abhinavgupta/.codex/worktrees/ffb1/UseBy` | active |
| 9B Premium Consumer UI Remodel | `019f1340-a506-71f2-9de8-9bda187c01b4` | `/Users/abhinavgupta/.codex/worktrees/cb04/UseBy` | active |
| 9C Agent-To-Consumer Workflow UX | `019f1340-f3e1-70a1-a044-faca4ce39e0b` | `/Users/abhinavgupta/.codex/worktrees/1652/UseBy` | active |
| 9D Live Demo QA, Docs, And Browser Smoke | `019f1341-4c46-7093-9530-28377c39df4a` | `/Users/abhinavgupta/.codex/worktrees/738a/UseBy` | active |

## Handoff Contract

Each lane must report:

- files changed
- commits/diff summary
- tests run and results
- unavailable checks and why
- migration/env notes
- API/DTO contracts changed
- UI/reference-fidelity notes where relevant
- privacy/payment/AI risks
- merge instructions
