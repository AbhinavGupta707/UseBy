# Checkpoint 0 Handoff

## Decisions

- Scaffold location: `useby-app`
- Package manager: npm
- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- ORM/data access: Drizzle ORM plus AWS RDS Data API for Aurora PostgreSQL
- Primary database: `h0-hackathon-aurora-pg`, database `useby`
- Storage: S3-first, bucket `h0-useby-assets-222634407676-eu-west-2`
- Auth: defer implementation to Checkpoint 1/2; default to Auth.js/NextAuth unless a lane finds a blocker
- Secondary DynamoDB event stream: no

## AWS State

- Aurora cluster ARN: `arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg`
- App secret ARN: `arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/useby/rds/app-user-YkF92c`
- Master/migration secret ARN: `arn:aws:secretsmanager:eu-west-2:222634407676:secret:rds!cluster-355fac13-d836-4902-ad14-222ec537b2a3-KUfhwU`
- Aurora auto-pauses at 0 ACU; RDS Data API callers must retry `DatabaseResumingException` with short backoff.

## Checkpoint 1 Entry Gate

- Keep final output live-computed from rows.
- Lane 1A owns schema and migrations.
- Lane 1B owns seed/reset data after Lane 1A contracts stabilize.
- Lane 1C owns DB runtime helpers, transactions, idempotency, audit, jobs, and `/api/system/state`.
- Lane 1D owns the live proof UI and consumes live endpoints only.

