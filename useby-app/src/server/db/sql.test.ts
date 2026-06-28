import { describe, expect, it } from "vitest";
import { sqlParam } from "./sql";

describe("sqlParam", () => {
  it("binds primitive and json parameters for the RDS Data API", () => {
    expect(sqlParam("name", "Riverside")).toEqual({
      name: "name",
      value: { stringValue: "Riverside" },
    });
    expect(sqlParam("count", 3)).toEqual({
      name: "count",
      value: { longValue: 3 },
    });
    expect(sqlParam("metadata", { checkpoint: 1 })).toEqual({
      name: "metadata",
      typeHint: "JSON",
      value: { stringValue: '{"checkpoint":1}' },
    });
  });

  it("rejects unsafe parameter names", () => {
    expect(() => sqlParam("bad-name", "value")).toThrow(
      "Unsafe SQL parameter name",
    );
  });
});
