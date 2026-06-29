import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("lending runtime migration contract", () => {
  const migration = readFileSync(
    join(process.cwd(), "drizzle/0003_lending_schema_runtime.sql"),
    "utf8",
  );

  it("uses booking metadata for lifecycle reuse and a lending table for overlap safety", () => {
    expect(migration).toContain("metadata->>'flow'");
    expect(migration).toContain("lending_reservations");
    expect(migration).toContain("lending_reservation_no_active_overlap");
  });

  it("enforces overlapping active lending reservations at the database layer", () => {
    expect(migration).toContain("EXCLUDE USING gist");
    expect(migration).toContain("tstzrange(\"window_start\", \"window_end\", '[)') WITH &&");
    expect(migration).toContain("WHERE (\"status\" = 'active' and \"deleted_at\" is null)");
  });

  it("keeps generic single-active booking protection for non-lending flows", () => {
    expect(migration).toContain("DROP INDEX IF EXISTS \"bookings_one_active_reservation_idx\"");
    expect(migration).toContain("coalesce(metadata->>'flow', '') <> 'lending'");
  });
});
