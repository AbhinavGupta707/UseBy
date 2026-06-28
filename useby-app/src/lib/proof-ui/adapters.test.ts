import { describe, expect, it } from "vitest";
import { loadProofSnapshot, normalizeProofSnapshot } from "./adapters";
import type { EndpointEnvelope } from "./contracts";

function endpoint(
  endpointPath: string,
  status: EndpointEnvelope["status"],
  data: unknown,
): EndpointEnvelope {
  return {
    endpoint: endpointPath,
    status,
    httpStatus: status === "ok" ? 200 : 404,
    checkedAt: "2026-06-29T10:00:00.000Z",
    data,
    error: status === "ok" ? null : "HTTP 404",
  };
}

describe("proof UI adapters", () => {
  it("keeps missing system endpoints honest and unavailable", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "Not found",
    });

    const snapshot = await loadProofSnapshot(fetcher);

    expect(snapshot.overallStatus).toBe("unavailable");
    expect(snapshot.stateEndpoint.status).toBe("unavailable");
    expect(snapshot.dbProofEndpoint.status).toBe("unavailable");
    expect(snapshot.rowCounts.every((row) => row.count === null)).toBe(true);
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/demo/reset");
  });

  it("normalizes live counts, extensions, audit events, and jobs", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "available",
        integrations: {
          aurora: { configured: true, available: true, database: "useby" },
          s3: { configured: true, bucket: "private bucket configured" },
        },
        counts: [
          { key: "households", table: "households", count: 8 },
          { key: "itemInstances", table: "item_instances", count: 36 },
          { key: "needs", table: "needs", count: 5 },
          { key: "demandPools", table: "demand_pools", count: 3 },
          { key: "auditEvents", table: "audit_events", count: 12 },
          { key: "jobRuns", table: "job_runs", count: 2 },
        ],
        latestAuditEvents: {
          available: true,
          events: [
            {
              id: "audit_1",
              eventType: "demo.seeded",
              entityType: "seed_batch",
              createdAt: "2026-06-29T10:02:00.000Z",
            },
          ],
        },
        latestJobRuns: {
          available: true,
          runs: [
            {
              id: "job_1",
              jobType: "recompute-matches",
              status: "succeeded",
              finishedAt: "2026-06-29T10:03:00.000Z",
            },
          ],
        },
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: {
          available: true,
          items: [
            { name: "postgis", installed: true, installedVersion: "3.5.0" },
            { name: "pgcrypto", installed: true },
            { name: "pg_trgm", installed: true },
            { name: "vector", installed: false, detail: "Not enabled for Checkpoint 1" },
          ],
        },
      }),
    );

    expect(snapshot.overallStatus).toBe("ok");
    expect(snapshot.integrations.find((integration) => integration.key === "aurora")?.status).toBe("ok");
    expect(snapshot.rowCounts.find((row) => row.key === "households")?.count).toBe(8);
    expect(snapshot.extensions.find((extension) => extension.name === "postgis")?.status).toBe("ok");
    expect(snapshot.extensions.find((extension) => extension.name === "vector")?.status).toBe("unavailable");
    expect(snapshot.auditEvents[0]?.title).toBe("demo.seeded");
    expect(snapshot.jobRuns[0]?.name).toBe("recompute-matches");
  });
});
