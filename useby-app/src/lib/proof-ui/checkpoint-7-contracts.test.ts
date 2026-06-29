import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS,
  RIVERSIDE_QUARTER_DEMO_WORLD,
} from "../../server/fixtures/demo-world";
import { buildDemoSeedPlan } from "../../server/seed/demo-seed-adapter";
import { FINAL_OUTPUT_TABLES_NOT_SEEDED } from "../../server/seed/schema-contract";

type Checkpoint7RouteContract = {
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

const CHECKPOINT_7_ROUTE_CONTRACTS: Checkpoint7RouteContract[] = [
  {
    key: "drop-list",
    method: "GET",
    endpoint: "/api/store-drops",
    routeFile: "src/app/api/store-drops/route.ts",
    requiredInputs: ["household or demo actor context"],
    writes: [],
    recomputes: ["remaining capacity from current active reservations"],
    mustReject: ["exact household coordinates", "direct personal contact"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "reserve-capacity",
    method: "POST",
    endpoint: "/api/store-drops/:dropId/reserve",
    routeFile: "src/app/api/store-drops/[dropId]/reserve/route.ts",
    requiredInputs: ["dropId", "householdId", "positive quantity", "idempotencyKey"],
    writes: ["store_drop_reservations", "audit_events"],
    recomputes: ["remaining capacity inside the reservation transaction"],
    mustReject: ["over capacity", "terminal drop", "non-positive quantity", "missing household context"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "reserve-idempotency",
    method: "POST",
    endpoint: "/api/store-drops/:dropId/reserve",
    routeFile: "src/app/api/store-drops/[dropId]/reserve/route.ts",
    requiredInputs: ["idempotencyKey", "dropId", "householdId"],
    writes: ["idempotency_keys", "store_drop_reservations", "audit_events"],
    recomputes: ["one active reservation per household per drop"],
    mustReject: ["duplicate active reservation without idempotent update", "expired idempotency replay mismatch"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "cancel-release",
    method: "POST",
    endpoint: "/api/store-drops/:dropId/cancel-reservation",
    routeFile: "src/app/api/store-drops/[dropId]/cancel-reservation/route.ts",
    requiredInputs: ["dropId", "householdId", "active reservation"],
    writes: ["store_drop_reservations", "audit_events"],
    recomputes: ["released capacity from current active reservations"],
    mustReject: ["missing active reservation", "wrong household", "already cancelled"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "merchant-create-edit",
    method: "POST",
    endpoint: "/api/merchant/store-drops",
    routeFile: "src/app/api/merchant/store-drops/route.ts",
    requiredInputs: ["merchant actor", "title", "quantity", "pickup window", "safety notes"],
    writes: ["store_drops", "audit_events"],
    recomputes: ["merchant-owned drop summary"],
    mustReject: ["non-positive quantity", "pickup end before start", "wrong merchant", "payment state"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "merchant-publish",
    method: "POST",
    endpoint: "/api/merchant/store-drops/:dropId/publish",
    routeFile: "src/app/api/merchant/store-drops/[dropId]/publish/route.ts",
    requiredInputs: ["merchant actor", "draft or paused drop", "pickup window", "capacity"],
    writes: ["store_drops", "audit_events"],
    recomputes: ["published availability from current reservation rows"],
    mustReject: ["wrong merchant", "terminal drop", "missing pickup window", "zero capacity"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "merchant-pause",
    method: "POST",
    endpoint: "/api/merchant/store-drops/:dropId/pause",
    routeFile: "src/app/api/merchant/store-drops/[dropId]/pause/route.ts",
    requiredInputs: ["merchant actor", "owned published drop"],
    writes: ["store_drops", "audit_events"],
    recomputes: ["paused status blocks new reservations"],
    mustReject: ["wrong merchant", "terminal drop", "new reservation while paused"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "merchant-close",
    method: "POST",
    endpoint: "/api/merchant/store-drops/:dropId/close",
    routeFile: "src/app/api/merchant/store-drops/[dropId]/close/route.ts",
    requiredInputs: ["merchant actor", "owned drop"],
    writes: ["store_drops", "audit_events"],
    recomputes: ["terminal status blocks new reservations"],
    mustReject: ["wrong merchant", "already expired unless idempotent", "new reservation after terminal status"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
  {
    key: "merchant-heatmap",
    method: "GET",
    endpoint: "/api/merchant/heatmap",
    routeFile: "src/app/api/merchant/heatmap/route.ts",
    requiredInputs: ["merchant actor", "service area"],
    writes: [],
    recomputes: ["coarse cells from current needs, published drops, and active reservations"],
    mustReject: ["exact household coordinate output", "single-household cell where privacy threshold is not met"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "raw household need location"],
  },
  {
    key: "expire-drops",
    method: "GET",
    endpoint: "/api/jobs/expire-store-drops",
    routeFile: "src/app/api/jobs/expire-store-drops/route.ts",
    requiredInputs: ["current expired pickup windows", "job idempotency key"],
    writes: ["store_drops", "store_drop_reservations", "job_runs", "audit_events"],
    recomputes: ["expired status and stale reservation release from current rows"],
    mustReject: ["seeded expiry output", "double expiry side effects"],
    mustNotExpose: ["exact household coordinates", "household unit label", "direct personal contact", "payment capture"],
  },
];

const FINAL_CP7_OUTPUT_TABLES = [
  "store_drop_reservations",
  "job_runs",
] as const;

const CP7_PUBLIC_SCAN_PATHS = [
  "src/app/merchant",
  "src/components/merchant",
  "src/lib/merchant",
  "src/app/proof",
  "src/components/proof",
  "src/lib/proof-ui",
] as const;

describe("Checkpoint 7 surplus drop route and reservation contracts", () => {
  it("documents capacity, idempotency, cancellation, status transition, heatmap, and expiry contracts", () => {
    expect(CHECKPOINT_7_ROUTE_CONTRACTS.map((contract) => contract.key)).toEqual([
      "drop-list",
      "reserve-capacity",
      "reserve-idempotency",
      "cancel-release",
      "merchant-create-edit",
      "merchant-publish",
      "merchant-pause",
      "merchant-close",
      "merchant-heatmap",
      "expire-drops",
    ]);
    expect(contractFor("reserve-capacity").mustReject).toEqual(
      expect.arrayContaining(["over capacity", "terminal drop", "non-positive quantity"]),
    );
    expect(contractFor("reserve-idempotency").recomputes).toContain("one active reservation per household per drop");
    expect(contractFor("cancel-release").recomputes).toContain("released capacity from current active reservations");
    expect(contractFor("merchant-publish").writes).toEqual(expect.arrayContaining(["store_drops", "audit_events"]));
    expect(contractFor("merchant-heatmap").mustNotExpose).toEqual(
      expect.arrayContaining(["exact household coordinates", "raw household need location"]),
    );
  });

  it("checks CP7 route registration layer before runtime assumptions", () => {
    const apiRoots = [
      join(process.cwd(), "src/app/api/store-drops"),
      join(process.cwd(), "src/app/api/merchant/store-drops"),
      join(process.cwd(), "src/app/api/merchant/heatmap"),
    ];
    const missing: string[] = [];
    const missingMethods: string[] = [];

    for (const contract of CHECKPOINT_7_ROUTE_CONTRACTS) {
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
      expect(missing.length, "CP7 API roots are not installed yet; proof and UI must report unavailable").toBeGreaterThan(0);
      expect(missingMethods).toEqual([]);
      return;
    }

    expect(missing, "Installed CP7 API route files are incomplete").toEqual([]);
    expect(missingMethods, "Installed CP7 route files must export their contract HTTP methods").toEqual([]);
  });

  it("requires every CP7 mutation to be audited, privacy-safe, and no-payment", () => {
    const mutations = CHECKPOINT_7_ROUTE_CONTRACTS.filter((contract) => contract.method === "POST");

    expect(mutations.length).toBeGreaterThan(0);
    for (const contract of mutations) {
      expect(contract.writes, `${contract.key} must write audit evidence`).toContain("audit_events");
      expect(contract.mustNotExpose).toContain("exact household coordinates");
      expect(contract.mustNotExpose).toContain("direct personal contact");
      expect(contract.mustNotExpose).toContain("payment capture");
    }
  });
});

describe("Checkpoint 7 live-output, privacy, and seed contracts", () => {
  it("allows seeded store drop inputs but never seeds reservations, expiry jobs, heatmap output, or audit proof as final output", () => {
    const seedPlan = buildDemoSeedPlan("seed");

    expect(RIVERSIDE_QUARTER_DEMO_WORLD.storeDrops.length).toBeGreaterThan(0);
    expect(seedPlan.insertOrder).toContain("store_drops");
    expect(FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS).toEqual(
      expect.arrayContaining(["storeDropReservations", "jobRuns"]),
    );

    for (const table of FINAL_CP7_OUTPUT_TABLES) {
      expect(seedPlan.insertOrder, `seed must not insert final CP7 output table ${table}`).not.toContain(table);
      expect(FINAL_OUTPUT_TABLES_NOT_SEEDED, `${table} should be documented as a final output`).toContain(table);
    }
  });

  it("scans CP7 merchant and proof source for privacy leaks and payment claims", () => {
    const scanned = readExistingPublicSource(CP7_PUBLIC_SCAN_PATHS);
    const forbidden = [
      /\b(lat|lng|latitude|longitude)\b\s*:/i,
      /\b(phone|telephone|mobile|email|contactEmail|contactPhone)\b\s*:/i,
      /\bstripe\b/i,
      /\bpayment\s+(?:captured|collected|processed|charged|held)\b/i,
      /\bdeposit\s+(?:was\s+)?(?:captured|collected|processed|charged|held)\b/i,
      /\bheld\s+funds\b/i,
      /\bunitLabel\b/,
    ];

    expect(scanned.length, "privacy/payment scan should cover installed public CP7 merchant/proof files").toBeGreaterThan(0);
    for (const file of scanned) {
      for (const pattern of forbidden) {
        expect(file.content, `${file.path} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function contractFor(key: string): Checkpoint7RouteContract {
  const contract = CHECKPOINT_7_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract) {
    throw new Error(`Missing CP7 contract: ${key}`);
  }

  return contract;
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
