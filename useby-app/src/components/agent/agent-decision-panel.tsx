import type { AgentGuardrail } from "../../lib/agent-ui/contracts";

const defaultFacts = [
  "Inventory facts, label dates, package state, and current route responses are deterministic inputs.",
  "AI can draft and explain. It cannot approve sharing, booking, payment, trust, visibility, or capacity.",
  "Customer surfaces stay redacted: no exact household coordinates, direct contacts, secrets, or raw uploaded files.",
];

const defaultGuardrails: AgentGuardrail[] = [
  {
    key: "deterministic_decisions",
    label: "UseBy rules decide",
    detail: "Safety, eligibility, visibility, payment, trust, and capacity are computed by product code.",
    status: "ok",
  },
  {
    key: "redacted_output",
    label: "Redacted output",
    detail: "Explanations use coarse public facts and omit direct contacts or exact household positions.",
    status: "ok",
  },
];

export function AgentDecisionPanel({
  title = "How this was decided",
  facts = defaultFacts,
  aiRole = "AI may draft, explain, extract, or summarize only.",
  guardrails = defaultGuardrails,
  compact = false,
}: {
  title?: string;
  facts?: string[];
  aiRole?: string;
  guardrails?: AgentGuardrail[];
  compact?: boolean;
}) {
  return (
    <aside className="rounded-lg border border-[#d8c48f] bg-[#fff9e9] p-4 text-[#1f2e26]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#7b6a35]">Decision note</p>
          <h3 className="mt-1 text-base font-semibold leading-tight">{title}</h3>
        </div>
        <span className="rounded-md border border-[#d8c48f] bg-[#fffdf7] px-2 py-1 text-xs font-semibold text-[#255c45]">
          Human review
        </span>
      </div>

      <div className={compact ? "mt-3 grid gap-2" : "mt-4 grid gap-3 md:grid-cols-[1fr_0.9fr]"}>
        <div>
          <p className="text-sm leading-6 text-[#546456]">{aiRole}</p>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#546456]">
            {facts.slice(0, compact ? 2 : 4).map((fact) => (
              <li key={fact} className="flex gap-2">
                <span className="mt-2 block size-1.5 shrink-0 rounded-full bg-[#d8a84e]" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>

        {!compact ? (
          <div className="grid content-start gap-2">
            {guardrails.slice(0, 3).map((guardrail) => (
              <div key={guardrail.key} className="rounded-md border border-[#eadfbf] bg-[#fffdf7] px-3 py-2">
                <p className="text-xs font-semibold uppercase text-[#255c45]">{guardrail.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#69786d]">{guardrail.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
