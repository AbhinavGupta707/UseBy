import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS,
  RIVERSIDE_QUARTER_DEMO_WORLD,
} from "../../server/fixtures/demo-world";
import { buildDemoSeedPlan } from "../../server/seed/demo-seed-adapter";
import { FINAL_OUTPUT_TABLES_NOT_SEEDED } from "../../server/seed/schema-contract";

type Checkpoint6RouteContract = {
  key: string;
  method: "GET" | "POST";
  endpoint: string;
  routeFile: string;
  requiredInputs: string[];
  writes: string[];
  recomputes: string[];
  mustReject: string[];
  mustNotExpose: string[];
};

const CHECKPOINT_6_ROUTE_CONTRACTS: Checkpoint6RouteContract[] = [
  {
    key: "pool-list",
    method: "GET",
    endpoint: "/api/demand-pools",
    routeFile: "src/app/api/demand-pools/route.ts",
    requiredInputs: ["neighbourhood or demo actor context"],
    writes: [],
    recomputes: ["threshold progress from current commitments"],
    mustReject: ["exact household coordinates", "direct personal contact"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
  {
    key: "pool-create",
    method: "POST",
    endpoint: "/api/demand-pools",
    routeFile: "src/app/api/demand-pools/route.ts",
    requiredInputs: ["title", "threshold quantity", "threshold households", "coarse pickup radius", "idempotencyKey"],
    writes: ["demand_pools", "audit_events"],
    recomputes: ["pool aggregates"],
    mustReject: ["non-positive threshold", "missing neighbourhood", "exact household coordinate response"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
  {
    key: "pool-join-threshold",
    method: "POST",
    endpoint: "/api/demand-pools/:poolId/commit",
    routeFile: "src/app/api/demand-pools/[poolId]/commit/route.ts",
    requiredInputs: ["poolId", "householdId", "quantity", "max price intent", "idempotencyKey"],
    writes: ["demand_pool_commitments", "demand_pools", "audit_events"],
    recomputes: ["committed quantity", "committed households", "threshold transition"],
    mustReject: ["duplicate active commitment unless idempotent", "non-positive quantity", "terminal pool"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
  {
    key: "merchant-pools",
    method: "GET",
    endpoint: "/api/merchant/demand-pools",
    routeFile: "src/app/api/merchant/demand-pools/route.ts",
    requiredInputs: ["merchant actor or demo merchant context"],
    writes: [],
    recomputes: ["aggregate demand from current commitments"],
    mustReject: ["out-of-service-area pool details"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "household unit label"],
  },
  {
    key: "merchant-bid-submit",
    method: "POST",
    endpoint: "/api/merchant/bids",
    routeFile: "src/app/api/merchant/bids/route.ts",
    requiredInputs: ["demandPoolId", "merchantId", "price", "available quantity", "pickup window", "terms"],
    writes: ["merchant_bids", "audit_events"],
    recomputes: ["bid eligibility"],
    mustReject: ["wrong merchant location", "terminal pool", "non-positive price", "pickup end before start"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
  {
    key: "award-winner-orders",
    method: "POST",
    endpoint: "/api/jobs/close-demand-pools",
    routeFile: "src/app/api/jobs/close-demand-pools/route.ts",
    requiredInputs: ["current expired or threshold-met pools", "at least two current merchant bids for scoring"],
    writes: ["merchant_bids", "demand_pools", "pool_orders", "pickup_tasks", "job_runs", "audit_events"],
    recomputes: ["award winner selection", "rejected non-winners", "orders from active commitments"],
    mustReject: ["single-bid winner guarantee", "seeded award result", "double award"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
  {
    key: "pickup-ready",
    method: "POST",
    endpoint: "/api/merchant/pickups/:orderId/ready",
    routeFile: "src/app/api/merchant/pickups/[orderId]/ready/route.ts",
    requiredInputs: ["orderId", "merchant actor", "idempotencyKey"],
    writes: ["pool_orders", "pickup_tasks", "audit_events"],
    recomputes: ["pickup readiness from current order status"],
    mustReject: ["wrong merchant", "unawarded order", "already collected"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
  {
    key: "pickup-collected",
    method: "POST",
    endpoint: "/api/merchant/pickups/:orderId/collected",
    routeFile: "src/app/api/merchant/pickups/[orderId]/collected/route.ts",
    requiredInputs: ["orderId", "merchant actor", "idempotencyKey"],
    writes: ["pool_orders", "pickup_tasks", "demand_pool_commitments", "audit_events"],
    recomputes: ["fulfilled commitment and pickup status"],
    mustReject: ["wrong merchant", "not ready", "duplicate collection"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "captured payment"],
  },
];

const FINAL_CP6_OUTPUT_TABLES = [
  "pool_orders",
  "pickup_tasks",
  "job_runs",
] as const;

const CP6_PUBLIC_SCAN_PATHS = [
  "src/app/merchant",
  "src/components/merchant",
  "src/lib/merchant",
  "src/app/proof",
  "src/components/proof",
  "src/lib/proof-ui",
] as const;

describe("Checkpoint 6 DemandPool, merchant, award, and pickup contracts", () => {
  it("documents pool threshold, bid submission, award, order, and pickup route contracts", () => {
    expect(CHECKPOINT_6_ROUTE_CONTRACTS.map((contract) => contract.key)).toEqual([
      "pool-list",
      "pool-create",
      "pool-join-threshold",
      "merchant-pools",
      "merchant-bid-submit",
      "award-winner-orders",
      "pickup-ready",
      "pickup-collected",
    ]);
    expect(contractFor("pool-join-threshold").recomputes).toEqual(
      expect.arrayContaining(["committed quantity", "committed households", "threshold transition"]),
    );
    expect(contractFor("merchant-bid-submit").mustReject).toEqual(
      expect.arrayContaining(["wrong merchant location", "terminal pool", "non-positive price", "pickup end before start"]),
    );
    expect(contractFor("award-winner-orders").writes).toEqual(
      expect.arrayContaining(["merchant_bids", "demand_pools", "pool_orders", "pickup_tasks", "job_runs", "audit_events"]),
    );
    expect(contractFor("pickup-ready").writes).toEqual(expect.arrayContaining(["pool_orders", "pickup_tasks", "audit_events"]));
    expect(contractFor("pickup-collected").writes).toEqual(
      expect.arrayContaining(["pool_orders", "pickup_tasks", "demand_pool_commitments", "audit_events"]),
    );
  });

  it("requires every CP6 mutation to be audited, privacy-safe, and no-payment", () => {
    const mutations = CHECKPOINT_6_ROUTE_CONTRACTS.filter((contract) => contract.method === "POST");

    expect(mutations.length).toBeGreaterThan(0);
    for (const contract of mutations) {
      expect(contract.writes, `${contract.key} must write audit evidence`).toContain("audit_events");
      expect(contract.mustNotExpose).toContain("exact household coordinates");
      expect(contract.mustNotExpose).toContain("direct personal contact");
      expect(contract.mustNotExpose).toContain("captured payment");
    }
  });

  it("checks CP6 route registration layer before runtime assumptions", () => {
    const apiRoots = [
      join(process.cwd(), "src/app/api/demand-pools"),
      join(process.cwd(), "src/app/api/merchant"),
    ];
    const missing: string[] = [];
    const missingMethods: string[] = [];

    for (const contract of CHECKPOINT_6_ROUTE_CONTRACTS) {
      const absolutePath = join(process.cwd(), contract.routeFile);
      if (!existsSync(absolutePath)) {
        missing.push(`${contract.method} ${contract.endpoint} -> ${contract.routeFile}`);
        continue;
      }

      const content = readFileSync(absolutePath, "utf8");
      const methodPattern = new RegExp(
        `export\\s+(?:(?:async\\s+)?function\\s+${contract.method}\\b|const\\s+${contract.method}\\s*=)`,
      );
      if (!methodPattern.test(content)) {
        missingMethods.push(`${contract.routeFile} must export ${contract.method}`);
      }
    }

    if (apiRoots.every((root) => !existsSync(root))) {
      expect(missing.length, "CP6 API roots are not installed yet; proof and UI must report unavailable").toBeGreaterThan(0);
      expect(missingMethods).toEqual([]);
      return;
    }

    expect(missing, "Installed CP6 API route files are incomplete").toEqual([]);
    expect(missingMethods, "Installed CP6 route files must export their contract HTTP methods").toEqual([]);
  });
});

describe("Checkpoint 6 live-output, privacy, and payment wording contracts", () => {
  it("keeps seeded DemandPool state below threshold and never seeds final CP6 outputs", () => {
    const seedPlan = buildDemoSeedPlan("seed");

    for (const pool of RIVERSIDE_QUARTER_DEMO_WORLD.demandPools) {
      const householdCommitments = new Set(
        RIVERSIDE_QUARTER_DEMO_WORLD.demandPoolCommitments
          .filter((commitment) => commitment.poolId === pool.demoId)
          .map((commitment) => commitment.householdId),
      );

      expect(pool.status).toBe("gathering");
      expect(householdCommitments.size).toBeLessThan(pool.thresholdHouseholds);
    }

    expect(FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS).toEqual(
      expect.arrayContaining(["poolOrders", "pickupTasks", "jobRuns"]),
    );
    for (const table of FINAL_CP6_OUTPUT_TABLES) {
      expect(seedPlan.insertOrder, `seed must not insert final CP6 output table ${table}`).not.toContain(table);
      expect(FINAL_OUTPUT_TABLES_NOT_SEEDED, `${table} should be documented as a final output`).toContain(table);
    }
  });

  it("requires installed award runtime to score current bids and create orders transactionally", () => {
    const demandPoolRuntime = readSourceTree("src/server/demand-pools");
    const merchantRuntime = readSourceTree("src/server/merchant");
    const jobRuntime = readExistingFile("src/app/api/jobs/close-demand-pools/route.ts");
    const evidence = `${demandPoolRuntime}\n${merchantRuntime}\n${jobRuntime}`.toLowerCase();

    if (!demandPoolRuntime.trim() && !merchantRuntime.trim()) {
      expect(evidence).toContain("runSystemJobStub".toLowerCase());
      return;
    }

    expect(evidence).toMatch(/score|scoring/);
    expect(evidence).toMatch(/price/);
    expect(evidence).toMatch(/pickup[_-]?window|pickup window/);
    expect(evidence).toMatch(/winner|winning/);
    expect(evidence).toMatch(/pool_orders/);
    expect(evidence).toMatch(/pickup_tasks/);
    expect(evidence).toMatch(/transaction|begin|commit|rollback|serializable/);
  });

  it("scans CP6 public source for household privacy leaks and payment claims", () => {
    const scanned = readExistingPublicSource(CP6_PUBLIC_SCAN_PATHS);
    const forbidden = [
      /\b(lat|lng|latitude|longitude)\b\s*:/i,
      /\b(phone|telephone|mobile|email|contactEmail|contactPhone)\b\s*:/i,
      /\bstripe\b/i,
      /\bcard\b/i,
      /\bpayment\s+(?:captured|collected|processed|charged|held)\b/i,
      /\bdeposit\s+(?:was\s+)?(?:captured|collected|processed|charged|held)\b/i,
      /\bheld\s+funds\b/i,
    ];

    expect(scanned.length, "privacy/payment scan should cover installed public CP6/proof files").toBeGreaterThan(0);
    for (const file of scanned) {
      for (const pattern of forbidden) {
        expect(file.content, `${file.path} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function contractFor(key: string): Checkpoint6RouteContract {
  const contract = CHECKPOINT_6_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract) {
    throw new Error(`Missing CP6 contract: ${key}`);
  }

  return contract;
}

function readExistingFile(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function readSourceTree(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    return "";
  }

  return listFiles(absolutePath)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function readExistingPublicSource(relativePaths: readonly string[]): Array<{ path: string; content: string }> {
  return relativePaths.flatMap((relativePath) => {
    const absolutePath = join(process.cwd(), relativePath);
    if (!existsSync(absolutePath)) {
      return [];
    }

    const files = statSync(absolutePath).isDirectory() ? listFiles(absolutePath) : [absolutePath];

    return files
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .map((file) => ({
        path: file.replace(`${process.cwd()}/`, ""),
        content: readFileSync(file, "utf8"),
      }));
  });
}

function listFiles(path: string): string[] {
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? listFiles(child) : [child];
  });
}
