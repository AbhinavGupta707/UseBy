"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  formatDateTime,
  formatMerchantStatus,
  loadMerchantSnapshot,
  merchantEndpointSummary,
  submitMerchantBid,
  transitionMerchantPickup,
} from "../../lib/merchant/api";
import type {
  MerchantBid,
  MerchantBidInput,
  MerchantDemandPool,
  MerchantEndpointState,
  MerchantMutationResult,
  MerchantPickup,
  MerchantSnapshot,
} from "../../lib/merchant/types";

const statusClasses = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

const emptyBidInput: MerchantBidInput = {
  poolId: "",
  priceCents: 0,
  availableQuantity: 1,
  minQuantity: 1,
  pickupWindowStart: "",
  pickupWindowEnd: "",
  terms: "",
  substitutionPolicy: "",
  fulfilmentNotes: "",
};

export function MerchantWorkspace() {
  const [snapshot, setSnapshot] = useState<MerchantSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<MerchantMutationResult | null>(null);

  async function refresh() {
    if (typeof window.fetch !== "function") {
      setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextSnapshot = await loadMerchantSnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Merchant state refresh failed.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      if (typeof window.fetch !== "function") {
        if (!cancelled) {
          setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextSnapshot = await loadMerchantSnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Merchant state refresh failed.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, []);

  const bidCounts = useMemo(() => {
    const bids = snapshot?.bids ?? [];
    return {
      submitted: bids.filter((bid) => bid.status === "submitted").length,
      winning: bids.filter((bid) => bid.status === "winning").length,
      rejected: bids.filter((bid) => bid.status === "rejected").length,
    };
  }, [snapshot]);

  return (
    <div className="useby-merchant-root space-y-5">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .useby-merchant-root *,
          .useby-merchant-root *::before,
          .useby-merchant-root *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <section className="rounded-lg border border-[#d2dbc9] bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e2e8dc] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">Merchant portal</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#17231c] sm:text-3xl">
              DemandPool bidding and pickup queue
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566250]">
              Live merchant routes drive active pools, bids, awards, and pickup transitions. Household details stay aggregated or coarse.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={snapshot?.status ?? (isLoading ? "partial" : "error")} />
            <button
              className="min-h-11 rounded-md border border-[#b7c2af] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:border-[#315b44] hover:bg-[#f6f8f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
              disabled={isRefreshing}
              onClick={() => void refresh()}
              type="button"
            >
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-[#edf1e8] md:grid-cols-4 md:divide-x md:divide-y-0">
          <Metric label="Route state" value={merchantEndpointSummary(snapshot)} />
          <Metric label="Active pools" value={String(snapshot?.summary.activePools ?? 0)} />
          <Metric label="Committed households" value={String(snapshot?.summary.committedHouseholds ?? 0)} />
          <Metric label="Awarded pickups" value={String(snapshot?.summary.awardedPickups ?? 0)} />
        </div>
      </section>

      {loadError ? <Notice status="error" title="Merchant refresh failed" detail={loadError} /> : null}
      {mutationResult ? (
        <Notice
          status={mutationResult.status}
          title={mutationResult.status === "ok" ? "Saved through live route" : "Live route did not complete"}
          detail={`${mutationResult.endpoint}${mutationResult.httpStatus ? ` returned HTTP ${mutationResult.httpStatus}` : ""}. ${mutationResult.message}`}
        />
      ) : null}

      <Notice
        status="unavailable"
        title="Payment deferred"
        detail="Checkpoint 6 records unpaid demo commitments only. This portal does not represent payment collection or reserved funds."
      />

      {isLoading && !snapshot ? <LoadingGrid /> : null}

      {!isLoading && snapshot ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <ActivePoolsPanel
              pools={snapshot.pools}
              onBidResult={async (result) => {
                setMutationResult(result);
                if (result.status === "ok") {
                  await refresh();
                }
              }}
            />
            <DemandSummaryPanel
              committedQuantity={snapshot.summary.committedQuantity}
              submittedBids={bidCounts.submitted}
              winningBids={bidCounts.winning}
              rejectedBids={bidCounts.rejected}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <BidsPanel bids={snapshot.bids} />
            <PickupsPanel
              pickups={snapshot.pickups}
              onActionResult={async (result) => {
                setMutationResult(result);
                if (result.status === "ok") {
                  await refresh();
                }
              }}
            />
          </section>

          <EndpointPanel endpoints={snapshot.endpoints} />
        </>
      ) : null}
    </div>
  );
}

function ActivePoolsPanel({
  pools,
  onBidResult,
}: {
  pools: MerchantDemandPool[];
  onBidResult: (result: MerchantMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Active pools"
        title="Neighbourhood demand open for bids"
        detail="Pools show aggregate quantity, household count, coarse area, and pickup timing without raw household locations or contact details."
      />
      {pools.length === 0 ? (
        <EmptyState
          title="No merchant pools returned"
          detail="Active pools will appear when /api/merchant/demand-pools is installed and returns live rows."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} onBidResult={onBidResult} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function PoolCard({
  pool,
  onBidResult,
}: {
  pool: MerchantDemandPool;
  onBidResult: (result: MerchantMutationResult) => Promise<void>;
}) {
  const [input, setInput] = useState<MerchantBidInput>({
    ...emptyBidInput,
    poolId: pool.id,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await submitMerchantBid(window.fetch.bind(window), input);
    await onBidResult(result);
    if (result.status === "ok") {
      setInput({ ...emptyBidInput, poolId: pool.id });
    }
    setIsSubmitting(false);
  }

  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{formatMerchantStatus(pool.status)}</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">
              {safeText(pool.title)}
            </h2>
          </div>
          <span className="inline-flex min-h-8 items-center rounded-md border border-[#dbe4d2] bg-[#fbfcf7] px-2.5 py-1 text-xs font-semibold text-[#315b44]">
            {pool.bidStatus ? formatMerchantStatus(pool.bidStatus) : "No bid yet"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Demand" value={pool.demandSummary} />
          <Fact label="Coarse area" value={pool.coarseArea ?? "Neighbourhood aggregate"} />
          <Fact label="Closes" value={formatDateTime(pool.closesAt)} />
          <Fact label="Max intent" value={pool.maxPriceLabel ?? "Not returned"} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CopyBlock
            title="Requested items"
            detail={pool.requestedItems.length ? pool.requestedItems.join(", ") : pool.description ?? "Item detail will appear when returned by the live route."}
          />
          <CopyBlock
            title="Privacy"
            detail="Merchant demand is aggregated. The portal should not show exact household coordinates, unit numbers, phone numbers, or direct email addresses."
          />
        </div>
      </div>

      <form className="grid content-start gap-3 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] p-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-xs font-semibold uppercase text-[#65715f]">Submit bid</p>
          <h3 className="mt-1 text-base font-semibold text-[#17231c]">Offer fulfilment terms</h3>
        </div>
        <TextInput
          label="Price per household"
          min="0"
          onChange={(value) => setInput((current) => ({ ...current, priceCents: Math.round((Number(value) || 0) * 100) }))}
          step="0.01"
          type="number"
          value={input.priceCents ? String(input.priceCents / 100) : ""}
        />
        <TextInput
          label="Available quantity"
          min="1"
          onChange={(value) => setInput((current) => ({ ...current, availableQuantity: Number(value) || 1 }))}
          type="number"
          value={String(input.availableQuantity)}
        />
        <TextInput
          label="Minimum quantity"
          min="1"
          onChange={(value) => setInput((current) => ({ ...current, minQuantity: Number(value) || 1 }))}
          type="number"
          value={String(input.minQuantity)}
        />
        <TextInput
          label="Pickup starts"
          onChange={(value) => setInput((current) => ({ ...current, pickupWindowStart: value }))}
          type="datetime-local"
          value={input.pickupWindowStart}
        />
        <TextInput
          label="Pickup ends"
          onChange={(value) => setInput((current) => ({ ...current, pickupWindowEnd: value }))}
          type="datetime-local"
          value={input.pickupWindowEnd}
        />
        <TextArea
          label="Substitutions"
          onChange={(value) => setInput((current) => ({ ...current, substitutionPolicy: value }))}
          placeholder="Like-for-like seasonal substitutions."
          value={input.substitutionPolicy}
        />
        <TextArea
          label="Fulfilment terms"
          onChange={(value) => setInput((current) => ({ ...current, terms: value, fulfilmentNotes: value }))}
          placeholder="Merchant-packed bundle, pickup at service counter."
          value={input.terms}
        />
        <button
          className="min-h-11 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Submitting" : "Submit bid"}
        </button>
      </form>
    </article>
  );
}

function DemandSummaryPanel({
  committedQuantity,
  submittedBids,
  winningBids,
  rejectedBids,
}: {
  committedQuantity: number;
  submittedBids: number;
  winningBids: number;
  rejectedBids: number;
}) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Aggregate demand</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">Merchant-safe operating view</h2>
      <div className="mt-5 grid gap-3">
        <SummaryRow label="Committed quantity" value={String(committedQuantity)} />
        <SummaryRow label="Submitted bids" value={String(submittedBids)} />
        <SummaryRow label="Winning bids" value={String(winningBids)} />
        <SummaryRow label="Rejected bids" value={String(rejectedBids)} />
      </div>
      <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
        <p className="font-semibold">No payment state</p>
        <p className="mt-1">
          Commitments are unpaid demo intent until payment infrastructure is reintroduced. Awarding and pickup status must come from current database rows.
        </p>
      </div>
    </Panel>
  );
}

function BidsPanel({ bids }: { bids: MerchantBid[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Bid status"
        title="Submitted, winning, and rejected bids"
        detail="Bid outcomes should be computed by the live award job once Lane 6B runtime is installed."
      />
      {bids.length === 0 ? (
        <EmptyState title="No bids returned" detail="Submitted merchant bids will appear here when /api/merchant/bids returns live rows." />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {bids.map((bid) => (
            <div key={bid.id} className="grid gap-3 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#65715f]">{formatMerchantStatus(bid.status)}</p>
                  <h3 className="mt-1 font-semibold text-[#17231c]">{safeText(bid.poolTitle)}</h3>
                </div>
                <span className="rounded-md border border-[#dbe4d2] bg-[#fbfcf7] px-2.5 py-1 text-sm font-semibold text-[#315b44]">
                  {bid.priceLabel}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Fact label="Available" value={bid.availableQuantity === null ? "Not returned" : String(bid.availableQuantity)} />
                <Fact label="Minimum" value={bid.minQuantity === null ? "Not returned" : String(bid.minQuantity)} />
                <Fact label="Pickup starts" value={formatDateTime(bid.pickupWindowStart)} />
                <Fact label="Pickup ends" value={formatDateTime(bid.pickupWindowEnd)} />
              </div>
              <CopyBlock title="Terms" detail={bid.terms ?? "Terms not returned by route."} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function PickupsPanel({
  pickups,
  onActionResult,
}: {
  pickups: MerchantPickup[];
  onActionResult: (result: MerchantMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Awarded pickups"
        title="Ready and collected controls"
        detail="Pickup rows should be created only after award. Household identity remains coarse and demo-safe."
      />
      {pickups.length === 0 ? (
        <EmptyState
          title="No pickups returned"
          detail="Awarded pool orders and pickup tasks will appear here when /api/merchant/pickups returns live rows."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {pickups.map((pickup) => (
            <PickupRow key={pickup.id} pickup={pickup} onActionResult={onActionResult} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function PickupRow({
  pickup,
  onActionResult,
}: {
  pickup: MerchantPickup;
  onActionResult: (result: MerchantMutationResult) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runAction(action: "ready" | "collected") {
    setPendingAction(action);
    const result = await transitionMerchantPickup(window.fetch.bind(window), {
      orderId: pickup.orderId,
      action,
    });
    await onActionResult(result);
    setPendingAction(null);
  }

  return (
    <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-[#65715f]">{formatMerchantStatus(pickup.status)}</p>
        <h3 className="mt-1 break-words font-semibold text-[#17231c]">{safeText(pickup.poolTitle)}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="Household" value={pickup.householdLabel} />
          <Fact label="Area" value={pickup.coarseArea ?? "Coarse area only"} />
          <Fact label="Quantity" value={pickup.quantity === null ? "Not returned" : `${pickup.quantity} ${pickup.unit}`} />
          <Fact label="Pickup window" value={`${formatDateTime(pickup.pickupWindowStart)} to ${formatDateTime(pickup.pickupWindowEnd)}`} />
        </div>
      </div>
      <div className="grid content-start gap-2 sm:grid-cols-2 lg:min-w-40 lg:grid-cols-1">
        <button
          className="min-h-10 rounded-md border border-[#315b44] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!pickup.availableActions.includes("ready") || pendingAction !== null}
          onClick={() => void runAction("ready")}
          type="button"
        >
          {pendingAction === "ready" ? "Saving" : "Ready"}
        </button>
        <button
          className="min-h-10 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!pickup.availableActions.includes("collected") || pendingAction !== null}
          onClick={() => void runAction("collected")}
          type="button"
        >
          {pendingAction === "collected" ? "Saving" : "Collected"}
        </button>
      </div>
    </div>
  );
}

function EndpointPanel({ endpoints }: { endpoints: MerchantEndpointState[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Route contracts"
        title="Merchant API availability"
        detail="The portal reports Lane 6B routes as unavailable until they are registered and return JSON."
      />
      <div className="divide-y divide-[#edf1e8]">
        {endpoints.map((endpoint) => (
          <div key={endpoint.endpoint} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
            <div className="min-w-0">
              <p className="break-all font-mono text-sm text-[#17231c]">{endpoint.endpoint}</p>
              <p className="mt-1 text-xs leading-5 text-[#65715f]">
                {endpoint.httpStatus ? `HTTP ${endpoint.httpStatus}` : "No HTTP response"} - {endpoint.message}
              </p>
            </div>
            <StatusPill status={endpoint.status} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function unavailableSnapshot(message: string): MerchantSnapshot {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    pools: [],
    bids: [],
    pickups: [],
    summary: {
      activePools: 0,
      committedHouseholds: 0,
      committedQuantity: 0,
      submittedBids: 0,
      awardedPickups: 0,
    },
    endpoints: [
      {
        endpoint: "/api/merchant/demand-pools",
        status: "unavailable",
        httpStatus: null,
        message,
      },
    ],
    message,
  };
}

function PanelHeader({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="border-b border-[#e2e8dc] px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <h2 className="mt-1 text-xl font-semibold text-[#17231c]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-[#17231c]">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3">
      <span className="text-sm font-semibold text-[#65715f]">{label}</span>
      <span className="font-mono text-lg font-semibold text-[#17231c]">{value}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#17231c]">{safeText(value)}</p>
    </div>
  );
}

function CopyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3">
      <p className="text-sm font-semibold text-[#17231c]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#65715f]">{safeText(detail)}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  value,
  type = "text",
  placeholder,
  min,
  step,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  type?: string;
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <input
        className="min-h-11 rounded-md border border-[#cfd8c6] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition focus:border-[#315b44] focus:ring-2 focus:ring-[#d7e3d8]"
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextArea({
  label,
  onChange,
  value,
  placeholder,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <textarea
        className="min-h-20 rounded-md border border-[#cfd8c6] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition focus:border-[#315b44] focus:ring-2 focus:ring-[#d7e3d8]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-[#d2dbc9] bg-white shadow-sm ${className || "p-5"}`}>{children}</div>;
}

function Notice({
  status,
  title,
  detail,
}: {
  status: keyof typeof statusClasses;
  title: string;
  detail: string;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${statusClasses[status]}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{detail}</p>
    </div>
  );
}

function StatusPill({ status }: { status: keyof typeof statusClasses }) {
  const labels: Record<keyof typeof statusClasses, string> = {
    available: "Live",
    partial: "Partial",
    unavailable: "Unavailable",
    error: "Error",
    ok: "Live",
    unknown: "Unknown",
  };

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {labels[status]}
    </span>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 rounded-md border border-dashed border-[#cfd8c6] bg-[#fbfcf7] px-4 py-5 sm:m-5">
      <p className="font-semibold text-[#17231c]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function LoadingGrid() {
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

function safeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
