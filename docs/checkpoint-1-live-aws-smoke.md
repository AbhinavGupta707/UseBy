# Checkpoint 1 Live AWS Smoke

This closes the remaining Checkpoint 1 caveat: proving the merged app can reach the real Aurora database and mutate live demo-scoped rows without using cached output.

## 1. Vercel Runtime Role

Create or confirm the UseBy AWS OIDC provider and role.

- AWS account: `222634407676`
- Region: `eu-west-2`
- Team slug: `abhinavs-projects-f1cef581`
- Provider URL: `https://oidc.vercel.com/abhinavs-projects-f1cef581`
- Audience: `https://vercel.com/abhinavs-projects-f1cef581`
- Vercel env var after role creation: `AWS_ROLE_ARN`

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
AWS_ROLE_ARN=<role arn from step 1>
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
