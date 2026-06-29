# UseBy Live Product, Consumer UI, And Agentic Orchestration Plan

Created: 2026-06-29

This is a critical review of the current post-Checkpoint 8 UseBy product, the `UI References/` direction, and the next build plan for a live consumer product with real agent workflows.

## Bottom Line

The current deployment is not just a static cached demo. It is backed by Aurora PostgreSQL, PostGIS, S3/Textract provider readiness, computed action cards, live matches, bookings, pools, drops, jobs, audit events, and proof APIs. However, it is still presented as a proof/workbench UI. The screenshots in Chrome are therefore expected for the current implementation, but they are not the consumer product experience we should ship or demo as the main flow.

The next phase should do two things:

1. Move proof and diagnostics out of the primary customer UI.
2. Add a real agent orchestration layer for receipt/label understanding, suggestion generation, match explanations, pool/drop assistant flows, and demo traceability.

## Current Live Readiness

Production URL: `https://useby-app.vercel.app`

Fresh live probes on 2026-06-29:

- `GET /api/system/state`: HTTP 200, live Aurora-backed state available.
- `GET /api/system/db-proof`: first returned HTTP 503 while Aurora resumed from auto-pause, then returned HTTP 200 with PostgreSQL 17.7 plus PostGIS, pgvector, pgcrypto, and pg_trgm installed.
- `GET /api/jobs/pickup-reminders`: currently returns skipped for the current idempotency window, but the latest audit evidence shows a real schema/runtime mismatch in notifications.

Live counts visible in `/api/system/state` include:

- 36 item instances
- 39 active action cards
- 1 active match
- 1 active booking
- 3 demand pools
- 8 DemandPool commitments
- 4 merchant bids
- 1 closed/sold-out surplus drop
- 50 audit events
- 9 job runs
- S3 private storage configured
- Textract configured
- Geocoding unavailable/no-key
- AI copy disabled/no-key
- Semantic ranking disabled/no-key

Important defect before claiming "fully end-to-end":

- Pickup reminders are not producing real notification rows because `useby-app/src/server/notifications/contracts.ts` expects columns including `audience`, `household_id`, `merchant_id`, `source_type`, `source_id`, `event_type`, `action_href`, `channel_status`, and `reminder_at`, while the current CP8 migration created a different `notifications` shape.

## What Has Been Built

UseBy now has the following major product capabilities:

- Grocery inventory intake and management, including receipt/manual entry, expiry/storage edits, and action-card generation.
- Deterministic action cards for use-first, freeze/plan, share, and check-label paths.
- Neighbour food matching with privacy-safe coarse distance and location copy.
- Booking, safety acknowledgement, handoff, trust, review, report, and block foundations.
- Lending inventory and reservation foundations for wardrobe/household sharing.
- DemandPool group-buy mechanics using unpaid/demo commitments, merchant bids, awards, pool orders, and pickup tasks.
- Merchant surplus drop runtime and heatmap foundations.
- External integration hooks for private S3 file storage, Textract OCR, geocoding, in-app notifications, reminder jobs, AI copy, semantic ranking, proof, and no-key states.
- Live system proof surfaces for Aurora, PostGIS, pgvector, provider readiness, privacy, and guardrails.

Checkpoint 5 was intentionally skipped because Stripe/payment integration is deferred. The current system must remain unpaid/demo intent only.

## UI Reference Analysis

The screenshots in `UI References/` point to a much stronger product direction than the current proof UI.

### Reference 11

Home dashboard:

- Persistent left navigation.
- Warm consumer greeting.
- Location/search/user topbar.
- Large visual neighborhood hero.
- Four simple priority cards.
- Nearby opportunities with large imagery.
- Minimal technical copy.

UseBy translation:

- Home becomes "Today" or "For you".
- Show 3 to 5 live suggestions, not 39 raw engine cards.
- Replace checkpoint/proof status with trustable product signals like "3 things to use soon", "1 neighbour match", "2 group buys nearby".

### Reference 12

Inventory:

- Category tabs for groceries, wardrobe, and household.
- Product cards with images, expiry urgency, quantity, and primary actions.
- Search/filter/sort.
- A clear "scan label" or "add item" CTA.

UseBy translation:

- Inventory should feel like a personal shelf, not a route diagnostic page.
- Receipt upload, label scan, and manual add should be a compact action sheet or side panel.
- The user sees "Use tonight", "Share sealed", "List for lending", "Add label", not internal safety enum language first.

### Reference 13

Matches:

- Visual list/map blend.
- Clear filters.
- Match cards with distance, pickup time, trust signal, and reason chips.
- One dominant CTA per match.

UseBy translation:

