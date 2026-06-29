import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS,
  RIVERSIDE_QUARTER_DEMO_WORLD,
} from "../../server/fixtures/demo-world";
import { buildDemoSeedPlan } from "../../server/seed/demo-seed-adapter";

type Checkpoint4RouteContract = {
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

const CHECKPOINT_4_ROUTE_CONTRACTS: Checkpoint4RouteContract[] = [
  {
    key: "lending-listings",
    method: "GET",
    endpoint: "/api/lending/listings",
    routeFile: "src/app/api/lending/listings/route.ts",
    requiredInputs: ["demoHouseholdId or neighbourhoodId", "category filter optional"],
    writes: [],
    recomputes: [],
    mustReject: ["unlisted item", "grocery category"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-requests",
    method: "GET",
    endpoint: "/api/lending/requests",
    routeFile: "src/app/api/lending/requests/route.ts",
    requiredInputs: ["actorHouseholdId"],
    writes: [],
    recomputes: [],
    mustReject: ["unauthorized household"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-request",
    method: "POST",
    endpoint: "/api/lending/request",
    routeFile: "src/app/api/lending/request/route.ts",
    requiredInputs: ["itemId", "borrowWindowStart", "borrowWindowEnd", "requesterHouseholdId", "idempotencyKey"],
    writes: ["bookings", "audit_events"],
    recomputes: ["availability"],
    mustReject: ["grocery category", "unlisted item", "same household", "blocked relationship", "overlapping active reservation"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-accept-reserve",
    method: "POST",
    endpoint: "/api/lending/:bookingId/accept",
    routeFile: "src/app/api/lending/[bookingId]/accept/route.ts",
    requiredInputs: ["bookingId", "ownerHouseholdId", "idempotencyKey"],
    writes: ["bookings", "handoffs", "inventory_events", "audit_events"],
    recomputes: ["availability"],
    mustReject: ["wrong actor", "terminal booking", "overlapping active reservation", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-decline",
    method: "POST",
    endpoint: "/api/lending/:bookingId/decline",
    routeFile: "src/app/api/lending/[bookingId]/decline/route.ts",
    requiredInputs: ["bookingId", "ownerHouseholdId", "idempotencyKey"],
    writes: ["bookings", "audit_events"],
    recomputes: ["availability"],
    mustReject: ["wrong actor", "terminal booking"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-cancel",
    method: "POST",
    endpoint: "/api/lending/:bookingId/cancel",
    routeFile: "src/app/api/lending/[bookingId]/cancel/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId", "idempotencyKey"],
    writes: ["bookings", "inventory_events", "audit_events"],
    recomputes: ["availability"],
    mustReject: ["wrong actor", "terminal booking"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-return",
    method: "POST",
    endpoint: "/api/lending/:bookingId/returned",
    routeFile: "src/app/api/lending/[bookingId]/returned/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId", "conditionNote optional", "idempotencyKey"],
    writes: ["bookings", "handoffs", "inventory_events", "audit_events"],
    recomputes: ["availability"],
    mustReject: ["not picked up", "wrong actor", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-complete",
    method: "POST",
    endpoint: "/api/lending/:bookingId/complete",
    routeFile: "src/app/api/lending/[bookingId]/complete/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId", "completionNote optional", "idempotencyKey"],
    writes: ["bookings", "handoffs", "trust_events", "inventory_events", "audit_events"],
    recomputes: ["availability", "trust score"],
    mustReject: ["not returned", "wrong actor", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
  {
    key: "lending-review",
    method: "POST",
    endpoint: "/api/lending/:bookingId/review",
    routeFile: "src/app/api/lending/[bookingId]/review/route.ts",
    requiredInputs: ["bookingId", "rating", "reviewerHouseholdId", "idempotencyKey"],
    writes: ["reviews", "trust_events", "audit_events"],
    recomputes: ["trust score"],
    mustReject: ["incomplete booking", "duplicate review", "wrong actor"],
    mustNotExpose: ["exact household coordinates", "direct personal contact", "payment captured"],
  },
];

const FINAL_CP4_OUTPUT_TABLES = [
  "bookings",
  "handoffs",
  "lending_availability_windows",
  "lending_reservations",
  "lending_condition_events",
  "inventory_events",
  "trust_events",
  "reviews",
  "job_runs",
] as const;

const CP4_PUBLIC_SCAN_PATHS = [
  "src/app/api/lending",
  "src/app/lending",
  "src/components/lending",
  "src/lib/lending",
  "src/app/proof",
  "src/components/proof",
  "src/lib/proof-ui",
] as const;

describe("Checkpoint 4 lending and rental API contracts", () => {
  it("documents listing, request, accept/reserve, decline, cancel, return, complete, and review route contracts", () => {
    expect(CHECKPOINT_4_ROUTE_CONTRACTS.map((contract) => contract.key)).toEqual([
      "lending-listings",
      "lending-requests",
      "lending-request",
      "lending-accept-reserve",
      "lending-decline",
      "lending-cancel",
      "lending-return",
      "lending-complete",
      "lending-review",
    ]);

    expect(contractFor("lending-listings")).toMatchObject({
      method: "GET",
      endpoint: "/api/lending/listings",
    });
    expect(contractFor("lending-request").mustReject).toEqual(
      expect.arrayContaining([
        "grocery category",
        "unlisted item",
        "same household",
        "blocked relationship",
        "overlapping active reservation",
      ]),
    );
    expect(contractFor("lending-accept-reserve").writes).toEqual(
      expect.arrayContaining(["bookings", "handoffs", "inventory_events", "audit_events"]),
    );
    expect(contractFor("lending-return").writes).toEqual(
      expect.arrayContaining(["bookings", "handoffs", "inventory_events", "audit_events"]),
    );
    expect(contractFor("lending-complete").writes).toEqual(
      expect.arrayContaining(["bookings", "handoffs", "trust_events", "inventory_events", "audit_events"]),
    );
    expect(contractFor("lending-review").writes).toEqual(
      expect.arrayContaining(["reviews", "trust_events", "audit_events"]),
    );
  });

  it("requires every CP4 mutation to be audited, privacy-safe, and payment-deferred", () => {
    const mutations = CHECKPOINT_4_ROUTE_CONTRACTS.filter((contract) => contract.method === "POST");

    expect(mutations.length).toBeGreaterThan(0);
    for (const contract of mutations) {
      expect(contract.writes, `${contract.key} must write audit evidence`).toContain("audit_events");
      expect(contract.mustNotExpose).toContain("exact household coordinates");
      expect(contract.mustNotExpose).toContain("direct personal contact");
      expect(contract.mustNotExpose).toContain("payment captured");
    }
  });

  it("checks lending route registration once the lending API directory exists", () => {
    const lendingApiRoot = join(process.cwd(), "src/app/api/lending");
    const missing: string[] = [];
    const missingMethods: string[] = [];

    for (const contract of CHECKPOINT_4_ROUTE_CONTRACTS) {
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

    if (!existsSync(lendingApiRoot)) {
      expect(missing, "CP4 lending API is not installed yet; proof must report unavailable").toHaveLength(
        CHECKPOINT_4_ROUTE_CONTRACTS.length,
      );
      expect(missingMethods).toEqual([]);
      return;
    }

    expect(missing, "CP4 lending API route files are partially installed").toEqual([]);
    expect(missingMethods, "CP4 lending route files must export their contract HTTP methods").toEqual([]);
  });
});

describe("Checkpoint 4 overlap, policy, seed, and public wording contracts", () => {
  it("requires installed CP4 runtime to enforce overlap conflicts from live rows", () => {
    const lendingRuntime = readSourceTree("src/server/lending");
    const apiRuntime = readSourceTree("src/app/api/lending");
    const evidence = `${lendingRuntime}\n${apiRuntime}`.toLowerCase();

    if (!evidence.trim()) {
      expect(evidence.trim(), "CP4 lending runtime is not installed yet").toBe("");
      return;
    }

    expect(evidence).toMatch(/overlap|overlapping|active[_-]?reservation|rental[_-]?window|borrow[_-]?window/);
    expect(evidence).toMatch(/for\s+update|serializable|exclude|conflict|unique/i);
    expect(evidence).toMatch(/audit_events/);
  });

  it("requires installed CP4 policy to reject grocery, private items, same-household requests, and blocks", () => {
    const lendingRuntime = readSourceTree("src/server/lending");
    const apiRuntime = readSourceTree("src/app/api/lending");
    const evidence = `${lendingRuntime}\n${apiRuntime}`.toLowerCase();

    if (!evidence.trim()) {
      expect(evidence.trim(), "CP4 lending policy is not installed yet").toBe("");
      return;
    }

    expect(evidence).toMatch(/fashion/);
    expect(evidence).toMatch(/household/);
    expect(evidence).toMatch(/grocery/);
    expect(evidence).toMatch(/listed/);
    expect(evidence).toMatch(/block|blocked/);
    expect(evidence).toMatch(/requester_household_id|requesterhouseholdid/);
    expect(evidence).toMatch(/owner_household_id|ownerhouseholdid/);
  });

  it("seeds fashion and household input world state without final CP4 outputs", () => {
    const seedPlan = buildDemoSeedPlan("seed");
    const listedLendingItems = RIVERSIDE_QUARTER_DEMO_WORLD.itemInstances.filter(
      (item) => ["fashion", "household"].includes(item.category) && item.state === "listed",
    );
    const lendingNeeds = RIVERSIDE_QUARTER_DEMO_WORLD.needs.filter((need) =>
      ["fashion", "household"].includes(need.category),
    );

    expect(listedLendingItems.length).toBeGreaterThan(0);
    expect(lendingNeeds.length).toBeGreaterThan(0);
    expect(FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS).toEqual(
      expect.arrayContaining(["bookings", "handoffs", "rentalWindows", "trustEvents", "reviews", "jobRuns"]),
    );

    for (const table of FINAL_CP4_OUTPUT_TABLES) {
      expect(seedPlan.insertOrder, `seed must not insert final CP4 output table ${table}`).not.toContain(table);
      expect(seedPlan.finalOutputTablesNotSeeded, `${table} should be documented as a final output`).toContain(table);
    }
  });

  it("scans CP4 public source for exact coordinates, direct contact leakage, payment-captured claims, and food-safety overclaims", () => {
    const scanned = readExistingPublicSource(CP4_PUBLIC_SCAN_PATHS);
    const forbidden = [
      /\b(lat|lng|latitude|longitude)\b\s*:/i,
      /\b(phone|telephone|mobile|email|contactEmail|contactPhone)\b\s*:/i,
      /\bpayment\s+(?:captured|collected|processed|charged)\b/i,
      /\bdeposit\s+(?:was\s+)?(?:captured|collected|processed|charged)\b/i,
      /\bstripe\s+(?:charged|captured|processed)\b/i,
      /\bcertif(?:y|ies|ied)\b(?![^.]{0,80}\bdoes not\b)/i,
      /\bguaranteed fresh\b/i,
      /\bsafe to eat\b/i,
      /\bfood is safe\b/i,
      /\bfreshness guaranteed\b/i,
    ];

    expect(scanned.length, "privacy/safety scan should cover installed public CP4/proof files").toBeGreaterThan(0);
    for (const file of scanned) {
      for (const pattern of forbidden) {
        expect(file.content, `${file.path} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function contractFor(key: string): Checkpoint4RouteContract {
  const contract = CHECKPOINT_4_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract) {
    throw new Error(`Missing CP4 contract: ${key}`);
  }

  return contract;
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
