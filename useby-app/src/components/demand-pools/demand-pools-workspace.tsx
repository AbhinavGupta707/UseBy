"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  cancelDemandPoolCommitment,
  demandPoolsEndpointSummary,
  formatDateTime,
  formatMoney,
  formatPoolStatus,
  loadDemandPoolDetail,
  loadDemandPoolSnapshot,
  poolProgress,
  submitDemandPoolCommitment,
  submitDemandPoolCreate,
} from "../../lib/demand-pools/api";
import type {
  DemandPool,
  DemandPoolCreateInput,
  DemandPoolDetailResult,
  DemandPoolEndpointState,
  DemandPoolMutationResult,
  DemandPoolOrder,
  DemandPoolSnapshot,
} from "../../lib/demand-pools/types";

const statusClasses = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

const activeStatuses = new Set(["gathering", "threshold_met", "bidding", "awarded", "ready_for_pickup"]);

const defaultCreateInput: DemandPoolCreateInput = {
  title: "",
  requestedItems: "",
  targetQuantity: "10",
  maxPrice: "12",
  pickupRadius: "1.5",
  pickupArea: "Riverside Quarter",
  closesAt: "",
};

export function DemandPoolsWorkspace() {
  const [snapshot, setSnapshot] = useState<DemandPoolSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<DemandPoolMutationResult | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<DemandPoolDetailResult | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [createInput, setCreateInput] = useState<DemandPoolCreateInput>(defaultCreateInput);
  const [isCreating, setIsCreating] = useState(false);

  async function refresh() {
    if (typeof window.fetch !== "function") {
      setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextSnapshot = await loadDemandPoolSnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
      setSelectedPoolId((current) => current ?? nextSnapshot.pools[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "DemandPool state refresh failed.");
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
        const nextSnapshot = await loadDemandPoolSnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setSelectedPoolId(nextSnapshot.pools[0]?.id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "DemandPool state refresh failed.");
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

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedPoolId || typeof window.fetch !== "function") {
        setDetailResult(null);
        return;
      }

      setIsDetailLoading(true);
      const result = await loadDemandPoolDetail(window.fetch.bind(window), selectedPoolId);
      if (!cancelled) {
        setDetailResult(result);
        setIsDetailLoading(false);
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedPoolId]);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setMutationResult(null);

    const result = await submitDemandPoolCreate(window.fetch.bind(window), createInput);
    setMutationResult(result);
    if (result.status === "ok") {
      setCreateInput(defaultCreateInput);
      await refresh();
      setSelectedPoolId(result.poolId);
    }

    setIsCreating(false);
  }

  async function handleActionResult(result: DemandPoolMutationResult) {
    setMutationResult(result);
    if (result.status === "ok") {
      await refresh();
      if (result.poolId) {
        setSelectedPoolId(result.poolId);
      }
    }
  }

  const selectedFromList = snapshot?.pools.find((pool) => pool.id === selectedPoolId) ?? null;
  const detailPool = detailResult?.pool ?? selectedFromList;
  const ordersForSelected = useMemo(() => {
    const poolId = detailPool?.id ?? selectedPoolId;
    return [
      ...(detailPool?.orders ?? []),
      ...(snapshot?.orders.filter((order) => order.poolId === poolId) ?? []),
    ];
  }, [detailPool, selectedPoolId, snapshot]);
  const counts = useMemo(() => {
    const pools = snapshot?.pools ?? [];
    return {
      active: pools.filter((pool) => activeStatuses.has(pool.status)).length,
      committed: pools.reduce((sum, pool) => sum + pool.committedQuantity, 0),
      pickups: snapshot?.orders.length ?? 0,
    };
  }, [snapshot]);

  return (
    <div className="useby-demand-pools-root space-y-5">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .useby-demand-pools-root *,
          .useby-demand-pools-root *::before,
          .useby-demand-pools-root *::after {
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
            <p className="text-xs font-semibold uppercase text-[#65715f]">DemandPool</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#17231c] sm:text-3xl">
              Neighbourhood group buys
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566250]">
              Create or join unpaid demo commitments for local bundles. UseBy does not capture deposits, cards, or payments in Checkpoint 6, and household location stays coarse.
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
          <Metric label="Route state" value={demandPoolsEndpointSummary(snapshot)} />
          <Metric label="Active pools" value={String(counts.active)} />
          <Metric label="Committed bundles" value={String(counts.committed)} />
          <Metric label="Pickup orders" value={String(counts.pickups)} />
        </div>
      </section>

      {loadError ? <Notice status="error" title="DemandPool refresh failed" detail={loadError} /> : null}
      {mutationResult ? (
        <Notice
          status={mutationResult.status}
          title={mutationResult.status === "ok" ? "Saved through live route" : "Live route did not complete"}
          detail={`${mutationResult.endpoint}${mutationResult.httpStatus ? ` returned HTTP ${mutationResult.httpStatus}` : ""}. ${mutationResult.message}`}
        />
      ) : null}

      {isLoading && !snapshot ? <LoadingGrid /> : null}

      {!isLoading && snapshot ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <PoolList
              onActionResult={handleActionResult}
              onSelect={setSelectedPoolId}
              pools={snapshot.pools}
              selectedPoolId={selectedPoolId}
            />
            <div className="grid content-start gap-5">
              <CreatePoolPanel
                createInput={createInput}
                isCreating={isCreating}
                onChange={setCreateInput}
                onSubmit={handleCreateSubmit}
              />
              <PoolDetailPanel
                detailEndpoint={detailResult?.endpoint ?? null}
                isDetailLoading={isDetailLoading}
                orders={ordersForSelected}
                pool={detailPool}
              />
            </div>
          </section>
          <EndpointPanel endpoints={snapshot.endpoints} />
        </>
      ) : null}
    </div>
  );
}