- Keep exact household coordinates hidden.
- Show "226 m away", "sealed only", "pickup window", "why this match".
- Move verbose safety disclaimers behind a compact "Safety rules" affordance while still requiring acknowledgement before booking.

### Reference 14

Pools:

- Featured community pool with product imagery, progress, savings, and CTA.
- Supporting pool cards.
- Merchant bid/status in plain language.

UseBy translation:

- DemandPool should feel like "join a local grocery deal", not a backend pool ledger.
- Price copy remains demo/unpaid until CP5/payments is resumed.
- Merchant bids and pickup tasks can be shown as progress milestones.

## Target Information Architecture

Customer-facing nav:

- Today
- Inventory
- Matches
- Pools
- Drops
- Activity

Secondary/admin nav:

- Merchant
- Proof
- Agent runs

The customer should not land on proof cards. Proof is still valuable for judges, debugging, and demo narration, but it should be a back-office or "show me how it works" route.

## Target UI System

Adopt the reference direction:

- Background: warm off-white/cream.
- Primary: deep green.
- Secondary: sage.
- Accent: soft gold and coral.
- Type: editorial display face for page headings, highly readable sans-serif for product UI.
- Cards: image-led, rounded but not overly soft, with subtle borders and shadows.
- Layout: desktop left rail plus mobile bottom nav.
- Product assets: generated or curated bitmap images for grocery, fashion, household, pool, and merchant contexts.

Avoid:

- Checkpoint wording in consumer UI.
- Route status blocks in customer pages.
- Dense proof cards as the main story.
- Huge lists of raw action cards.
- Exact household coordinates, raw addresses, direct contact details.

## Live Data UI Adapter Strategy

We should keep the backend live and transform it into simpler consumer concepts.

Examples:

- `action_cards` -> "Today priorities", grouped and deduped.
- `matches` -> "Nearby matches", with reason chips and one CTA.
- `item_instances` -> "Your shelf", with category tabs and image/category fallback.
- `demand_pools` -> "Community deals", with progress and pickup status.
- `store_drops` -> "Merchant surplus drops", with visual cards.
- `bookings`, `handoffs`, `pickup_tasks` -> "Activity".
- `/api/system/state` and `/proof` -> proof/admin only.

This keeps the product live while making the UI feel calm and consumer-native.

## Agentic Architecture

The current AI layer is intentionally minimal:

- AI copy can call an OpenAI-compatible chat endpoint when configured.
- Without keys, it returns deterministic fallback copy.
- Semantic ranking is disabled unless explicitly enabled and still only runs after deterministic filters.
- AI cannot decide eligibility, safety, trust, payment, visibility, or reservation capacity.

That is the right safety posture, but not yet a full agentic product.

### Proposed Stack

Use Fireworks for model inference:

- Chat/tool model for agent planning, extraction, and copy.
- Structured JSON output for receipt/label normalization and suggested action drafts.
- Embeddings/reranking for secondary matching after deterministic filters.

Use LangGraph for orchestration:

- Stateful, durable workflows.
- Tool-calling loops.
- Human-in-the-loop approval before mutations.
- Persistent run/thread state.

Use LangSmith for observability:

- Trace every agent run.
- Compare agent versions.
- Run offline evals against curated receipts, labels, matches, and pool/drop scenarios.
- Run online evals and feedback loops in production.

Use UiPath for external automation where it is genuinely useful:

- Triggering or receiving enterprise robot/workflow events.
- Connecting UseBy to UiPath Orchestrator jobs.
- Optional merchant ops flows, such as invoice/order confirmation, pickup run sheets, or receipt processing from external mailboxes.
- It should not replace the core UseBy product engine.

### Official Documentation Basis

- Fireworks tool calling supports OpenAI-compatible tool specs and JSON Schema parameters: `https://docs.fireworks.ai/guides/function-calling`
- Fireworks embeddings/reranking supports semantic search/reranking, including `fireworks/qwen3-embedding-8b` and `fireworks/qwen3-reranker-8b`: `https://docs.fireworks.ai/guides/querying-embeddings-models`
- Fireworks model recommendations list Kimi K2.6, DeepSeek V4 Pro, GLM 5.1, and MiniMax M2.7 for agents/tool use, plus Qwen3 embedding/reranker for retrieval: `https://docs.fireworks.ai/guides/recommended-models`
- LangGraph is designed for long-running, stateful agents with durable execution, streaming, persistence, and human-in-the-loop: `https://docs.langchain.com/oss/javascript/langgraph/overview`
- LangGraph persistence uses checkpointers for thread-scoped state and stores for longer-term memory: `https://docs.langchain.com/oss/javascript/langgraph/persistence`
- LangGraph interrupts support approval/review workflows before critical actions: `https://docs.langchain.com/oss/javascript/langgraph/interrupts`
- LangSmith provides tracing, observability, production monitoring, feedback, and evaluations: `https://docs.langchain.com/langsmith/observability` and `https://docs.langchain.com/langsmith/evaluation`
- UiPath Integration Service provides connectors, connections, triggers, and API automation patterns: `https://docs.uipath.com/integration-service/automation-cloud/latest/user-guide/introduction`
- UiPath Orchestrator connector can manage robot workforce operations and run jobs/list assets/queue items through activities: `https://docs.uipath.com/integration-service/automation-cloud/latest/user-guide/uipath-uipath-orchestrator`

