import { NextResponse } from "next/server";
import { z } from "zod";

import { getLangSmithReadiness } from "@/server/ai/langsmith";
import { draftReceiptItems } from "@/server/ai/structured";
import type { AgentActor, AgentTraceMetadata } from "@/server/agent/contracts";
import { recordAgentRun } from "@/server/agent/persistence";
import { loadRuntimeEnv } from "@/server/db/env";
import { resolveDemoActorContext } from "@/server/demo/context";

export const dynamic = "force-dynamic";

const receiptDraftRequestSchema = z.object({
  flow: z.string().optional(),
  reviewMode: z.string().optional(),
  persist: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
  input: z.object({
    receiptLines: z.string().max(8000).default(""),
    itemName: z.string().max(160).default(""),
    quantity: z.string().max(40).default("1"),
    unit: z.string().max(40).default("each"),
    storageState: z.string().max(40).default("cupboard"),
    expiryDate: z.string().max(40).default(""),
  }),
});

type ReceiptDraftInput = z.infer<typeof receiptDraftRequestSchema>["input"];

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid receipt draft payload.",
      details: error,
    },
    { status: 400 },
  );
}

async function resolveOptionalActor(request: Request): Promise<AgentActor | null> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return null;
  }

  const url = new URL(request.url);
  const contextResult = await resolveDemoActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });

  if (!contextResult.ok) {
    return null;
  }

  return {
    userId: contextResult.context.user.id,
    householdId: contextResult.context.household.id,
    neighbourhoodId: contextResult.context.neighbourhood.id,
    demoScope: contextResult.context.demoScope,
  };
}

function traceMetadata(): AgentTraceMetadata {
  const readiness = getLangSmithReadiness();

  return {
    provider: "langsmith",
    readiness: readiness.status,
    traceId: null,
    project: readiness.project,
    detail:
      readiness.status === "configured"
        ? "LangSmith is configured; trace id remains null until a traced workflow records one."
        : readiness.detail,
  };
}

function rawTextFor(input: ReceiptDraftInput) {
  const receiptText = input.receiptLines.trim();
  if (receiptText) {
    return receiptText;
  }

  return [input.itemName, input.quantity, input.unit].filter(Boolean).join(" ").trim();
}

function confidenceScore(value: "low" | "medium" | "high") {
  if (value === "high") {
    return 0.86;
  }

  if (value === "medium") {
    return 0.64;
  }

  return 0.38;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/agent/receipt-draft",
    method: "POST",
    body: {
      flow: "receipt_action_plan",
      reviewMode: "human_confirm_required",
      input: {
        receiptLines: "optional OCR or pasted receipt text",
        itemName: "optional manual item name",
        quantity: "optional visible quantity",
        unit: "optional visible unit",
        storageState: "optional visible storage hint",
        expiryDate: "optional visible label date",
      },
    },
    authority:
      "AI drafts extraction rows only. Confirmed inventory changes still go through deterministic grocery import routes.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return validationResponse("Request body must be JSON.");
  }

  const parsed = receiptDraftRequestSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  const input = parsed.data.input;
  const rawText = rawTextFor(input);
  const deterministicFacts = [
    input.itemName ? `Manual item field: ${input.itemName}` : null,
    input.quantity ? `Visible quantity: ${input.quantity}` : null,
    input.unit ? `Visible unit: ${input.unit}` : null,
    input.storageState ? `Visible storage hint: ${input.storageState}` : null,
    input.expiryDate ? `Visible label date: ${input.expiryDate}` : null,
    "Human confirmation is required before inventory mutation.",
  ].filter((fact): fact is string => Boolean(fact));

  const result = await draftReceiptItems({
    rawText,
    deterministicFacts,
  });
  const trace = traceMetadata();
  const actor = await resolveOptionalActor(request);
  const lines = result.draft.items.map((item, index) => ({
    id: `receipt-draft-${index + 1}`,
    itemName: item.name,
    quantity: String(item.quantity),
    unit: item.unit,
    storageState: item.storageHint,
    useByDate: item.useByDate,
    confidence: confidenceScore(item.confidence),
    reviewStatus: item.useByDate ? "ready" : "needs_review",
  }));

  const persistence = parsed.data.persist
    ? await recordAgentRun({
        workflow: "receipt_draft",
        sourceRoute: "/api/agent/receipt-draft",
        idempotencyKey: parsed.data.idempotencyKey,
        actor,
        requestSummary: {
          flow: parsed.data.flow ?? "receipt_action_plan",
          reviewMode: parsed.data.reviewMode ?? "human_confirm_required",
          rawTextPresent: rawText.length > 0,
          manualItemPresent: input.itemName.trim().length > 0,
          deterministicFactCount: deterministicFacts.length,
        },
        result,
        artifact: {
          kind: "receipt_draft",
          title: "Receipt draft for review",
          payload: {
            draft: result.draft,
            providerStatus: result.status,
            guardrails: result.guardrails,
          },
        },
        trace,
      })
    : {
        recorded: false,
        status: "skipped" as const,
        runId: null,
        reason: "Persistence disabled by request.",
      };

  const now = new Date().toISOString();

  return NextResponse.json(
    {
      ok: true,
      draft: {
        items: lines,
        lines,
        notes: result.draft.notes,
        requiresReview: true,
        explanationFacts: [
          "The agent drafted visible item rows only.",
          "UseBy deterministic routes still decide safety, eligibility, matching, and booking.",
          ...deterministicFacts.slice(0, 3),
        ],
        aiRole:
          "The agent extracts and drafts review rows. Confirming saves through the live grocery import route.",
        reviewRequired: true,
      },
      run: {
        id: persistence.runId ?? `receipt-draft-${now}`,
        flow: "receipt_draft",
        status: result.status === "generated" ? "completed" : result.status,
        providerStatus: result.status,
        providerName: result.provider,
        createdAt: now,
        updatedAt: now,
        langsmithTraceId: trace.traceId,
        redactionStatus: "redacted",
        summary: result.reason ?? "Receipt draft generated for human review.",
        deterministicGuardrails: [
          {
            key: "human_confirm",
            label: "Human confirmation",
            detail: "No inventory mutation happens until the customer confirms the reviewed row.",
            status: "ok",
          },
          {
            key: "deterministic_rules",
            label: "Deterministic authority",
            detail: "Safety, eligibility, visibility, payment, trust, and capacity remain deterministic.",
            status: "ok",
          },
          {
            key: "privacy_redaction",
            label: "Privacy redaction",
            detail: "Raw prompts, direct contacts, exact coordinates, and secrets are not persisted.",
            status: "ok",
          },
        ],
      },
      provider: {
        status: result.status,
        name: result.provider,
        model: result.model,
        reason: result.reason,
      },
      trace,
      persistence,
    },
    { status: result.status === "generated" ? 201 : 200 },
  );
}
