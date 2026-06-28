# Drizzle Migration Notes

Checkpoint 1 starts with `0000_faithful_thundra.sql`.

The migration must run with an Aurora PostgreSQL principal that can create extensions and schema objects. Use the master/migration secret for setup, not the app runtime secret:

```bash
AURORA_DATABASE=useby \
AURORA_CLUSTER_ARN=arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg \
AURORA_MASTER_SECRET_ARN=<migration-secret-arn> \
npx drizzle-kit migrate --config=drizzle.config.ts
```

The SQL enables `postgis`, `pgcrypto`, and `pg_trgm` before creating tables. It attempts `vector` in a guarded block; missing or unauthorized pgvector support raises a notice and does not block the base schema.

Location columns are `geography(Point, 4326)` with GiST indexes. Public API lanes must return coarse labels or approximate distance only, not exact household coordinates.
