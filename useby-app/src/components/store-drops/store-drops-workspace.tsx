"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  canReserveDrop,
  cancelStoreDropReservation,
  formatDropPrice,
  formatDropStatus,
  isDropExpired,
  isDropSoldOut,
  loadStoreDropDetail,
  loadStoreDropSnapshot,
  pickupWindowLabel,
  storeDropsEndpointSummary,
  submitStoreDropReservation,
} from "../../lib/store-drops/api";
import type {
  StoreDrop,
  StoreDropDetailResult,
  StoreDropEndpointState,
  StoreDropMutationResult,
  StoreDropSnapshot,
} from "../../lib/store-drops/types";

const statusClasses = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StoreDropsWorkspace() {
  const [snapshot, setSnapshot] = useState<StoreDropSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<StoreDropMutationResult | null>(null);
  const [selectedDropId, setSelectedDropId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<StoreDropDetailResult | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  async function refresh(preferredDropId?: string | null) {
    if (typeof window.fetch !== "function") {
      setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextSnapshot = await loadStoreDropSnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
      setSelectedDropId((current) => preferredDropId ?? current ?? nextSnapshot.drops[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Surplus drop state refresh failed.");
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
        const nextSnapshot = await loadStoreDropSnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setSelectedDropId(nextSnapshot.drops[0]?.id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Surplus drop state refresh failed.");
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
      if (!selectedDropId || typeof window.fetch !== "function") {
        setDetailResult(null);
        return;
      }

      setIsDetailLoading(true);
      const result = await loadStoreDropDetail(window.fetch.bind(window), selectedDropId);
      if (!cancelled) {
        setDetailResult(result);
        setIsDetailLoading(false);
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedDropId]);

  async function handleActionResult(result: StoreDropMutationResult) {
    setMutationResult(result);
    if (result.status === "ok") {
      await refresh(result.dropId);
    }
  }

  const selectedFromList = snapshot?.drops.find((drop) => drop.id === selectedDropId) ?? null;
  const detailDrop = detailResult?.drop ?? selectedFromList;
  const counts = useMemo(() => {
    const drops = snapshot?.drops ?? [];
    return {
      reservable: drops.filter((drop) => canReserveDrop(drop)).length,
      reserved: drops.filter((drop) => drop.currentReservation).length,
      soldOut: drops.filter(isDropSoldOut).length,
    };
  }, [snapshot]);

  return (
    <div className="useby-store-drops-root space-y-5">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .useby-store-drops-root *,
          .useby-store-drops-root *::before,
          .useby-store-drops-root *::after {
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
            <p className="text-xs font-semibold uppercase text-[#65715f]">Surplus drops</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#17231c] sm:text-3xl">
              Reserve nearby surplus pickups
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566250]">
              Browse live merchant surplus, reserve household quantities, and cancel active reservations. These are unpaid demo reservations only; UseBy does not capture cards, deposits, or charges.
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
          <Metric label="Route state" value={storeDropsEndpointSummary(snapshot)} />
          <Metric label="Reservable now" value={String(counts.reservable)} />
          <Metric label="Your reservations" value={String(counts.reserved)} />
          <Metric label="Sold out" value={String(counts.soldOut)} />
        </div>
      </section>

      {loadError ? <Notice status="error" title="Surplus refresh failed" detail={loadError} /> : null}
      {mutationResult ? (
        <Notice
          status={mutationResult.status}
          title={mutationResult.status === "ok" ? "Saved through live route" : "Live route did not complete"}
          detail={`${mutationResult.endpoint}${mutationResult.httpStatus ? ` returned HTTP ${mutationResult.httpStatus}` : ""}. ${mutationResult.message}`}
        />
      ) : null}

      <Notice
        status="unavailable"
        title="Payment-free demo intent"
        detail="A surplus reservation records pickup intent only. This UI has no card, deposit, authorization, ledger, or paid commitment controls."
      />

      {isLoading && !snapshot ? <LoadingGrid /> : null}

      {!isLoading && snapshot ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <DropList
              drops={snapshot.drops}
              onActionResult={handleActionResult}
              onSelect={setSelectedDropId}
              selectedDropId={selectedDropId}
            />
            <DropDetailPanel
              detailEndpoint={detailResult?.endpoint ?? null}
              drop={detailDrop}
              isDetailLoading={isDetailLoading}
            />
          </section>
          <EndpointPanel endpoints={snapshot.endpoints} />
        </>
      ) : null}
    </div>
  );
}

function DropList({
  drops,
  selectedDropId,
  onSelect,
  onActionResult,
}: {
  drops: StoreDrop[];
  selectedDropId: string | null;
  onSelect: (dropId: string) => void;
  onActionResult: (result: StoreDropMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Available surplus"
        title="Live merchant drops"
        detail="Quantities, sold-out states, reservations, and pickup windows come from CP7 routes when installed."
      />
      {drops.length === 0 ? (
        <EmptyState
          title="No surplus drops returned"
          detail="Published merchant drops will appear after CP7 routes and schema are installed. Until then, UseBy shows this empty state rather than a cached demo list."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {drops.map((drop) => (
            <DropCard
              drop={drop}
              isSelected={drop.id === selectedDropId}
              key={drop.id}
              onActionResult={onActionResult}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function DropCard({
  drop,
  isSelected,
  onSelect,
  onActionResult,
}: {
  drop: StoreDrop;
  isSelected: boolean;
  onSelect: (dropId: string) => void;
  onActionResult: (result: StoreDropMutationResult) => Promise<void>;
}) {
  return (
    <article className={`grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_300px] ${isSelected ? "bg-[#fbfcf7]" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{dropAvailabilityLabel(drop)}</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">{drop.title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#65715f]">{drop.merchantDisplayName}</p>
          </div>
          <button
            className="min-h-10 rounded-md border border-[#315b44] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44]"
            onClick={() => onSelect(drop.id)}
            type="button"
          >
            {isSelected ? "Selected" : "Details"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Remaining" value={remainingCopy(drop)} />
          <Fact label="Pickup area" value={drop.coarsePickupArea ?? "Coarse area not returned"} />
          <Fact label="Pickup window" value={pickupWindowLabel(drop)} />
          <Fact label="Price" value={formatDropPrice(drop)} />
        </div>

        {drop.currentReservation ? (
          <Notice
            status="ok"
            title="Your household has an active reservation"
            detail={`${drop.currentReservation.quantity} item${drop.currentReservation.quantity === 1 ? "" : "s"} reserved as unpaid demo intent. No deposit, card, or charge is captured.`}
          />
        ) : null}
      </div>

      <ReservationPanel
        key={`${drop.id}-${drop.currentReservation?.id ?? "none"}-${drop.remainingQuantity ?? "unknown"}-${drop.status}`}
        drop={drop}
        onActionResult={onActionResult}
      />
    </article>
  );
}

function ReservationPanel({
  drop,
  onActionResult,
}: {
  drop: StoreDrop;
  onActionResult: (result: StoreDropMutationResult) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(drop.currentReservation?.quantity ? String(drop.currentReservation.quantity) : "1");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const canReserve = canReserveDrop(drop);
  const unavailableReason = reservationUnavailableReason(drop);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationMessage(null);

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      setValidationMessage("Choose at least one item before reserving.");
      return;
    }

    if (drop.remainingQuantity !== null && parsedQuantity > drop.remainingQuantity) {
      setValidationMessage(`Only ${drop.remainingQuantity} item${drop.remainingQuantity === 1 ? "" : "s"} remain for this drop.`);
      return;
    }

    setPendingAction("reserve");
    const result = await submitStoreDropReservation(window.fetch.bind(window), {
      dropId: drop.id,
      quantity,
    });
    await onActionResult(result);
    setPendingAction(null);
  }

  async function handleCancel() {
    setPendingAction("cancel");
    const result = await cancelStoreDropReservation(window.fetch.bind(window), drop.id);
    await onActionResult(result);
    setPendingAction(null);
  }

  return (
    <aside className="grid content-start gap-4 rounded-md border border-[#e3e8dc] bg-white p-4">
      <div>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Reservation</p>
        <h3 className="mt-1 text-base font-semibold text-[#17231c]">
          {drop.currentReservation ? "Manage your pickup intent" : "Reserve from this drop"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          Pickup intent only. UseBy will not ask for card details, deposits, or payment authorization.
        </p>
      </div>

      {drop.currentReservation ? (
        <button
          className="min-h-11 rounded-md border border-[#b7c2af] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:border-[#315b44] hover:bg-[#f6f8f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={pendingAction !== null}
          onClick={() => void handleCancel()}
          type="button"
        >
          {pendingAction === "cancel" ? "Cancelling" : "Cancel reservation"}
        </button>
      ) : canReserve ? (
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <TextInput label="Quantity" min="1" onChange={setQuantity} type="number" value={quantity} />
          {validationMessage ? <p className="text-sm font-semibold text-rose-700">{validationMessage}</p> : null}
          <button
            className="min-h-11 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
            disabled={pendingAction !== null}
            type="submit"
          >
            {pendingAction === "reserve" ? "Reserving" : "Reserve unpaid intent"}
          </button>
        </form>
      ) : (
        <Notice status="unavailable" title="Reservation unavailable" detail={unavailableReason} />
      )}
    </aside>
  );
}

function DropDetailPanel({
  drop,
  isDetailLoading,
  detailEndpoint,
}: {
  drop: StoreDrop | null;
  isDetailLoading: boolean;
  detailEndpoint: StoreDropEndpointState | null;
}) {
  if (!drop) {
    return (
      <Panel>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Detail</p>
        <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">Select a drop</h2>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          Merchant, coarse pickup area, reservation status, safety notes, and pickup timing appear after a live drop is selected.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#65715f]">Detail</p>
          <h2 className="mt-1 break-words text-xl font-semibold leading-tight text-[#17231c]">{drop.title}</h2>
        </div>
        {isDetailLoading ? <StatusPill status="partial" /> : detailEndpoint ? <StatusPill status={detailEndpoint.status} /> : null}
      </div>

      {detailEndpoint && detailEndpoint.status !== "available" ? (
        <Notice status={detailEndpoint.status} title="Detail route unavailable" detail={detailEndpoint.message} />
      ) : null}

      <div className="mt-4 grid gap-3">
        <Fact label="Merchant" value={drop.merchantDisplayName} />
        <Fact label="Pickup area" value={drop.coarsePickupArea ?? "Coarse area not returned"} />
        <Fact label="Pickup window" value={pickupWindowLabel(drop)} />
        <Fact label="Reservation status" value={reservationStatusCopy(drop)} />
        <Fact label="Remaining" value={remainingCopy(drop)} />
        <Fact label="Price display" value={formatDropPrice(drop)} />
      </div>

      {drop.description ? (
        <section className="mt-5">
          <p className="text-sm font-semibold text-[#17231c]">Drop notes</p>
          <p className="mt-2 text-sm leading-6 text-[#65715f]">{drop.description}</p>
        </section>
      ) : null}

      <section className="mt-5">
        <p className="text-sm font-semibold text-[#17231c]">Safety notes</p>
        <ul className="mt-2 grid gap-2 text-sm leading-6 text-[#65715f]">
          {drop.safetyNotes.map((note) => (
            <li className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-2" key={note}>
              {note}
            </li>
          ))}
        </ul>
      </section>

      <Notice
        status="unavailable"
        title="Privacy boundary"
        detail="UseBy shows coarse pickup areas only here. Exact household coordinates, direct contact fields, and raw need locations are not displayed."
      />
    </Panel>
  );
}

function unavailableSnapshot(message: string): StoreDropSnapshot {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    drops: [],
    reservations: [],
    endpoints: [{ endpoint: "/api/store-drops", status: "unavailable", httpStatus: null, message }],
    message,
  };
}

function EndpointPanel({ endpoints }: { endpoints: StoreDropEndpointState[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="API readiness"
        title="Surplus drop route checks"
        detail="Missing surplus features are diagnosed by route registration and activation state before runtime assumptions."
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
  type = "text",
  value,
}: {
  label: string;
  min?: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <input
        className="min-h-11 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function remainingCopy(drop: StoreDrop): string {
  if (drop.remainingQuantity === null) {
    return "Live remaining count not returned";
  }

  return `${drop.remainingQuantity} item${drop.remainingQuantity === 1 ? "" : "s"} remaining`;
}

function dropAvailabilityLabel(drop: StoreDrop): string {
  if (isDropSoldOut(drop)) {
    return "Sold out";
  }

  if (isDropExpired(drop)) {
    return "Expired";
  }

  return formatDropStatus(drop.status);
}

function reservationStatusCopy(drop: StoreDrop): string {
  if (!drop.currentReservation) {
    return "No active household reservation";
  }

  return `${formatDropStatus(drop.currentReservation.status)} - ${drop.currentReservation.quantity} item${drop.currentReservation.quantity === 1 ? "" : "s"}`;
}

function reservationUnavailableReason(drop: StoreDrop): string {
  if (drop.currentReservation) {
    return "Your household already has an active reservation for this drop.";
  }

  if (isDropSoldOut(drop)) {
    return "This drop is sold out from live reservation rows.";
  }

  if (isDropExpired(drop)) {
    return `This pickup window has ended or the drop is ${formatDropStatus(drop.status).toLowerCase()}.`;
  }

  return `This drop is ${formatDropStatus(drop.status).toLowerCase()} and cannot accept new reservations.`;
}
