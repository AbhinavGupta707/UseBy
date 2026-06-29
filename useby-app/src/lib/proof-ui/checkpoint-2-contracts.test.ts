import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET as recomputeMatchesGet, POST as recomputeMatchesPost } from "../../app/api/jobs/recompute-matches/route";
import { buildDemoSeedPlan } from "../../server/seed/demo-seed-adapter";
import {
  DEMO_SEED_INSERT_ORDER,
  FINAL_OUTPUT_TABLES_NOT_SEEDED,
} from "../../server/seed/schema-contract";

type Checkpoint2ApiContract = {
  key: string;
  method: "GET" | "PATCH" | "POST";
  endpoint: string;
  requiredInputs: string[];
  writes: string[];
  recomputes: string[];
  mustNotExpose: string[];
  unavailableUntilPresent?: boolean;
};

const CHECKPOINT_2_API_CONTRACTS: Checkpoint2ApiContract[] = [
  {
    key: "receipt-import",
    method: "POST",
    endpoint: "/api/grocery/import",
    requiredInputs: ["idempotencyKey", "demoHouseholdId", "lines"],
    writes: [
      "receipt_imports",
      "receipt_line_items",
      "item_instances",
      "inventory_events",
      "expiry_observations",
      "audit_events",
    ],
    recomputes: ["action_cards", "matches"],
    mustNotExpose: ["exact household coordinates", "secret ARNs", "plaintext secrets"],
    unavailableUntilPresent: true,
  },
  {
    key: "expiry-edit",
    method: "PATCH",
    endpoint: "/api/grocery/items/:itemId",
    requiredInputs: ["itemId", "storageState or useByDate or expiryConfidence"],
    writes: ["expiry_observations", "inventory_events", "audit_events"],
    recomputes: ["action_cards"],
    mustNotExpose: ["exact household coordinates", "plaintext secrets"],
    unavailableUntilPresent: true,
  },
  {
    key: "action-card-recompute",
    method: "POST",
    endpoint: "/api/jobs/recompute-matches",
    requiredInputs: ["demoHouseholdId or neighbourhoodId"],
    writes: ["action_cards", "job_runs", "audit_events"],
    recomputes: ["action_cards"],
    mustNotExpose: ["exact household coordinates", "plaintext secrets"],
    unavailableUntilPresent: true,
  },
  {
    key: "food-matching",
    method: "GET",
    endpoint: "/api/grocery/matches",
    requiredInputs: ["demoHouseholdId or neighbourhoodId"],
    writes: [],
    recomputes: [],
    mustNotExpose: ["exact household coordinates", "plaintext secrets"],
    unavailableUntilPresent: true,
  },
  {
    key: "matching-job",
    method: "POST",
    endpoint: "/api/jobs/recompute-matches",
    requiredInputs: ["idempotency key derived from job type, neighbourhood, and window"],
    writes: ["matches", "action_cards", "job_runs", "audit_events"],
    recomputes: ["matches", "action_cards"],
    mustNotExpose: ["exact household coordinates", "plaintext secrets"],
  },
];

const FOOD_SAFETY_WORDING_CONTRACT = {
  allowedSharing: "Share cards and matches are for eligible sealed/package-safe grocery items only.",
  requiredDisclaimer: "UseBy does not certify food safety or freshness.",
  uncertaintyWarning: "Surface allergen and expiry uncertainty before a neighbour handoff.",
};

const USER_FACING_SCAN_FILES = [
  "src/app/page.tsx",
  "src/app/proof/page.tsx",
  "src/components/proof/live-proof-dashboard.tsx",
  "src/lib/proof-ui/adapters.ts",
];

const AURORA_ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
] as const;

