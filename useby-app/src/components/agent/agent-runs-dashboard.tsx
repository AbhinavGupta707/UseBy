"use client";

import { useEffect, useState } from "react";
import { AGENT_DTO_ASSUMPTIONS, loadAgentRunsSnapshot } from "../../lib/agent-ui/adapters";
import type { AgentRunsSnapshot, AgentRunSummary } from "../../lib/agent-ui/contracts";
import type { ProofStatus } from "../../lib/proof-ui/contracts";

const statusClasses: Record<ProofStatus | AgentRunSummary["status"] | AgentRunSummary["providerStatus"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
  drafted: "border-sky-200 bg-sky-50 text-sky-800",
  awaiting_review: "border-amber-200 bg-amber-50 text-amber-800",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  fallback: "border-amber-200 bg-amber-50 text-amber-800",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  generated: "border-emerald-200 bg-emerald-50 text-emerald-800",
  not_requested: "border-slate-200 bg-slate-50 text-slate-700",
};

export function AgentRunsDashboard() {
  const [snapshot, setSnapshot] = useState<AgentRunsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    const nextSnapshot = await loadAgentRunsSnapshot(window.fetch.bind(window));
    setSnapshot(nextSnapshot);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const nextSnapshot = await loadAgentRunsSnapshot(window.fetch.bind(window));
      if (!cancelled) {
        setSnapshot(nextSnapshot);
        setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading && !snapshot) {
    return <AgentRunsLoading />;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-[#65715f]">Agent Runtime</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#17231c]">Run metadata and review proof</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#65715f]">
                This page is intentionally admin-facing. It reports missing routes as unavailable and never invents provider success or LangSmith traces.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={snapshot?.status ?? "unknown"} />
              <button
                className="min-h-11 rounded-md border border-[#b7c2af] px-3 py-2 text-sm font-semibold text-[#253328] transition hover:border-[#315b44] hover:bg-[#f8faf4] disabled:cursor-wait disabled:opacity-60"
                disabled={isRefreshing}
                onClick={() => void refresh()}
                type="button"
              >
                {isRefreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </div>
          <p className="mt-4 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-2 text-sm leading-6 text-[#65715f]">
            {snapshot?.message ?? "Agent run metadata has not loaded yet."}
          </p>
        </Panel>

        <Panel>
          <p className="text-xs font-semibold uppercase text-[#65715f]">DTO Assumptions</p>
          <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Lane 9A contract expected by this UI</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#65715f]">
            {AGENT_DTO_ASSUMPTIONS.map((assumption) => (
              <li key={assumption} className="flex gap-2">
                <span className="mt-2 block size-1.5 shrink-0 rounded-full bg-[#d8a84e]" />
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <p className="text-xs font-semibold uppercase text-[#65715f]">Discovery</p>
          <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Agent route state</h2>
          <div className="mt-4 divide-y divide-[#edf1e8]">
            {(snapshot?.endpoints ?? []).map((endpoint) => (
              <div key={endpoint.endpoint} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="break-words font-mono text-sm font-semibold text-[#17231c]">{endpoint.endpoint}</p>
                  <p className="mt-1 text-sm leading-6 text-[#65715f]">
                    {endpoint.httpStatus ? `HTTP ${endpoint.httpStatus}` : "No HTTP response"} · {endpoint.message}
                  </p>
                </div>
                <StatusPill status={endpoint.status} compact />
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="text-xs font-semibold uppercase text-[#65715f]">Runs</p>
          <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Redacted agent run ledger</h2>
          {(snapshot?.runs.length ?? 0) > 0 ? (
            <div className="mt-4 grid gap-3">
              {snapshot?.runs.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-[#cfd8c6] bg-[#fbfcf7] px-4 py-5">
              <p className="font-semibold text-[#17231c]">No agent run rows reported</p>
              <p className="mt-2 text-sm leading-6 text-[#65715f]">
                The receipt review UI can still show a local fallback scaffold, but proof should wait for persisted run metadata before claiming traces or generated status.
              </p>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function RunCard({ run }: { run: AgentRunSummary }) {
  return (
    <article className="rounded-lg border border-[#e3e8dc] bg-[#fffdf7] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-mono text-sm font-semibold text-[#17231c]">{run.id}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-[#65715f]">{formatLabel(run.flow)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusPill status={run.status} compact />
          <StatusPill status={run.providerStatus} compact />
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-[#65715f]">{run.summary}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Fact label="Provider" value={run.providerName ?? "Not reported"} />
        <Fact label="LangSmith" value={run.langsmithTraceId ?? "No trace id reported"} />
        <Fact label="Redaction" value={formatLabel(run.redactionStatus)} />
        <Fact label="Updated" value={formatDateTime(run.updatedAt ?? run.createdAt)} />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {run.deterministicGuardrails.map((guardrail) => (
          <div key={guardrail.key} className="rounded-md border border-[#e3e8dc] bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase text-[#315b44]">{guardrail.label}</p>
              <StatusPill status={guardrail.status} compact />
            </div>
            <p className="mt-1 text-xs leading-5 text-[#65715f]">{guardrail.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function AgentRunsLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {[0, 1, 2, 3].map((index) => (
        <Panel key={index}>
          <div className="h-4 w-40 animate-pulse rounded bg-[#e4e9de]" />
          <div className="mt-5 space-y-3">
            <div className="h-10 animate-pulse rounded bg-[#eef2e8]" />
            <div className="h-10 animate-pulse rounded bg-[#eef2e8]" />
            <div className="h-10 animate-pulse rounded bg-[#eef2e8]" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-[#d2dbc9] bg-white p-5 shadow-sm">{children}</div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold text-[#17231c]">{value}</p>
    </div>
  );
}

function StatusPill({ status, compact = false }: { status: keyof typeof statusClasses; compact?: boolean }) {
  return (
    <span className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {compact ? formatLabel(status).slice(0, 14) : formatLabel(status)}
    </span>
  );
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not reported";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
