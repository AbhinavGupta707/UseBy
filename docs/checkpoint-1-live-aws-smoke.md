# Checkpoint 1 Live AWS Smoke

This closes the remaining Checkpoint 1 caveat: proving the merged app can reach the real Aurora database and mutate live demo-scoped rows without using cached output.

## Completed Live Result

Completed on 2026-06-29 against production:

- Public URL: `https://useby-app.vercel.app`
- Vercel project: `useby-app` (`prj_QTVfZbuxGi6yISwdghbISaN10yz2`)
- Production deployment: `dpl_c6jWhY9Uz2dkd8D69sQyASpzX5Fy`
- AWS runtime role: `arn:aws:iam::222634407676:role/h0-useby-vercel-runtime-role`
- Runtime policy: `arn:aws:iam::222634407676:policy/h0-useby-runtime-policy`
- OIDC provider: `arn:aws:iam::222634407676:oidc-provider/oidc.vercel.com/abhinavs-projects-f1cef581`
- S3 bucket: `h0-useby-assets-222634407676-eu-west-2`

Live smoke passed:

- `/api/system/db-proof` returned `status: available`, `currentDatabase: useby`, PostgreSQL `17.7`, and installed `postgis`, `vector`, `pgcrypto`, and `pg_trgm`.
- `POST /api/demo/reset` returned `ok: true`, `status: applied`, and wrote deterministic demo input rows to Aurora.
- `/api/system/state` returned live table counts including 1 neighbourhood, 8 households, 8 users, 3 merchants, 20 catalog items, 36 item instances, 5 needs, 3 demand pools, 7 commitments, 2 merchant bids, 1 seed batch, and 1 audit event.
- `/proof` returned HTTP 200 from the public production alias.

Vercel project settings were corrected from `Other` to `Next.js`; the original `Other` preset deployed a static fallback and caused Vercel-level 404s for API routes.

SSO protection remains enabled for non-public deployment URLs via `all_except_custom_domains`; the public production alias is reachable. The temporary automation bypass token created during protected deployment testing was revoked.

## 1. Vercel Runtime Role

Create or confirm the UseBy AWS OIDC provider and role.

- AWS account: `222634407676`
- Region: `eu-west-2`
- Team slug: `abhinavs-projects-f1cef581`
- Provider URL: `https://oidc.vercel.com/abhinavs-projects-f1cef581`
- Audience: `https://vercel.com/abhinavs-projects-f1cef581`
- Vercel env var after role creation: `AWS_ROLE_ARN`
- Created role: `arn:aws:iam::222634407676:role/h0-useby-vercel-runtime-role`

Trust policy should scope to the real Vercel project name and production environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::222634407676:oidc-provider/oidc.vercel.com/abhinavs-projects-f1cef581"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/abhinavs-projects-f1cef581:aud": "https://vercel.com/abhinavs-projects-f1cef581",
          "oidc.vercel.com/abhinavs-projects-f1cef581:sub": "owner:abhinavs-projects-f1cef581:project:<VERCEL_PROJECT_NAME>:environment:production"
        }
      }
    }
  ]
}
```

Attach a runtime policy that allows:

- `rds-data:ExecuteStatement`
- `rds-data:BatchExecuteStatement`
- `rds-data:BeginTransaction`
- `rds-data:CommitTransaction`
- `rds-data:RollbackTransaction`
- `secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/useby/rds/app-user-*`
- S3 object access to `h0-useby-assets-222634407676-eu-west-2`

## 2. Vercel Environment Variables

Set these in the UseBy Vercel project for production:

```text
AWS_REGION=eu-west-2
AWS_ROLE_ARN=arn:aws:iam::222634407676:role/h0-useby-vercel-runtime-role
AURORA_DATABASE=useby
AURORA_CLUSTER_ARN=arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
AURORA_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/useby/rds/app-user-YkF92c
AWS_S3_BUCKET=h0-useby-assets-222634407676-eu-west-2
```

Do not put plaintext secret values in Vercel. The app uses the secret ARN and OIDC role.

## 3. Apply The Migration

Run migrations from an AWS-authenticated shell such as AWS CloudShell, or locally with an AWS CLI profile that can use the migration/master secret.

```bash
cd "/Users/abhinavgupta/Desktop/H0 AWS Hack/UseBy/useby-app"
export AWS_REGION=eu-west-2
export AURORA_DATABASE=useby
export AURORA_CLUSTER_ARN=arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
export AURORA_MASTER_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:222634407676:secret:rds!cluster-355fac13-d836-4902-ad14-222ec537b2a3-KUfhwU
npx drizzle-kit migrate --config=drizzle.config.ts
```

Use the app runtime secret for deployed routes, but use the master/migration secret for schema setup.

For the completed live run, CloudShell applied `drizzle/0000_faithful_thundra.sql` through the RDS Data API and inserted the matching row into `drizzle.__drizzle_migrations` with hash `42e7aaeec54c1f410d36aae9b40f334e584cadbf59936857815d71e88c5be961`.

## 4. Deploy And Smoke Test

After deployment, hit:

```bash
curl -i https://<useby-production-url>/api/system/db-proof
curl -i -X POST https://<useby-production-url>/api/demo/reset
curl -i https://<useby-production-url>/api/system/state
```

Passing smoke means:

- `/api/system/db-proof` returns database metadata plus extension statuses.
- `POST /api/demo/reset` returns `applied: true`.
- `/api/system/state` shows non-null row counts plus latest seed/audit rows.
- `/proof` shows Aurora/Data API/PostGIS as live instead of unavailable.
