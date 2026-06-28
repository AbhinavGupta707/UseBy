# UseBy Agent Rules

- Diagnose in layer order: when a feature is missing or unavailable, check registration, discovery, install state, and activation flows before debugging permissions or runtime.
- The app lives in `useby-app`; repo-level docs and orchestration plans live at the repository root.
- Build the full live product, not a cached demo. Seeded data may create input world state only; final action cards, matches, bookings, pool winners, trust changes, and audit output must be computed from current database rows.
- Aurora PostgreSQL is the primary backend. Use PostGIS for location logic and pgvector only where semantic matching clearly helps.
- Keep AWS resources on the Free plan/free-credit posture. Do not enable AWS Organizations, IAM Identity Center via Organizations, or anything that warns that credits will expire or the account will upgrade without explicit confirmation.
- Do not print or commit plaintext secrets. Secret ARNs and resource IDs are fine; passwords, tokens, and API keys are not.
- Use npm for this app.
- Use Next.js App Router, TypeScript, Tailwind, Drizzle ORM, AWS RDS Data API, and S3-first storage unless a checkpoint handoff explicitly changes the stack.
- Add migrations and schema changes in one owned lane per checkpoint to avoid drift.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before handing off a checkpoint when those scripts exist.

