import { describe, expect, it } from "vitest";

import {
  activeReservationStatusSql,
  buildReservationPolicyLockSql,
} from "./reservations";

describe("store drop reservation transactions", () => {
  it("locks the drop and recomputes active reservation capacity in the transaction", () => {
    const sql = buildReservationPolicyLockSql();

    expect(sql).toContain("from store_drops d");
    expect(sql).toContain("for update of d");
    expect(sql).toContain("coalesce(sum(r.quantity), 0)");
    expect(sql).toContain("r.status in ('active')");
  });

  it("locks an existing active household reservation before updating it", () => {
    const sql = buildReservationPolicyLockSql();

    expect(sql).toContain("r.household_id = :householdId::uuid");
    expect(sql).toContain("order by r.created_at asc");
    expect(sql).toContain("for update");
  });

  it("treats active reservations as the authoritative reserved capacity set", () => {
    expect(activeReservationStatusSql()).toBe("'active'");
  });
});