## Proposed Agents

### Receipt And Label Agent

Purpose:

- Take OCR text from Textract or user-entered receipt lines.
- Normalize item names, quantities, package state, expiry/use-by dates, storage hints, and confidence.
- Return structured JSON.
- Let deterministic validation decide what can be saved.

Tools:

- `get_current_inventory`
- `parse_receipt_with_textract`
- `normalize_receipt_lines`
- `create_inventory_draft`
- `apply_inventory_draft_after_user_confirmation`

Model:

- Fast extraction: use the current Fireworks-recommended fast classification/extraction model available in the account.
- If tool use quality matters more than latency, use a Fireworks-recommended agentic model such as Kimi K2.6 or DeepSeek V4 Pro, then verify the exact deployment slug in the Fireworks dashboard.

### Household Planning Agent

Purpose:

- Convert live action cards into a small daily plan.
- Explain "use tonight", "share sealed", "check label", "join pool", "drop nearby".
- Never decide eligibility or safety.

Tools:

- `list_action_cards`
- `list_inventory`
- `list_matches`
- `list_pools`
- `create_plan_draft`

### Match Explanation And Secondary Ranking Agent

Purpose:

- Receive already-filtered deterministic candidates.
- Optionally rerank semantically.
- Generate compact "why this match" chips.

Tools:

- `list_deterministic_matches`
- `rerank_candidates`
- `write_match_explanation`

Guardrail:

- If any candidate has not passed safety, privacy, distance, status, quantity, and eligibility filters, semantic ranking refuses to run.

### Merchant Pool And Drop Assistant

Purpose:

- Help a merchant draft a bid, pool offer, or surplus drop.
- Summarize demand heatmap signals.
- Produce a draft that a human confirms.

Tools:

- `list_demand_heatmap`
- `draft_pool_bid`
- `draft_store_drop`
- `submit_bid_after_confirmation`
- `publish_drop_after_confirmation`

### Notification Composer

Purpose:

- Turn deterministic notification candidates into short in-app/email copy.
- It does not decide who gets notified or when.

Tools:

- `list_due_notification_candidates`
- `compose_notification_copy`
- `create_notification_rows`

Blocked until:

- Notification schema/runtime mismatch is fixed.

### Demo Narrator Agent

Purpose:

- Power a live interactive walkthrough route.
- Explain what is happening in human terms.
- Show traces, tool calls, data sources, and guardrail checks.
- Mutations still require explicit approval.

Tools:

- Read-only by default.
- Optional approved tools for reset, import, request booking, join pool, reserve drop.

## Suggested Environment Variables

Do not commit real values.

Guided setup command:

```bash
cd "/Users/abhinavgupta/Desktop/H0 AWS Hack/UseBy/useby-app" && npm run setup:agent-env
```

The script prompts for Fireworks and LangSmith keys, writes `useby-app/.env.local`, and can optionally push the same values to Vercel by using `vercel env add` through stdin.

```bash
FIREWORKS_API_KEY=
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_CHAT_MODEL=accounts/fireworks/models/kimi-k2p5
FIREWORKS_FAST_MODEL=
FIREWORKS_EMBEDDING_MODEL=fireworks/qwen3-embedding-8b
FIREWORKS_RERANKER_MODEL=fireworks/qwen3-reranker-8b

AI_COPY_ENABLED=true
AI_COPY_PROVIDER=fireworks
AI_COPY_API_BASE_URL=https://api.fireworks.ai/inference/v1
AI_COPY_API_KEY=
AI_COPY_MODEL=accounts/fireworks/models/kimi-k2p5

AI_SEMANTIC_RANKING_ENABLED=false
AI_EMBEDDING_PROVIDER=fireworks
AI_EMBEDDING_API_KEY=
AI_EMBEDDING_MODEL=fireworks/qwen3-embedding-8b

LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=useby-live

UIPATH_ORCHESTRATOR_URL=
UIPATH_TENANT_NAME=
UIPATH_FOLDER_ID=
UIPATH_CLIENT_ID=
UIPATH_CLIENT_SECRET=
UIPATH_QUEUE_NAME=
```

