import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDemoSeedPlan } from "../../server/seed/demo-seed-adapter";

type Checkpoint3RouteContract = {
  key: string;
  method: "GET" | "POST";
  endpoint: string;
  routeFile: string;
  requiredInputs: string[];
  writes: string[];
  mustReject: string[];
  mustNotExpose: string[];
};

const BOOKING_STATES = [
  "requested",
  "accepted",
  "reserved",
  "pickup_scheduled",
  "picked_up",
  "completed",
  "reviewed",
  "cancelled",
  "declined",
  "disputed",
] as const;

const CHECKPOINT_3_ROUTE_CONTRACTS: Checkpoint3RouteContract[] = [
  {
    key: "booking-request",
    method: "POST",
    endpoint: "/api/bookings/request",
    routeFile: "src/app/api/bookings/request/route.ts",
    requiredInputs: ["matchId or itemInstanceId", "receiverHouseholdId", "idempotencyKey"],
    writes: ["bookings", "handoffs", "audit_events"],
    mustReject: ["missing safety acknowledgement", "unsafe food", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "booking-accept",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/accept",
    routeFile: "src/app/api/bookings/[bookingId]/accept/route.ts",
    requiredInputs: ["bookingId", "ownerHouseholdId", "idempotencyKey"],
    writes: ["bookings", "item_instances", "inventory_events", "audit_events"],
    mustReject: ["double reservation", "unsafe food", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "booking-decline",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/decline",
    routeFile: "src/app/api/bookings/[bookingId]/decline/route.ts",
    requiredInputs: ["bookingId", "ownerHouseholdId", "idempotencyKey"],
    writes: ["bookings", "audit_events"],
    mustReject: ["wrong actor", "terminal booking"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "booking-cancel",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/cancel",
    routeFile: "src/app/api/bookings/[bookingId]/cancel/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId", "idempotencyKey"],
    writes: ["bookings", "item_instances", "inventory_events", "audit_events"],
    mustReject: ["wrong actor", "terminal booking"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "schedule-pickup",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/schedule-pickup",
    routeFile: "src/app/api/bookings/[bookingId]/schedule-pickup/route.ts",
    requiredInputs: ["bookingId", "pickupWindow", "coarsePickupHint", "idempotencyKey"],
    writes: ["handoffs", "bookings", "audit_events"],
    mustReject: ["unaccepted booking", "raw coordinate pickup hint"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "picked-up",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/picked-up",
    routeFile: "src/app/api/bookings/[bookingId]/picked-up/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId", "idempotencyKey"],
    writes: ["handoffs", "bookings", "inventory_events", "audit_events"],
    mustReject: ["unscheduled pickup", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "complete",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/complete",
    routeFile: "src/app/api/bookings/[bookingId]/complete/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId", "idempotencyKey"],
    writes: ["bookings", "handoffs", "trust_events", "inventory_events", "audit_events"],
    mustReject: ["not picked up", "blocked relationship"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "review",
    method: "POST",
    endpoint: "/api/bookings/:bookingId/review",
    routeFile: "src/app/api/bookings/[bookingId]/review/route.ts",
    requiredInputs: ["bookingId", "rating", "reviewerHouseholdId", "idempotencyKey"],
    writes: ["reviews", "trust_events", "audit_events"],
    mustReject: ["incomplete booking", "duplicate review"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "booking-list",
    method: "GET",
    endpoint: "/api/bookings",
    routeFile: "src/app/api/bookings/route.ts",
    requiredInputs: ["actorHouseholdId"],
    writes: [],
    mustReject: ["unauthorized household"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "booking-detail",
    method: "GET",
    endpoint: "/api/bookings/:bookingId",
    routeFile: "src/app/api/bookings/[bookingId]/route.ts",
    requiredInputs: ["bookingId", "actorHouseholdId"],
    writes: [],
    mustReject: ["unauthorized household"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "safety-acknowledgement",
    method: "POST",
    endpoint: "/api/safety/acknowledgements",
    routeFile: "src/app/api/safety/acknowledgements/route.ts",
    requiredInputs: ["actorHouseholdId", "foodSharingAcknowledgedAt", "idempotencyKey"],
    writes: ["safety_acknowledgements", "audit_events"],
    mustReject: ["missing actor household"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "report-policy",
    method: "POST",
    endpoint: "/api/reports",
    routeFile: "src/app/api/reports/route.ts",
    requiredInputs: ["reporterHouseholdId", "reportedEntityType", "reason", "idempotencyKey"],
    writes: ["reports", "audit_events"],
    mustReject: ["missing reporter", "invalid reason"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
  {
    key: "block-policy",
    method: "POST",
    endpoint: "/api/blocks",
    routeFile: "src/app/api/blocks/route.ts",
    requiredInputs: ["blockerHouseholdId", "blockedHouseholdId", "idempotencyKey"],
    writes: ["blocks", "audit_events"],
    mustReject: ["self block", "missing actor"],
    mustNotExpose: ["exact household coordinates", "direct personal contact"],
  },
];

const FINAL_CP3_OUTPUT_TABLES = [
  "bookings",
  "handoffs",
  "safety_acknowledgements",
  "trust_events",
  "reviews",
  "reports",
  "blocks",
] as const;

const PUBLIC_PRIVACY_SCAN_PATHS = [
  "src/app/api/grocery/matches/route.ts",
  "src/app/api/grocery/action-cards/route.ts",
  "src/app/api/bookings",
  "src/app/api/safety",
  "src/app/api/reports",
  "src/app/api/blocks",
  "src/app/grocery",
  "src/app/proof",
  "src/components/grocery",
  "src/components/proof",
  "src/lib/grocery",
  "src/lib/proof-ui",
] as const;

describe("Checkpoint 3 booking, handoff, safety, and trust contracts", () => {
  it("documents every CP3 route and state transition side effect", () => {
    expect(BOOKING_STATES).toEqual([
      "requested",
      "accepted",
      "reserved",
      "pickup_scheduled",
      "picked_up",
      "completed",
      "reviewed",
      "cancelled",
      "declined",
      "disputed",
    ]);

    expect(CHECKPOINT_3_ROUTE_CONTRACTS.map((contract) => contract.key)).toEqual([
      "booking-request",
      "booking-accept",
      "booking-decline",
      "booking-cancel",
      "schedule-pickup",
      "picked-up",
      "complete",
      "review",
      "booking-list",
      "booking-detail",
      "safety-acknowledgement",
      "report-policy",
      "block-policy",
    ]);

    expect(contractFor("booking-request").mustReject).toContain("missing safety acknowledgement");
    expect(contractFor("booking-accept").mustReject).toContain("double reservation");
    expect(contractFor("complete").writes).toEqual(
      expect.arrayContaining(["bookings", "handoffs", "trust_events", "inventory_events", "audit_events"]),
    );
    expect(contractFor("review").writes).toEqual(
      expect.arrayContaining(["reviews", "trust_events", "audit_events"]),
    );
    expect(contractFor("block-policy").writes).toEqual(expect.arrayContaining(["blocks", "audit_events"]));
    expect(contractFor("report-policy").writes).toEqual(expect.arrayContaining(["reports", "audit_events"]));
  });

  it("requires every CP3 mutation to write audit evidence and avoid public privacy leaks", () => {
    const mutations = CHECKPOINT_3_ROUTE_CONTRACTS.filter((contract) => contract.method === "POST");

    expect(mutations.length).toBeGreaterThan(0);
    for (const contract of mutations) {
      expect(contract.writes, `${contract.key} must write audit evidence`).toContain("audit_events");
      expect(contract.mustNotExpose).toContain("exact household coordinates");
      expect(contract.mustNotExpose).toContain("direct personal contact");
    }
  });

  it("installs the route handler files with the expected HTTP methods", () => {
    const missing: string[] = [];
    const missingMethods: string[] = [];

    for (const contract of CHECKPOINT_3_ROUTE_CONTRACTS) {
      const absolutePath = join(process.cwd(), contract.routeFile);
      if (!existsSync(absolutePath)) {
        missing.push(`${contract.method} ${contract.endpoint} -> ${contract.routeFile}`);
        continue;
      }

      const content = readFileSync(absolutePath, "utf8");
      if (!new RegExp(`export\\s+(async\\s+)?function\\s+${contract.method}\\b`).test(content)) {
        missingMethods.push(`${contract.routeFile} must export ${contract.method}`);
      }
    }

    expect(missing, "CP3 runtime routes are not installed yet").toEqual([]);
    expect(missingMethods, "CP3 route files must export their contract HTTP methods").toEqual([]);
  });
});

describe("Checkpoint 3 transaction, seed, and safety proof contracts", () => {
  it("requires booking acceptance to use row-lock or serializable transaction semantics", () => {
    const bookingRuntime = readSourceTree("src/server/bookings");
    const evidence = bookingRuntime.toLowerCase();

    expect(
      evidence,
      "Booking runtime must use SELECT ... FOR UPDATE, serializable isolation, or equivalent active-reservation exclusion before CP3 merge.",
    ).toMatch(/for\s+update|serializable|skip\s+locked|active[_-]?reservation|double[_-]?reservation/);
    expect(evidence).not.toMatch(/set\s+transaction\s+isolation\s+level/);
    expect(evidence).toMatch(/inventory_events/);
    expect(evidence).toMatch(/audit_events/);
  });

  it("keeps safety acknowledgement writes aligned with required schema columns", () => {
    const safetyRuntime = readSourceTree("src/server/safety");

    expect(safetyRuntime).toMatch(/neighbourhood_id/);
    expect(safetyRuntime).toMatch(/context\.neighbourhood\.id/);
    expect(safetyRuntime).toMatch(/demo_scope_id/);
    expect(safetyRuntime).toMatch(/is_demo/);
  });

  it("keeps seed data to input world state and out of CP3 final outputs", () => {
    const seedPlan = buildDemoSeedPlan("seed");

    for (const table of FINAL_CP3_OUTPUT_TABLES) {
      expect(seedPlan.insertOrder, `seed must not insert ${table}`).not.toContain(table);
    }
  });

  it("scans public source for exact coordinates, personal contact leakage, and safety overclaims", () => {
    const scanned = readExistingPublicSource();
    const forbidden = [
      /\b(lat|lng|latitude|longitude)\b\s*:/i,
      /\b(phone|telephone|mobile|email|contactEmail|contactPhone)\b\s*:/i,
      /\bcertif(?:y|ies|ied)\b(?![^.]{0,80}\bdoes not\b)/i,
      /\bguaranteed fresh\b/i,
      /\bsafe to eat\b/i,
      /\bfood is safe\b/i,
      /\bfreshness guaranteed\b/i,
    ];

    expect(scanned.length, "privacy/safety scan should cover public files").toBeGreaterThan(0);
    for (const file of scanned) {
      for (const pattern of forbidden) {
        expect(file.content, `${file.path} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function contractFor(key: string): Checkpoint3RouteContract {
  const contract = CHECKPOINT_3_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract) {
    throw new Error(`Missing CP3 contract: ${key}`);
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

function readExistingPublicSource(): Array<{ path: string; content: string }> {
  return PUBLIC_PRIVACY_SCAN_PATHS.flatMap((relativePath) => {
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