describe("Checkpoint 2 grocery API contracts", () => {
  it("documents receipt import, expiry edit, action-card, and matching side effects", () => {
    expect(CHECKPOINT_2_API_CONTRACTS.map((contract) => contract.key)).toEqual([
      "receipt-import",
      "expiry-edit",
      "action-card-recompute",
      "food-matching",
      "matching-job",
    ]);

    expect(contractFor("receipt-import")).toMatchObject({
      method: "POST",
      endpoint: "/api/grocery/import",
    });
    expect(contractFor("receipt-import").writes).toEqual(
      expect.arrayContaining([
        "receipt_imports",
        "receipt_line_items",
        "item_instances",
        "inventory_events",
        "expiry_observations",
        "audit_events",
      ]),
    );
    expect(contractFor("expiry-edit").writes).toEqual(
      expect.arrayContaining(["expiry_observations", "inventory_events", "audit_events"]),
    );
    expect(contractFor("action-card-recompute").writes).toEqual(
      expect.arrayContaining(["action_cards", "job_runs", "audit_events"]),
    );
    expect(contractFor("matching-job").writes).toEqual(
      expect.arrayContaining(["matches", "action_cards", "job_runs", "audit_events"]),
    );
  });

  it("requires mutation contracts to be audited and privacy-safe", () => {
    const mutations = CHECKPOINT_2_API_CONTRACTS.filter((contract) =>
      ["PATCH", "POST"].includes(contract.method),
    );

    expect(mutations.length).toBeGreaterThan(0);
    for (const contract of mutations) {
      expect(contract.writes).toContain("audit_events");
      expect(contract.mustNotExpose).toContain("exact household coordinates");
      expect(contract.mustNotExpose).toContain("plaintext secrets");
    }
  });

  it("keeps current recompute route unavailable instead of faking CP2 success without Aurora env", async () => {
    const previousEnv = new Map(AURORA_ENV_NAMES.map((name) => [name, process.env[name]] as const));
    for (const name of AURORA_ENV_NAMES) {
      delete process.env[name];
    }

    try {
      const handlers = [
        (request: NextRequest) => recomputeMatchesGet(request),
        (request: NextRequest) => recomputeMatchesPost(request),
      ];

      for (const handler of handlers) {
        const request = new NextRequest("http://localhost/api/jobs/recompute-matches");
        const response = await handler(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          status: "unavailable",
          jobType: "recompute-matches",
          recorded: false,
        });
        expect(body.reason).toContain("Aurora env missing");
      }
    } finally {
      for (const [name, value] of previousEnv) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });
});

describe("Checkpoint 2 seed and food-safety contracts", () => {
  it("seeds only input world state and never final grocery outputs", () => {
    const seedPlan = buildDemoSeedPlan("seed");

    expect(DEMO_SEED_INSERT_ORDER).toEqual(
      expect.arrayContaining([
        "receipt_imports",
        "receipt_line_items",
        "item_instances",
        "expiry_observations",
        "needs",
      ]),
    );

    for (const finalOutputTable of FINAL_OUTPUT_TABLES_NOT_SEEDED) {
      expect(seedPlan.insertOrder).not.toContain(finalOutputTable);
    }
    expect(seedPlan.insertOrder).not.toContain("action_cards");
    expect(seedPlan.insertOrder).not.toContain("matches");
  });

  it("pins the CP2 safety language to uncertainty, not certification", () => {
    expect(FOOD_SAFETY_WORDING_CONTRACT.requiredDisclaimer).toContain("does not certify");
    expect(FOOD_SAFETY_WORDING_CONTRACT.allowedSharing).toContain("eligible sealed/package-safe");
    expect(FOOD_SAFETY_WORDING_CONTRACT.uncertaintyWarning).toContain("allergen");
  });

  it("scans current user-facing copy for food safety overclaims", () => {
    const forbiddenClaims = [
      /\bcertif(?:y|ies|ied)\b(?![^.]{0,80}\bdoes not\b)/i,
      /\bguaranteed fresh\b/i,
      /\bsafe to eat\b/i,
      /\bfood is safe\b/i,
      /\bfreshness guaranteed\b/i,
    ];

    for (const relativePath of USER_FACING_SCAN_FILES) {
      const content = readFileSync(join(process.cwd(), relativePath), "utf8");
      for (const claim of forbiddenClaims) {
        expect(content, `${relativePath} should not match ${claim}`).not.toMatch(claim);
      }
    }
  });
});

function contractFor(key: string): Checkpoint2ApiContract {
  const contract = CHECKPOINT_2_API_CONTRACTS.find((candidate) => candidate.key === key);
  if (!contract) {
    throw new Error(`Missing CP2 contract: ${key}`);
  }

  return contract;
}