Model names should be verified in the Fireworks dashboard before final deployment, because model slugs can vary by account/deployment.

## Data Model Additions

Add a small agent observability layer:

- `agent_runs`
- `agent_steps`
- `agent_tool_calls`
- `agent_artifacts`
- `agent_feedback`

Minimum fields:

- `id`
- `workflow_type`
- `status`
- `actor_type`
- `actor_id`
- `household_id`
- `merchant_id`
- `langsmith_trace_id`
- `model_provider`
- `model_name`
- `input_redaction_status`
- `started_at`
- `completed_at`
- `metadata`

Tool-call logs must redact secrets, raw direct contact details, raw exact household coordinates, and raw uploaded-file contents.

## Required API Work

New or revised API routes:

- `POST /api/agent/receipt-normalize`
- `POST /api/agent/action-plan`
- `POST /api/agent/match-explanations`
- `POST /api/agent/pool-assistant`
- `POST /api/agent/drop-assistant`
- `GET /api/agent/runs`
- `GET /api/agent/runs/[runId]`
- `POST /api/agent/runs/[runId]/resume`
- `POST /api/integrations/uipath/jobs`
- `POST /api/integrations/uipath/webhook`

Existing product routes should remain deterministic and authoritative. Agents can suggest and draft, then product APIs validate and apply.

## Manual Demo Flow Target

The desired live demo should feel like this:

1. Open Today.
2. See a visual summary of what to use, share, join, or reserve.
3. Add groceries from a receipt or label scan.
4. Agent extracts a draft from OCR/text and shows confidence.
5. User confirms.
6. Inventory updates in Aurora.
7. Action cards recompute from current rows.
8. Match suggestions update.
9. User opens a match, sees why it is safe/eligible enough to request.
10. User acknowledges safety rules and requests booking.
11. Booking/activity timeline updates.
12. Proof/Admin route shows audit event, agent run, LangSmith trace id, and deterministic guardrail status.

Then optionally:

13. Join a DemandPool.
14. Merchant assistant drafts a bid/drop from demand signals.
15. Merchant confirms.
16. Pool/drop status updates.
17. UiPath workflow is triggered for an external ops step, if configured.

## Execution Plan

### Phase 0 - Fix Live End-To-End Defects

- Fix notification schema/runtime mismatch.
- Add regression tests that run notification generation against the actual Drizzle schema.
- Re-probe `/api/jobs/pickup-reminders`.
- Update CP8 live smoke docs.

### Phase 1 - Consumer UI Shell

- Add design tokens, font setup, image strategy, and shared consumer shell.
- Build desktop left nav and mobile bottom nav.
- Move Proof to secondary/admin navigation.
- Keep live data adapters intact.

### Phase 2 - Rebuild Customer Screens

- Today page with prioritized action cards and visual nearby opportunities.
- Inventory page matching `UI References/12.png`.
- Matches page matching `UI References/13.png`.
- Pools page matching `UI References/14.png`.
- Drops and Activity pages with the same system.

### Phase 3 - Agent Infrastructure

- Add Fireworks provider adapter for chat, structured output, embeddings, and reranking.
- Add LangGraph workflows for receipt, planning, matching, merchant assistant, notifications, and demo narration.
- Add agent run tables and UI trace cards.
- Add LangSmith tracing/evaluation hooks.

### Phase 4 - UiPath Integration

- Decide which external workflows are worth showing.
- Start with either:
  - UseBy -> UiPath: trigger Orchestrator job for merchant pickup/order ops.
  - UiPath -> UseBy: webhook import of external receipt or merchant inventory event.
- Keep UiPath as external automation, not the authority for UseBy eligibility/safety logic.

### Phase 5 - Live QA And Demo Script

- Run local checks: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `git diff --check`.
- Browser smoke desktop/mobile.
- Production deploy.
- Live API probes.
- Manual end-to-end demo with fresh data.
- Record a demo script that verbally explains the backend complexity while the UI remains simple.

## Open Decisions

1. Should we prioritize consumer UI first, or notification/end-to-end correctness first?
   - Recommendation: fix notification defect first, then UI.
2. Should the live demo mutate production demo data or use a resettable demo scope?
   - Recommendation: resettable demo scope.
3. Do we want UiPath visible in the primary demo, or only as an optional enterprise automation proof?
   - Recommendation: optional enterprise proof unless the hackathon judges expect UiPath specifically.
4. Which Fireworks models are enabled in your account?
   - Recommendation: verify in dashboard, then set model envs. Use smaller/fast models for extraction and a stronger tool-use model for workflows.
5. Should agent traces be visible to all demo viewers?
   - Recommendation: no. Show a compact "How this was decided" panel in product UI and a full trace in admin/proof.
