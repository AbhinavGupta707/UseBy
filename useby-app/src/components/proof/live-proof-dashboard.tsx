"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CHECKPOINT_DEMO_CONTROLS, loadProofSnapshot } from "@/lib/proof-ui/adapters";
import type {
  ArchitectureNode,
  DemoControlProof,
  EndpointEnvelope,
  ExtensionProof,
  IntegrationProof,
  JobRunProof,
  ProofSnapshot,
  ProofStatus,
  RowCountProof,
  TimelineEventProof,
} from "@/lib/proof-ui/contracts";

type ControlResult = {
  key: string;
  status: ProofStatus;
  message: string;
};

const statusLabels: Record<ProofStatus, string> = {
  ok: "Live",
  warning: "Partial",
  unavailable: "Unavailable",
  error: "Error",
  unknown: "Unknown",
};

const statusClasses: Record<ProofStatus, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

export function LiveProofDashboard() {
  const [snapshot, setSnapshot] = useState<ProofSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlResult, setControlResult] = useState<ControlResult | null>(null);

  async function refresh() {
    setIsRefreshing(true);
    setError(null);

    try {
      const nextSnapshot = await loadProofSnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Proof state refresh failed.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSnapshot() {
      try {
        const nextSnapshot = await loadProofSnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      } catch (initialError) {
        if (!cancelled) {
          setError(initialError instanceof Error ? initialError.message : "Proof state refresh failed.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialSnapshot();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runControl(control: DemoControlProof) {
    setControlResult({
      key: control.key,
      status: "unknown",
      message: `${control.method} ${control.endpoint}`,
    });

    try {
      const response = await fetch(control.endpoint, {
        method: control.method,
        headers: { accept: "application/json" },
      });

      const message = response.ok
        ? `${control.label} completed.`
        : response.status === 404
          ? `${control.endpoint} is not installed yet.`
          : `${control.endpoint} returned HTTP ${response.status}.`;

      setControlResult({
        key: control.key,
        status: response.ok ? "ok" : response.status === 404 ? "unavailable" : "error",
        message,
      });
    } catch (controlError) {
      setControlResult({
        key: control.key,
        status: "error",
        message: controlError instanceof Error ? controlError.message : "Demo control failed.",
      });
    } finally {
      await refresh();
    }
  }

  const controls = snapshot?.demoControls ?? CHECKPOINT_DEMO_CONTROLS;

  if (isLoading && !snapshot) {
    return <ProofLoading />;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-0">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#dce2d5] px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase text-[#65715f]">Live System State</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#17231c]">Aurora-backed checkpoint proof</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={snapshot?.overallStatus ?? "error"} />
              <button
                className="rounded-md border border-[#b7c2af] px-3 py-2 text-sm font-semibold text-[#253328] transition hover:border-[#315b44] hover:text-[#315b44] disabled:cursor-wait disabled:opacity-60"
                disabled={isRefreshing}
                onClick={() => void refresh()}
                type="button"
              >
                {isRefreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </div>
          <EndpointGrid
            endpoints={[
              snapshot?.stateEndpoint,
              snapshot?.dbProofEndpoint,
            ].filter(Boolean) as EndpointEnvelope[]}
          />
        </Panel>

        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-[#65715f]">Integration Status</p>
              <h2 className="mt-1 text-xl font-semibold text-[#17231c]">AWS and Vercel signals</h2>
            </div>
            <p className="text-right text-xs text-[#65715f]">
              Checked {formatDateTime(snapshot?.checkedAt)}
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            {(snapshot?.integrations ?? []).map((integration) => (
              <IntegrationRow key={integration.key} integration={integration} />
            ))}
          </div>
        </Panel>
      </section>

      {error ? <Notice status="error" title="Proof state refresh failed" detail={error} /> : null}
      {controlResult ? (
        <Notice
          status={controlResult.status}
          title={controls.find((control) => control.key === controlResult.key)?.label ?? "Demo control"}
          detail={controlResult.message}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <ArchitecturePanel nodes={snapshot?.architecture ?? []} />
        <RowCountsPanel rows={snapshot?.rowCounts ?? []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ExtensionPanel extensions={snapshot?.extensions ?? []} />
        <DemoControlsPanel controls={controls} onRun={(control) => void runControl(control)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TimelinePanel events={snapshot?.auditEvents ?? []} />
        <JobRunsPanel jobRuns={snapshot?.jobRuns ?? []} />
      </section>
    </div>
  );
}

function ProofLoading() {
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

function EndpointGrid({ endpoints }: { endpoints: EndpointEnvelope[] }) {
  return (
    <div className="grid divide-y divide-[#edf1e8] md:grid-cols-2 md:divide-x md:divide-y-0">
      {endpoints.map((endpoint) => (
        <div key={endpoint.endpoint} className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-[#17231c]">{endpoint.endpoint}</span>
            <StatusPill status={endpoint.status} />
          </div>
          <p className="mt-2 text-sm text-[#65715f]">
            {endpoint.httpStatus ? `HTTP ${endpoint.httpStatus}` : "No HTTP response"}
            {endpoint.error ? ` - ${endpoint.error}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function ArchitecturePanel({ nodes }: { nodes: ArchitectureNode[] }) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Architecture Proof</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Live path from UI to database</h2>
      <div className="mt-5 grid gap-3">
        {nodes.map((node, index) => (
          <div key={node.label} className="grid grid-cols-[32px_1fr_auto] items-start gap-3">
            <div className="grid size-8 place-items-center rounded-md border border-[#dce2d5] bg-[#f6f8f2] text-sm font-semibold text-[#315b44]">
              {index + 1}
            </div>
            <div>
              <p className="font-semibold text-[#17231c]">{node.label}</p>
              <p className="mt-1 text-sm leading-6 text-[#65715f]">{node.detail}</p>
            </div>
            <StatusPill status={node.status} compact />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RowCountsPanel({ rows }: { rows: RowCountProof[] }) {
  const totals = useMemo(() => rows.filter((row) => row.count !== null), [rows]);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[#65715f]">Row Counts</p>
          <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Checkpoint 1 tables</h2>
        </div>
        <p className="text-sm font-semibold text-[#315b44]">{totals.length}/{rows.length} reported</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{row.label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#17231c]">
              {row.count === null ? "n/a" : row.count.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ExtensionPanel({ extensions }: { extensions: ExtensionProof[] }) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Database Extensions</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Aurora capability checks</h2>
      <div className="mt-4 divide-y divide-[#edf1e8]">
        {extensions.map((extension) => (
          <div key={extension.name} className="grid gap-2 py-3 sm:grid-cols-[100px_110px_1fr] sm:items-center">
            <span className="font-mono text-sm font-semibold text-[#17231c]">{extension.name}</span>
            <StatusPill status={extension.status} />
            <span className="text-sm text-[#65715f]">
              {extension.version ? `v${extension.version} - ` : ""}
              {extension.detail}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DemoControlsPanel({
  controls,
  onRun,
}: {
  controls: DemoControlProof[];
  onRun: (control: DemoControlProof) => void;
}) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Demo Controls</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Routes that mutate live demo state</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {controls.map((control) => (
          <button
            key={control.key}
            className="rounded-md border border-[#dce2d5] bg-white p-3 text-left transition hover:border-[#315b44] hover:bg-[#f8faf4] focus:outline-none focus:ring-2 focus:ring-[#6f8f76]"
            onClick={() => onRun(control)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-[#17231c]">{control.label}</span>
              <span className="rounded border border-[#dce2d5] px-1.5 py-0.5 font-mono text-[11px] text-[#65715f]">
                {control.method}
              </span>
            </div>
            <p className="mt-2 font-mono text-xs text-[#315b44]">{control.endpoint}</p>
            <p className="mt-2 text-xs leading-5 text-[#65715f]">{control.detail}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function TimelinePanel({ events }: { events: TimelineEventProof[] }) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Latest Audit Events</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Mutation trail</h2>
      {events.length ? (
        <div className="mt-4 divide-y divide-[#edf1e8]">
          {events.map((event) => (
            <EventRow key={event.id} item={event} />
          ))}
        </div>
      ) : (
        <EmptyState title="No audit events reported" detail="The live state endpoint has not returned audit rows yet." />
      )}
    </Panel>
  );
}

function JobRunsPanel({ jobRuns }: { jobRuns: JobRunProof[] }) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Latest Job Runs</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Cron and trigger evidence</h2>
      {jobRuns.length ? (
        <div className="mt-4 divide-y divide-[#edf1e8]">
          {jobRuns.map((job) => (
            <div key={job.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="font-semibold text-[#17231c]">{job.name}</p>
                <p className="mt-1 text-sm leading-6 text-[#65715f]">{job.detail}</p>
                <p className="mt-1 text-xs text-[#8a9384]">{formatDateTime(job.ranAt)}</p>
              </div>
              <StatusPill status={job.status} compact />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No job runs reported" detail="The live state endpoint has not returned job run rows yet." />
      )}
    </Panel>
  );
}

function EventRow({ item }: { item: TimelineEventProof }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
      <div>
        <p className="font-semibold text-[#17231c]">{item.title}</p>
        <p className="mt-1 text-sm leading-6 text-[#65715f]">{item.detail}</p>
        <p className="mt-1 text-xs text-[#8a9384]">{formatDateTime(item.occurredAt)}</p>
      </div>
      <StatusPill status={item.status} compact />
    </div>
  );
}

function IntegrationRow({ integration }: { integration: IntegrationProof }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-[#17231c]">{integration.label}</p>
        <StatusPill status={integration.status} compact />
      </div>
      <p className="mt-2 text-sm leading-6 text-[#65715f]">{integration.detail}</p>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-[#d2dbc9] bg-white shadow-sm ${className || "p-5"}`}>{children}</div>;
}

function Notice({ status, title, detail }: { status: ProofStatus; title: string; detail: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${statusClasses[status]}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm">{detail}</p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mt-4 rounded-md border border-dashed border-[#cfd8c6] bg-[#fbfcf7] px-4 py-5">
      <p className="font-semibold text-[#17231c]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function StatusPill({ status, compact = false }: { status: ProofStatus; compact?: boolean }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {compact ? statusLabels[status].slice(0, 7) : statusLabels[status]}
    </span>
  );
}

function formatDateTime(value: string | null | undefined) {
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
