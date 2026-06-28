import {
  DEMO_SCOPE,
  RIVERSIDE_QUARTER_DEMO_WORLD,
  type DemoWorldFixture,
  summarizeDemoWorld,
} from "../fixtures/demo-world";
import {
  DEMO_RESET_DELETE_ORDER,
  DEMO_SCHEMA_ASSUMPTIONS,
  DEMO_SCHEMA_CONTRACT_VERSION,
  DEMO_SCOPE_FILTER,
  DEMO_SEED_INSERT_ORDER,
  FINAL_OUTPUT_TABLES_NOT_SEEDED,
} from "./schema-contract";

export type DemoSeedOperation = "seed" | "reset";
export type DemoSeedStatus = "applied" | "dry_run";

export interface DemoSeedExecutionContext {
  operation: DemoSeedOperation;
  requestedAt: string;
  requestedBy: "demo_route" | "test" | "integration";
  idempotencyKey: string;
}

export interface DemoSeedPlan {
  operation: DemoSeedOperation;
  schemaContractVersion: typeof DEMO_SCHEMA_CONTRACT_VERSION;
  demoScopeFilter: typeof DEMO_SCOPE_FILTER;
  deleteOrder: readonly string[];
  insertOrder: typeof DEMO_SEED_INSERT_ORDER;
  finalOutputTablesNotSeeded: typeof FINAL_OUTPUT_TABLES_NOT_SEEDED;
  assumptions: typeof DEMO_SCHEMA_ASSUMPTIONS;
}

export interface DemoSeedMutationResult {
  status: DemoSeedStatus;
  applied: boolean;
  message: string;
  seedBatchId: string;
  mutationTimestamp: string;
  idempotencyKey: string;
  summary: ReturnType<typeof summarizeDemoWorld>;
  plan: DemoSeedPlan;
  integrationRequired?: string[];
}

export interface DemoSeedAdapter {
  readonly name: string;
  readonly live: boolean;
  seed(world: DemoWorldFixture, context: DemoSeedExecutionContext): Promise<DemoSeedMutationResult>;
  reset(world: DemoWorldFixture, context: DemoSeedExecutionContext): Promise<DemoSeedMutationResult>;
}

export function buildDemoSeedPlan(operation: DemoSeedOperation): DemoSeedPlan {
  return {
    operation,
    schemaContractVersion: DEMO_SCHEMA_CONTRACT_VERSION,
    demoScopeFilter: DEMO_SCOPE_FILTER,
    deleteOrder: operation === "reset" ? DEMO_RESET_DELETE_ORDER : [],
    insertOrder: DEMO_SEED_INSERT_ORDER,
    finalOutputTablesNotSeeded: FINAL_OUTPUT_TABLES_NOT_SEEDED,
    assumptions: DEMO_SCHEMA_ASSUMPTIONS,
  };
}

export function buildDemoSeedContext(
  operation: DemoSeedOperation,
  requestedAt = new Date().toISOString(),
): DemoSeedExecutionContext {
  return {
    operation,
    requestedAt,
    requestedBy: "demo_route",
    idempotencyKey: `${DEMO_SCOPE}:${operation}:${RIVERSIDE_QUARTER_DEMO_WORLD.metadata.seedVersion}`,
  };
}

export function createDryRunDemoSeedAdapter(): DemoSeedAdapter {
  const dryRun = async (
    world: DemoWorldFixture,
    context: DemoSeedExecutionContext,
  ): Promise<DemoSeedMutationResult> => ({
    status: "dry_run",
    applied: false,
    message:
      "Demo seed DB adapter is not wired yet. Lane 1C should connect this contract to the RDS Data API helpers after Lane 1A schema lands.",
    seedBatchId: world.metadata.seedBatchId,
    mutationTimestamp: context.requestedAt,
    idempotencyKey: context.idempotencyKey,
    summary: summarizeDemoWorld(world),
    plan: buildDemoSeedPlan(context.operation),
    integrationRequired: [
      "Map fixture demoId values to Lane 1A table columns or external IDs.",
      "Delete only rows matching demo_scope in the reset delete order before inserting fixture inputs.",
      "Insert seed_batches and audit_events rows with the returned idempotency key after input rows are written.",
      "Keep final output tables empty on seed; downstream jobs/routes should compute those from current rows.",
    ],
  });

  return {
    name: "dry-run-demo-seed-adapter",
    live: false,
    seed: dryRun,
    reset: dryRun,
  };
}

export function resolveDemoSeedAdapter(): DemoSeedAdapter {
  return createDryRunDemoSeedAdapter();
}

export async function runDemoSeedOperation(
  operation: DemoSeedOperation,
  options: {
    adapter?: DemoSeedAdapter;
    requestedAt?: string;
    requestedBy?: DemoSeedExecutionContext["requestedBy"];
    world?: DemoWorldFixture;
  } = {},
): Promise<DemoSeedMutationResult> {
  const world = options.world ?? RIVERSIDE_QUARTER_DEMO_WORLD;
  const context = {
    ...buildDemoSeedContext(operation, options.requestedAt),
    requestedBy: options.requestedBy ?? "demo_route",
  };
  const adapter = options.adapter ?? resolveDemoSeedAdapter();

  if (operation === "reset") {
    return adapter.reset(world, context);
  }

  return adapter.seed(world, context);
}
