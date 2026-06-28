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
        status: "connected",
        dataApi: "enabled",
        rowCounts: {
          households: 8,
          item_instances: 36,
          needs: 5,
          demand_pools: 3,
          audit_events: 12,
          job_runs: 2,
        },
        integrations: [
          { key: "S3", status: "available", bucket: "private bucket configured" },
          { key: "Vercel Runtime", status: "ready", environment: "preview" },
        ],
        latestAuditEvents: [
          {
            id: "audit_1",
            action: "demo.seeded",
            summary: "Seeded Riverside Quarter input world",
            createdAt: "2026-06-29T10:02:00.000Z",
          },
        ],
        latestJobRuns: [
          {
            id: "job_1",
            jobName: "recompute-matches",
            status: "success",
            finishedAt: "2026-06-29T10:03:00.000Z",
          },
        ],
      }),
      endpoint("/api/system/db-proof", "ok", {
        database: { engine: "Aurora PostgreSQL" },
        extensions: [
          { name: "postgis", installed: true, version: "3.5.0" },
          { name: "pgcrypto", installed: true },
          { name: "pg_trgm", installed: true },
          { name: "vector", installed: false, detail: "Not enabled for Checkpoint 1" },
        ],
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

