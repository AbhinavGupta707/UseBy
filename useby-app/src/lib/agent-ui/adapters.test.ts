import { describe, expect, it } from "vitest";
import {
  loadAgentRunsSnapshot,
  localReceiptDraft,
  normalizeReceiptDraft,
  requestReceiptAgentDraft,
} from "./adapters";
import type { ManualGroceryInput } from "@/lib/grocery/types";

const input: ManualGroceryInput = {
  itemName: "",
  quantity: "1",
  unit: "each",
  storageState: "fridge",
  expiryDate: "",
  receiptLines: "Greek yoghurt\nCall +44 7700 900123",
};

describe("agent UI adapters", () => {
  it("keeps missing receipt agent routes honest with local fallback", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ status: "unavailable", message: "not installed" }),
    }) as Response;

    const draft = await requestReceiptAgentDraft(fetcher, input);

    expect(draft.run.providerStatus).toBe("unavailable");
    expect(draft.run.langsmithTraceId).toBeNull();
    expect(draft.message).toContain("Local review");
    expect(JSON.stringify(draft)).not.toContain("7700 900123");
    expect(draft.lines[1]?.itemName).toContain("[redacted contact]");
  });

  it("normalizes generated receipt drafts without inventing a trace id", () => {
    const draft = normalizeReceiptDraft(
      {
        run: {
          id: "run_1",
          status: "awaiting_review",
          providerStatus: "generated",
          provider: "fireworks",
          redactionStatus: "redacted",
        },
        draft: {
          lines: [
            {
              itemName: "Spinach",
              quantity: "1",
              unit: "bag",
              storageState: "fridge",
              useByDate: "2026-07-01",
              confidence: 0.82,
              ready: true,
            },
          ],
          facts: ["Current label date was extracted."],
        },
      },
      "/api/agent/receipt-draft",
      200,
      input,
    );

    expect(draft.run.providerStatus).toBe("generated");
    expect(draft.run.langsmithTraceId).toBeNull();
    expect(draft.lines[0]?.itemName).toBe("Spinach");
    expect(draft.lines[0]?.reviewStatus).toBe("ready");
  });

  it("shows LangSmith only when run metadata returns a trace id", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        runs: [
          {
            id: "run_2",
            flow: "receipt_action_plan",
            status: "completed",
            providerStatus: "generated",
            langsmithTraceId: "lsv2-trace-123",
            redactionStatus: "redacted",
          },
        ],
      }),
    }) as Response;

    const snapshot = await loadAgentRunsSnapshot(fetcher);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.runs[0]?.langsmithTraceId).toBe("lsv2-trace-123");
    expect(snapshot.runs[0]?.redactionStatus).toBe("redacted");
  });

  it("keeps registered-but-unavailable agent run routes distinct from missing routes", async () => {
    const fetcher = async (url: RequestInfo | URL) => ({
      ok: false,
      status: String(url).endsWith("/api/agent/runs") ? 503 : 404,
      json: async () => ({
        status: "unavailable",
        message: String(url).endsWith("/api/agent/runs")
          ? "agent_runs table is not available; run the CP9 agent runtime migration."
          : "not found",
      }),
    }) as Response;

    const snapshot = await loadAgentRunsSnapshot(fetcher);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toContain("registered but unavailable");
    expect(snapshot.message).toContain("agent_runs table is not available");
  });

  it("documents local drafts as redacted and not provider generated", () => {
    const draft = localReceiptDraft(input, "/api/agent/receipt-draft", 503, "No provider");

    expect(draft.run.providerStatus).toBe("unavailable");
    expect(draft.run.redactionStatus).toBe("redacted");
    expect(draft.run.deterministicGuardrails.map((guardrail) => guardrail.key)).toContain("deterministic_rules");
  });
});
