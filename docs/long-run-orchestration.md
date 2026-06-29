# UseBy Long-Run Orchestration

This document records the master-session instruction for the post-Checkpoint 1 build run.

## Current Baseline

- Integration branch: `main`
- Baseline commit before Checkpoint 2 launch: `c584f08`
- Production URL: `https://useby-app.vercel.app`
- Checkpoint 1 status: merged, pushed, deployed, Aurora live smoke passed.

## Sequential Scope

Run checkpoints sequentially, never all at once:

1. Checkpoint 2 - Grocery expiry, action cards, and food matching.
2. Checkpoint 3 - Booking, handoff, trust, and safety.
3. Checkpoint 4 - Wardrobe rental and household lending.
4. Skip Checkpoint 5 for now. No Stripe/payment ledger implementation in this run.
5. Checkpoint 6 - DemandPool and merchant portal, using unpaid/demo commitments until payments are reintroduced.
6. Checkpoint 7 - Merchant surplus drops and heatmap.
7. Checkpoint 8 - External integrations and AI polish.

The orchestrator must only launch the next checkpoint after the current checkpoint is merged, reviewed, tested, documented, and pushed from the updated `main` baseline.

## Long-Run Rules

- Keep Aurora PostgreSQL as the live source of truth.
- Do not seed final outputs. Action cards, matches, bookings, awards, trust changes, reservations, and notifications must be computed from current rows.
- Keep demo/user actions attached to an actor and household context. Until full auth lands, use a clearly named demo actor helper that can later be replaced by real auth middleware.
- Do not add Stripe or payment state in this sequence. Checkpoint 6 commitments should be modeled as unpaid/demo commitments with explicit payment-deferred wording.
- Preserve SSO protection for non-public Vercel deployment URLs. The public production alias remains the judge-facing URL.
- Do not expose plaintext secrets. Secret ARNs and resource IDs are acceptable.
- Keep no-key/no-env states honest in UI and APIs.
- After each checkpoint, run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `git diff --check`, plus relevant live/API/browser smoke checks when routes are deployed or user-facing.

## Master Handoff Standard

For each checkpoint:

- Create `docs/checkpoint-N-orchestration.md`.
- Spawn two to four isolated worktree sessions from the current `main`.
- Record worker thread IDs, pending/worktree IDs, base commit, lane ownership, and status.
- Monitor quietly. Steer only when blocked or materially off-scope.
- Merge in dependency order.
- Patch cross-lane integration gaps in the master worktree.
- Deploy or live-smoke when production behavior is part of the gate.
- Commit and push docs plus integration changes before starting the next checkpoint.