function PoolList({
  pools,
  selectedPoolId,
  onSelect,
  onActionResult,
}: {
  pools: DemandPool[];
  selectedPoolId: string | null;
  onSelect: (poolId: string) => void;
  onActionResult: (result: DemandPoolMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Active demand"
        title="Household pool queue"
        detail="Thresholds, household counts, bid and pickup states come from live DemandPool routes when installed."
      />
      {pools.length === 0 ? (
        <EmptyState
          title="No active pools returned"
          detail="Create a pool once the CP6 consumer routes are installed, or refresh after seeded input pools are available."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {pools.map((pool) => (
            <PoolCard
              isSelected={pool.id === selectedPoolId}
              key={pool.id}
              onActionResult={onActionResult}
              onSelect={onSelect}
              pool={pool}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function PoolCard({
  pool,
  isSelected,
  onSelect,
  onActionResult,
}: {
  pool: DemandPool;
  isSelected: boolean;
  onSelect: (poolId: string) => void;
  onActionResult: (result: DemandPoolMutationResult) => Promise<void>;
}) {
  const progress = poolProgress(pool);

  return (
    <article className={`grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px] ${isSelected ? "bg-[#fbfcf7]" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{formatPoolStatus(pool.status)}</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">{pool.title}</h2>
          </div>
          <button
            className="min-h-10 rounded-md border border-[#315b44] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44]"
            onClick={() => onSelect(pool.id)}
            type="button"
          >
            {isSelected ? "Selected" : "Details"}
          </button>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-[#17231c]">Threshold progress</span>
            <span className="font-mono text-[#566250]">
              {pool.committedQuantity}/{pool.thresholdQuantity} bundles - {progress}%
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#e4e9de]">
            <div className="h-full rounded-full bg-[#315b44]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Households" value={String(pool.householdCount)} />
          <Fact label="Max-price intent" value={formatMoney(pool.maxPriceCents)} />
          <Fact label="Pickup area" value={pickupAreaCopy(pool)} />
          <Fact label="Closes" value={formatDateTime(pool.closesAt)} />
        </div>

        {pool.currentUserCommitment ? (
          <Notice
            status="ok"
            title="Your unpaid demo commitment is recorded"
            detail={`${pool.currentUserCommitment.quantity} bundle${pool.currentUserCommitment.quantity === 1 ? "" : "s"} at ${formatMoney(pool.currentUserCommitment.maxPriceCents)} max-price intent. No deposit, card, or payment is captured.`}
          />
        ) : null}
      </div>

      <CommitmentPanel
        key={`${pool.id}-${pool.currentUserCommitment?.id ?? "none"}-${pool.currentUserCommitment?.quantity ?? 0}-${pool.currentUserCommitment?.maxPriceCents ?? 0}`}
        pool={pool}
        onActionResult={onActionResult}
      />
    </article>
  );
}

function CommitmentPanel({
  pool,
  onActionResult,
}: {
  pool: DemandPool;
  onActionResult: (result: DemandPoolMutationResult) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(pool.currentUserCommitment?.quantity ? String(pool.currentUserCommitment.quantity) : "1");
  const [maxPrice, setMaxPrice] = useState(pool.currentUserCommitment?.maxPriceCents ? String(pool.currentUserCommitment.maxPriceCents / 100) : "");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("commit");
    const result = await submitDemandPoolCommitment(window.fetch.bind(window), {
      poolId: pool.id,
      quantity,
      maxPrice,
    });
    await onActionResult(result);
    setPendingAction(null);
  }

  async function handleCancel() {
    setPendingAction("cancel");
    const result = await cancelDemandPoolCommitment(window.fetch.bind(window), pool.id);
    await onActionResult(result);
    setPendingAction(null);
  }

  return (
    <aside className="grid content-start gap-4 rounded-md border border-[#e3e8dc] bg-white p-4">
      <div>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Commitment</p>
        <h3 className="mt-1 text-base font-semibold text-[#17231c]">
          {pool.currentUserCommitment ? "Update your intent" : "Join this pool"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          This is unpaid demo intent only. UseBy will not ask for or capture card details here.
        </p>
      </div>

      <form className="grid gap-3" onSubmit={handleSubmit}>
        <TextInput label="Quantity" min="1" onChange={setQuantity} type="number" value={quantity} />
        <TextInput label="Max-price intent GBP" min="0.01" onChange={setMaxPrice} step="0.01" type="number" value={maxPrice} />
        <button
          className="min-h-11 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={pendingAction !== null}
          type="submit"
        >
          {pendingAction === "commit" ? "Saving" : pool.currentUserCommitment ? "Update intent" : "Commit intent"}
        </button>
      </form>

      {pool.currentUserCommitment ? (
        <button
          className="min-h-11 rounded-md border border-[#b7c2af] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:border-[#315b44] hover:bg-[#f6f8f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={pendingAction !== null}
          onClick={() => void handleCancel()}
          type="button"
        >
          {pendingAction === "cancel" ? "Cancelling" : "Cancel intent"}
        </button>
      ) : null}
    </aside>
  );
}

function CreatePoolPanel({
  createInput,
  isCreating,
  onChange,
  onSubmit,
}: {
  createInput: DemandPoolCreateInput;
  isCreating: boolean;
  onChange: (input: DemandPoolCreateInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel>
      <div>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Create</p>
        <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">Start a pool</h2>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          Requests are live route submissions. Missing CP6 routes stay unavailable instead of creating local fixtures.
        </p>
      </div>

      <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
        <TextInput
          label="Pool title"
          onChange={(value) => onChange({ ...createInput, title: value })}
          placeholder="Sunday roast bundle"
          value={createInput.title}
        />
        <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
          Requested items
          <textarea
            className="min-h-24 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
            onChange={(event) => onChange({ ...createInput, requestedItems: event.target.value })}
            placeholder="Potatoes, carrots, chicken, gravy"
            value={createInput.requestedItems}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Threshold" min="2" onChange={(value) => onChange({ ...createInput, targetQuantity: value })} type="number" value={createInput.targetQuantity} />
          <TextInput label="Max GBP" min="0.01" onChange={(value) => onChange({ ...createInput, maxPrice: value })} step="0.01" type="number" value={createInput.maxPrice} />
          <TextInput label="Pickup radius km" min="0.1" onChange={(value) => onChange({ ...createInput, pickupRadius: value })} step="0.1" type="number" value={createInput.pickupRadius} />
          <TextInput label="Pickup area" onChange={(value) => onChange({ ...createInput, pickupArea: value })} value={createInput.pickupArea} />
        </div>
        <TextInput label="Closes at" onChange={(value) => onChange({ ...createInput, closesAt: value })} type="datetime-local" value={createInput.closesAt} />
        <button
          className="min-h-11 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={isCreating}
          type="submit"
        >
          {isCreating ? "Creating" : "Create unpaid demo pool"}
        </button>
      </form>
    </Panel>
  );
}

function PoolDetailPanel({
  pool,
  orders,
  isDetailLoading,
  detailEndpoint,
}: {
  pool: DemandPool | null;
  orders: DemandPoolOrder[];
  isDetailLoading: boolean;
  detailEndpoint: DemandPoolEndpointState | null;
}) {
  if (!pool) {
    return (
      <Panel>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Detail</p>
        <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">Select a pool</h2>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          Details, bids, winner, and pickup readiness appear after a live pool is selected.
        </p>
      </Panel>
    );
  }

  const safeBids = pool.merchantBids.filter((bid) => bid.safeToShow);
  const winner = pool.winningBid ?? safeBids.find((bid) => bid.status === "winning" || bid.status === "awarded") ?? null;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#65715f]">Detail</p>
          <h2 className="mt-1 break-words text-xl font-semibold leading-tight text-[#17231c]">{pool.title}</h2>
        </div>
        {isDetailLoading ? <StatusPill status="partial" /> : detailEndpoint ? <StatusPill status={detailEndpoint.status} /> : null}
      </div>

      {detailEndpoint && detailEndpoint.status !== "available" ? (
        <div className="mt-4">
          <Notice status={detailEndpoint.status} title="Detail route unavailable" detail={detailEndpoint.message} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <Fact label="Requested items" value={pool.items.length > 0 ? pool.items.map(itemLabel).join(", ") : "No items returned"} />
        <Fact label="Pickup radius / area" value={pickupAreaCopy(pool)} />
        <Fact label="Pool closes" value={formatDateTime(pool.closesAt)} />
        <Fact label="Current state" value={formatPoolStatus(pool.status)} />
      </div>

      <section className="mt-5">
        <p className="text-sm font-semibold text-[#17231c]">Merchant bids safe to show</p>
        {safeBids.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-[#65715f]">
            No consumer-safe bids returned yet. Merchant bids appear here only after the API marks them safe for households.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {safeBids.map((bid) => (
              <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3" key={bid.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-[#17231c]">{bid.merchantName}</p>
                  <span className="rounded-md border border-[#d2dbc9] bg-white px-2 py-1 text-xs font-semibold text-[#566250]">
                    {formatPoolStatus(bid.status)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-[#65715f]">
                  <p>Price: <span className="font-semibold text-[#17231c]">{formatMoney(bid.priceCents)}</span></p>
                  <p>Capacity: <span className="font-semibold text-[#17231c]">{bid.availableQuantity ?? "Not returned"}</span></p>
                  <p>Pickup: <span className="font-semibold text-[#17231c]">{formatDateTime(bid.pickupWindowStart)} to {formatDateTime(bid.pickupWindowEnd)}</span></p>
                  {bid.substitutionPolicy ? <p>Substitutions: <span className="font-semibold text-[#17231c]">{bid.substitutionPolicy}</span></p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <p className="text-sm font-semibold text-[#17231c]">Award and pickup</p>
        {winner ? (
          <Notice
            status="ok"
            title={`Winning merchant: ${winner.merchantName}`}
            detail={`Awarded price ${formatMoney(winner.priceCents)}. Pickup window ${formatDateTime(winner.pickupWindowStart)} to ${formatDateTime(winner.pickupWindowEnd)}.`}
          />
        ) : (
          <p className="mt-2 text-sm leading-6 text-[#65715f]">
            No winning merchant returned yet. The award state should appear only after the live close-demand-pools job selects a current bid.
          </p>
        )}

        {orders.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {orders.map((order) => (
              <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3" key={order.id}>
                <p className="font-semibold text-[#17231c]">{formatPoolStatus(order.status)}</p>
                <p className="mt-1 text-sm leading-6 text-[#65715f]">
                  {order.merchantName ?? "Awarded merchant"} - {formatMoney(order.totalPriceCents)} - {order.pickupAreaLabel ?? "Coarse pickup area only"}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#65715f]">
                  Pickup: {formatDateTime(order.pickupWindowStart)} to {formatDateTime(order.pickupWindowEnd)}
                </p>
                {order.pickupHint ? (
                  <p className="mt-1 text-sm leading-6 text-[#65715f]">Hint: {order.pickupHint}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </Panel>
  );
}

function unavailableSnapshot(message: string): DemandPoolSnapshot {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    pools: [],
    orders: [],
    endpoints: [{ endpoint: "/api/demand-pools", status: "unavailable", httpStatus: null, message }],
    message,
  };
}

function EndpointPanel({ endpoints }: { endpoints: DemandPoolEndpointState[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="API readiness"
        title="DemandPool route checks"
        detail="Missing DemandPool features are diagnosed by route registration and activation state first."
      />
      <div className="divide-y divide-[#edf1e8]">
        {endpoints.map((endpoint) => (
          <div key={endpoint.endpoint} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center sm:px-5">
            <div className="min-w-0">
              <p className="break-words font-mono text-sm font-semibold text-[#17231c]">{endpoint.endpoint}</p>
              <p className="mt-1 text-sm leading-6 text-[#65715f]">
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

function LoadingGrid() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {[0, 1].map((index) => (
        <Panel key={index}>
          <div className="h-4 w-36 animate-pulse rounded bg-[#e4e9de]" />
          <div className="mt-5 space-y-3">
            <div className="h-12 animate-pulse rounded bg-[#eef2e8]" />
            <div className="h-12 animate-pulse rounded bg-[#eef2e8]" />
            <div className="h-12 animate-pulse rounded bg-[#eef2e8]" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-[#d2dbc9] bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

function PanelHeader({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="border-b border-[#edf1e8] px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-2 break-words font-mono text-xl font-semibold text-[#17231c]">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status === "available" || status === "ok"
    ? "Live"
    : status === "partial"
      ? "Partial"
      : status === "unavailable"
        ? "Unavailable"
        : status === "error"
          ? "Error"
          : "Checking";
  const statusClass = statusClasses[status as keyof typeof statusClasses] ?? statusClasses.unknown;

  return (
    <span className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
      {label}
    </span>
  );
}

function Notice({ status, title, detail }: { status: "ok" | "unavailable" | "error" | string; title: string; detail: string }) {
  const statusClass = statusClasses[status as keyof typeof statusClasses] ?? statusClasses.unknown;

  return (
    <div className={`mt-4 rounded-md border px-3 py-3 ${statusClass}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{detail}</p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-8 sm:px-5">
      <p className="font-semibold text-[#17231c]">{title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold text-[#17231c]">{value}</p>
    </div>
  );
}

function TextInput({
  label,
  min,
  onChange,
  placeholder,
  step,
  type = "text",
  value,
}: {
  label: string;
  min?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <input
        className="min-h-11 min-w-0 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
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

function pickupAreaCopy(pool: DemandPool): string {
  const radius = pool.pickupRadiusMeters === null
    ? "Radius not returned"
    : `${(pool.pickupRadiusMeters / 1000).toFixed(pool.pickupRadiusMeters % 1000 === 0 ? 0 : 1)} km`;
  return [pool.pickupAreaLabel, radius].filter(Boolean).join(" - ");
}

function itemLabel(item: DemandPool["items"][number]): string {
  return [item.quantity, item.unit, item.name].filter(Boolean).join(" ");
}
