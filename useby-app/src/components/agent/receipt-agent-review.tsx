"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { requestReceiptAgentDraft } from "../../lib/agent-ui/adapters";
import type { ReceiptAgentDraft } from "../../lib/agent-ui/contracts";
import type { GroceryMutationResult, ManualGroceryInput } from "../../lib/grocery/types";
import { AgentDecisionPanel } from "./agent-decision-panel";

type ReviewState = "idle" | "drafting" | "review" | "confirming";

const statusClasses = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

export function ReceiptAgentReview({
  input,
  onConfirm,
}: {
  input: ManualGroceryInput;
  onConfirm: (input: ManualGroceryInput) => Promise<GroceryMutationResult>;
}) {
  const [state, setState] = useState<ReviewState>("idle");
  const [draft, setDraft] = useState<ReceiptAgentDraft | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [result, setResult] = useState<GroceryMutationResult | null>(null);

  const canDraft = input.itemName.trim().length > 0 || input.receiptLines.trim().length > 0;
  const selectedLine = useMemo(
    () => draft?.lines.find((line) => line.id === selectedLineId) ?? draft?.lines[0] ?? null,
    [draft, selectedLineId],
  );

  async function handleDraft() {
    setState("drafting");
    setResult(null);
    const nextDraft = await requestReceiptAgentDraft(window.fetch.bind(window), input);
    setDraft(nextDraft);
    setSelectedLineId(nextDraft.lines[0]?.id ?? null);
    setState("review");
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLine) {
      return;
    }

    setState("confirming");
    setResult(null);

    const confirmInput: ManualGroceryInput = {
      ...input,
      itemName: selectedLine.itemName,
      quantity: selectedLine.quantity,
      unit: selectedLine.unit,
      storageState: selectedLine.storageState,
      expiryDate: selectedLine.useByDate ?? input.expiryDate,
    };
    const nextResult = await onConfirm(confirmInput);
    setResult(nextResult);
    setState("review");
  }

  return (
    <section className="rounded-lg border border-[#d2dbc9] bg-[#fffdf7] p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#65715f]">Agent review</p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">Draft, review, confirm</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65715f]">
            The agent can prepare a receipt/action draft. Nothing changes in inventory until you confirm through the live import route.
          </p>
        </div>
        <button
          className="min-h-11 rounded-md bg-[#255c45] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#173d2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255c45] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canDraft || state === "drafting" || state === "confirming"}
          onClick={() => void handleDraft()}
          type="button"
        >
          {state === "drafting" ? "Drafting" : draft ? "Refresh draft" : "Draft with agent"}
        </button>
      </div>

      {draft ? (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-lg border border-[#e2d9c8] bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f0eadc] px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#69786d]">Reviewable draft</p>
                  <p className="mt-1 text-sm leading-6 text-[#1f2e26]">
                    Review the extracted rows, add any missing dates, then confirm one item into your live shelf.
                  </p>
                </div>
                <RunStatusPill status={draft.run.providerStatus} />
              </div>
              <form className="divide-y divide-[#f0eadc]" onSubmit={handleConfirm}>
                {draft.lines.map((line) => (
                  <label
                    key={line.id}
                    className="grid cursor-pointer gap-3 px-4 py-3 transition hover:bg-[#f7f3ea] sm:grid-cols-[24px_minmax(0,1fr)_130px] sm:items-start"
                  >
                    <input
                      checked={(selectedLine?.id ?? null) === line.id}
                      className="mt-1 size-4"
                      name="receipt-draft-line"
                      onChange={() => setSelectedLineId(line.id)}
                      type="radio"
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-[#17231c]">{line.itemName}</span>
                      <span className="mt-1 block text-sm leading-6 text-[#65715f]">
                        {line.quantity} {line.unit} · {formatLabel(line.storageState)}
                        {line.useByDate ? ` · label ${line.useByDate}` : " · date needs review"}
                      </span>
                    </span>
                    <span className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-2 py-1 text-xs font-semibold text-[#315b44]">
                      {draftLineBadge(line)}
                    </span>
                  </label>
                ))}

                <div className="px-4 py-4">
                  <button
                    className="min-h-11 w-full rounded-md border border-[#255c45] px-4 py-2 text-sm font-semibold text-[#255c45] transition hover:bg-[#255c45] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255c45] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!selectedLine || state === "confirming"}
                    type="submit"
                  >
                    {state === "confirming" ? "Confirming" : "Confirm reviewed import"}
                  </button>
                  {result ? (
                    <p className={`mt-3 rounded-md border px-3 py-2 text-sm leading-6 ${statusClasses[result.status] ?? statusClasses.error}`}>
                      {result.endpoint}{result.httpStatus ? ` returned HTTP ${result.httpStatus}` : ""}. {result.message}
                    </p>
                  ) : null}
                </div>
              </form>
            </div>

            <AgentDecisionPanel
              facts={draft.explanationFacts}
              aiRole={draft.aiRole}
              guardrails={draft.run.deterministicGuardrails}
            />
          </div>
        </div>
      ) : (
        <AgentDecisionPanel compact />
      )}
    </section>
  );
}

function RunStatusPill({ status }: { status: ReceiptAgentDraft["run"]["providerStatus"] }) {
  const labels = {
    generated: "Provider generated",
    fallback: "Fallback copy",
    unavailable: "Provider unavailable",
    not_requested: "Not requested",
  };
  const className = status === "generated"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "fallback"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-stone-200 bg-stone-100 text-stone-700";

  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${className}`}>
      {labels[status]}
    </span>
  );
}

function draftLineBadge(line: ReceiptAgentDraft["lines"][number]) {
  if (!line.useByDate) {
    return "Needs date";
  }

  if (line.confidence === null || line.confidence < 0.5) {
    return "Review";
  }

  return "Ready";
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
