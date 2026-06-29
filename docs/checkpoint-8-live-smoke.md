# Checkpoint 8 Live Smoke

Use this after the CP8 lanes merge and deploy. Keep no-key states honest: unavailable, disabled, or dry-run is acceptable when provider env is absent; fake live success is not.

## Local Smoke

From `useby-app`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

From the repository root:

```bash
git diff --check
```

Then run the app locally and check:

- `/api/system/state` returns `cp8.providers`, `cp8.privateFileEvidence`, `cp8.geocodingPrivacy`, `cp8.notificationJobs`, and `cp8.aiGuardrails`.
- Missing Aurora env returns HTTP 503 with explicit unavailable counts and CP8 no-key/disabled states.
- Missing AI provider key returns deterministic fallback copy, not generated copy.
- Semantic ranking is disabled unless `AI_SEMANTIC_RANKING_ENABLED=true`, an embedding provider/model is configured, and deterministic filters have already passed.

## Production API Smoke

Against `https://useby-app.vercel.app`:

```bash
curl -i https://useby-app.vercel.app/api/system/state
curl -i https://useby-app.vercel.app/api/system/db-proof
curl -i https://useby-app.vercel.app/api/grocery/import
curl -i https://useby-app.vercel.app/api/jobs/pickup-reminders
```

Expected:

- System state lists Aurora, S3, Textract, geocoding, notifications, AI copy, semantic ranking, and AI guardrail readiness without plaintext secrets.
- DB proof shows PostGIS and pgvector extension availability honestly. pgvector may be available but semantic ranking still stays disabled without provider/model/key and deterministic post-filter wiring.
- Grocery import/upload routes return private file IDs/statuses or unavailable/fixture states, never public bucket URLs.
- Pickup reminder jobs return generated notification/job evidence or honest unavailable/dry-run status.

## Provider And No-Key Smoke

Unset provider keys in a local shell or preview deployment:

- Storage/Textract: upload/import routes must not claim live S3/Textract parse success when AWS/S3/Textract env is missing.
- Geocoding: address/postcode routes must return unavailable or deterministic fixture results and must not expose exact household coordinates publicly.
- Notifications/email: email providers must report unavailable or dry-run when no key is present; in-app notifications must be backed by current rows.
- AI copy: `generateAiCopy` must return fallback text with `status: "unavailable"` or `status: "fallback"` when provider config/key/output is invalid.
- Semantic ranking: embedding/vector ranking must return disabled/unavailable unless deterministic safety, privacy, distance, status, quantity, and eligibility filters have already passed.

## Browser Smoke

Open:

- `/grocery`: receipt/import and action-card states should be live or explicitly unavailable/fixture. AI copy, if enabled, should only polish explanations.
- `/merchant`: maps, heatmap, notification, and surplus-drop summaries should use coarse areas and avoid exact household coordinates, unit labels, emails, and phone numbers.
- `/proof`: CP8 provider readiness, private-file evidence hooks, geocoding privacy, notification jobs, AI no-key state, and AI guardrails should be visible.

## Guardrail Expectations

- AI cannot decide eligibility, trust, payment, safety, reservation capacity, or household visibility.
- AI can only produce copy, explanations, summaries, or a secondary semantic ranking after deterministic filters pass.
- DemandPool commitments and surplus reservations remain unpaid demo intent. No Stripe/payment ledger/card/deposit/captured-charge state should appear.
- Uploaded files remain private by default; public APIs expose IDs, statuses, or signed/server-mediated access affordances only.

## Lane 8D Schema Note

Lane 8D does not edit schema or migrations. If later integration wants stored embeddings, the expected future table/columns are:

- `match_embeddings(match_id uuid, embedding vector(...), provider text, model text, created_at timestamptz)`
- Optional source columns for `need_id`, `item_instance_id`, and deterministic engine metadata.

The embedding path must remain post-filter only even after those columns exist.
