import { z } from "zod";

export const AGENT_DETERMINISTIC_AUTHORITY = {
  safety: "deterministic",
  eligibility: "deterministic",
  trust: "deterministic",
  payment: "deterministic",
  reservationCapacity: "deterministic",
  visibility: "deterministic",
} as const;

export const agentActionPlanRequestSchema = z.object({
  itemTitle: z.string().trim().min(1).max(120),
  category: z.enum(["grocery", "fashion", "household"]).optional(),
  daysUntilUseBy: z.number().int().min(-365).max(3650).nullable().optional(),
  safetyStatus: z.enum(["eligible", "restricted", "blocked", "unknown"]).nullable().optional(),
  deterministicFacts: z.array(z.string().trim().min(1).max(240)).max(12).default([]),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
  persist: z.boolean().default(true),
});

export type AgentActionPlanRequest = z.infer<typeof agentActionPlanRequestSchema>;

export type AgentActor = {
  userId?: string | null;
  householdId?: string | null;
  merchantId?: string | null;
  neighbourhoodId?: string | null;
  demoScope?: string | null;
};

export type AgentPersistenceStatus = {
  recorded: boolean;
  status: "recorded" | "unavailable" | "skipped" | "failed";
  runId: string | null;
  reason: string | null;
};

export type AgentTraceMetadata = {
  provider: "langsmith";
  readiness: "configured" | "disabled" | "unavailable";
  traceId: string | null;
  project: string | null;
  detail: string;
};
