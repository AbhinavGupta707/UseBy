"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  formatDateTime,
  formatLendingStatus,
  lendingEndpointSummary,
  loadLendingSnapshot,
  requestLending,
  submitLendingReview,
  transitionLending,
} from "../../lib/lending/api";
import type {
  LendingActionInput,
  LendingEndpointState,
  LendingListing,
  LendingMutationResult,
  LendingRequest,
  LendingRequestInput,
  LendingSnapshot,
} from "../../lib/lending/types";

type LendingFilter = "all" | "fashion" | "household";

const statusClasses = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

const filters: Array<{ key: LendingFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "fashion", label: "Wardrobe" },
  { key: "household", label: "Household" },
];

const defaultRequestInput: Omit<LendingRequestInput, "listingId"> = {
  borrowWindowStart: "",
  borrowWindowEnd: "",
  note: "",
};

export function LendingWorkspace() {
  const [snapshot, setSnapshot] = useState<LendingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<LendingMutationResult | null>(null);
  const [filter, setFilter] = useState<LendingFilter>("all");

  async function refresh() {
    if (typeof window.fetch !== "function") {
      setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextSnapshot = await loadLendingSnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Lending state refresh failed.");
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
        const nextSnapshot = await loadLendingSnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Lending state refresh failed.");
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

  const filteredListings = useMemo(() => {
    const listings = snapshot?.listings ?? [];
    if (filter === "all") {
      return listings;
    }

    return listings.filter((listing) => listing.category === filter);
  }, [filter, snapshot]);

  const counts = useMemo(
    () => ({
      listings: snapshot?.listings.length ?? 0,
      requests: snapshot?.requests.length ?? 0,
      fashion: snapshot?.listings.filter((listing) => listing.category === "fashion").length ?? 0,
      household: snapshot?.listings.filter((listing) => listing.category === "household").length ?? 0,
    }),
    [snapshot],
  );

  return (
    <div className="useby-lending-root space-y-5">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .useby-lending-root *,
          .useby-lending-root *::before,
          .useby-lending-root *::after {
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
            <p className="text-xs font-semibold uppercase text-[#65715f]">Neighbour lending</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#17231c] sm:text-3xl">
              Wardrobe rental and household lending
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566250]">
              Live Checkpoint 4 routes drive listings, requests, handoffs, returns, and reviews. Missing routes stay marked unavailable.
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
          <Metric label="Route state" value={lendingEndpointSummary(snapshot)} />
          <Metric label="Listings" value={String(counts.listings)} />
          <Metric label="Wardrobe" value={String(counts.fashion)} />
          <Metric label="Household" value={String(counts.household)} />
        </div>
      </section>

      {loadError ? <Notice status="error" title="Lending refresh failed" detail={loadError} /> : null}
      {mutationResult ? (
        <Notice
          status={mutationResult.status}
          title={mutationResult.status === "ok" ? "Saved through live route" : "Live route did not complete"}
          detail={`${mutationResult.endpoint}${mutationResult.httpStatus ? ` returned HTTP ${mutationResult.httpStatus}` : ""}. ${mutationResult.message}`}
        />
      ) : null}

      <Panel className="p-0">
        <PanelHeader
          label="Filters"
          title="Browse by lending category"
          detail="Only listed fashion and household items should appear. Food sharing remains in the grocery booking flow."
        />
        <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
          {filters.map((item) => (
            <button
              className={`min-h-10 rounded-md border px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] ${
                filter === item.key
                  ? "border-[#315b44] bg-[#315b44] text-white"
                  : "border-[#c4ceba] text-[#315b44] hover:border-[#315b44] hover:bg-[#f6f8f2]"
              }`}
              key={item.key}
              onClick={() => setFilter(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </Panel>

      {isLoading && !snapshot ? <LoadingGrid /> : null}

      {!isLoading && snapshot ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <ListingsPanel
              filter={filter}
              listings={filteredListings}
              onRequestResult={async (result) => {
                setMutationResult(result);
                if (result.status === "ok") {
                  await refresh();
                }
              }}
            />
            <LendingSafetyPanel requestsCount={counts.requests} />
          </section>

          <RequestsPanel
            requests={snapshot.requests}
            onActionResult={async (result) => {
              setMutationResult(result);
              if (result.status === "ok") {
                await refresh();
              }
            }}
          />
          <EndpointPanel endpoints={snapshot.endpoints} />
        </>
      ) : null}
    </div>
  );
}

function ListingsPanel({
  filter,
  listings,
  onRequestResult,
}: {
  filter: LendingFilter;
  listings: LendingListing[];
  onRequestResult: (result: LendingMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Listings"
        title={filter === "fashion" ? "Wardrobe listings" : filter === "household" ? "Household listings" : "Wardrobe and household listings"}
        detail="Cards show coarse owner area, condition, availability, and owner terms before a request is sent."
      />
      {listings.length === 0 ? (
        <EmptyState
          title="No lending listings returned"
          detail="Listed fashion and household items will appear here when /api/lending/listings is installed and returns live rows."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {listings.map((listing) => (
            <ListingCard listing={listing} key={listing.id} onRequestResult={onRequestResult} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ListingCard({
  listing,
  onRequestResult,
}: {
  listing: LendingListing;
  onRequestResult: (result: LendingMutationResult) => Promise<void>;
}) {
  const [input, setInput] = useState(defaultRequestInput);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await requestLending(window.fetch.bind(window), {
      listingId: listing.id,
      ...input,
    });
    await onRequestResult(result);
    if (result.status === "ok") {
      setInput(defaultRequestInput);
    }
    setIsSubmitting(false);
  }

  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{categoryLabel(listing.category)}</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">
              {safeText(listing.title)}
            </h2>
          </div>
          <span className="inline-flex min-h-8 items-center rounded-md border border-[#dbe4d2] bg-[#fbfcf7] px-2.5 py-1 text-xs font-semibold text-[#315b44]">
            {formatLendingStatus(listing.status)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Size" value={listing.size ?? "Not specified"} />
          <Fact label="Condition" value={listing.condition ?? "Owner did not specify"} />
          <Fact label="Availability" value={listing.availabilityLabel} />
          <Fact label="Owner area" value={partyLabel(listing.owner)} />
          <Fact label="Distance" value={listing.distanceLabel ?? "Approximate only"} />
          <Fact label="Pickup" value={listing.pickupHint ?? "Shared after acceptance when available"} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CopyBlock title="Terms" detail={listing.terms ?? "Owner terms will appear when returned by the live listing route."} />
          <CopyBlock title="Cleaning and return" detail={[listing.cleaningNotes, listing.returnExpectations].filter(Boolean).join(" ") || "Return condition and handling expectations should be confirmed before pickup."} />
        </div>

        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
          <p className="font-semibold">Deposit note only</p>
          <p className="mt-1">
            {listing.depositPreference
              ? `${safeText(listing.depositPreference)} This is an owner preference note only; UseBy does not capture payment or hold a deposit.`
              : "No deposit preference was returned. UseBy does not capture payment or hold a deposit for lending requests."}
          </p>
        </div>
      </div>

      <form className="grid content-start gap-3 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] p-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-xs font-semibold uppercase text-[#65715f]">Request window</p>
          <h3 className="mt-1 text-base font-semibold text-[#17231c]">Borrow or rent this item</h3>
          <p className="mt-2 text-sm leading-6 text-[#65715f]">
            The live API checks category, availability, blocked households, and overlapping reservations.
          </p>
        </div>
        <TextInput
          label="Starts"
          onChange={(value) => setInput((current) => ({ ...current, borrowWindowStart: value }))}
          type="datetime-local"
          value={input.borrowWindowStart}
        />
        <TextInput
          label="Ends"
          onChange={(value) => setInput((current) => ({ ...current, borrowWindowEnd: value }))}
          type="datetime-local"
          value={input.borrowWindowEnd}
        />
        <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
          Note to owner
          <textarea
            className="min-h-24 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
            onChange={(event) => setInput((current) => ({ ...current, note: event.target.value }))}
            placeholder="Reasonable timing and care note; no contact details"
            value={input.note}
          />
        </label>
        <button
          className="min-h-11 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting || !input.borrowWindowStart || !input.borrowWindowEnd}
          type="submit"
        >
          {isSubmitting ? "Requesting" : "Request item"}
        </button>
      </form>
    </article>
  );
}

function RequestsPanel({
  requests,
  onActionResult,
}: {
  requests: LendingRequest[];
  onActionResult: (result: LendingMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Handoffs"
        title="Owner and borrower controls"
        detail="Controls call CP4 lending routes for accept, decline, cancel, pickup scheduling, pickup, return, completion, and review."
      />
      {requests.length === 0 ? (
        <EmptyState
          title="No lending requests returned"
          detail="Requests created from live listings will appear here when /api/lending/requests is installed."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} onActionResult={onActionResult} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function RequestCard({
  request,
  onActionResult,
}: {
  request: LendingRequest;
  onActionResult: (result: LendingMutationResult) => Promise<void>;
}) {
  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{formatLendingStatus(request.status)}</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">
              {safeText(request.item.title)}
            </h2>
          </div>
          <span className="inline-flex min-h-8 items-center rounded-md border border-[#dbe4d2] bg-[#fbfcf7] px-2.5 py-1 text-xs font-semibold text-[#315b44]">
            {request.viewerRole === "unknown" ? "Shared controls" : `${formatLendingStatus(request.viewerRole)} view`}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Owner" value={partyLabel(request.owner)} />
          <Fact label="Borrower" value={partyLabel(request.borrower)} />
          <Fact label="Borrow starts" value={request.borrowWindowStart ? formatDateTime(request.borrowWindowStart) : "Not returned"} />
          <Fact label="Borrow ends" value={request.borrowWindowEnd ? formatDateTime(request.borrowWindowEnd) : "Not returned"} />
          <Fact label="Size" value={request.item.size ?? "Not specified"} />
          <Fact label="Condition" value={request.item.condition ?? "Not specified"} />
        </div>

        <div className="mt-4 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3 text-sm leading-6 text-[#566250]">
          <p className="font-semibold text-[#17231c]">Privacy and payment</p>
          <p className="mt-1">
            UseBy shows coarse household areas and pickup hints only. Exact coordinates and direct contact details are not shown here.
          </p>
          <p className="mt-2">
            {request.depositPreference
              ? `${safeText(request.depositPreference)} This is an owner note only; no payment is captured.`
              : "No payment or deposit is captured for this lending request."}
          </p>
        </div>

        {request.pickupHint || request.pickupWindowStart ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Fact label="Pickup window" value={windowLabel(request.pickupWindowStart, request.pickupWindowEnd)} />
            <Fact label="Pickup hint" value={request.pickupHint ?? "Coarse hint not returned"} />
          </div>
        ) : null}

        {request.review ? (
          <CopyBlock
            title={`Review${request.review.rating ? `: ${request.review.rating}/5` : ""}`}
            detail={request.review.note ?? "Review evidence returned by the live API."}
          />
        ) : null}
      </div>

      <RequestActionControls request={request} onActionResult={onActionResult} />
    </article>
  );
}

function RequestActionControls({
  request,
  onActionResult,
}: {
  request: LendingRequest;
  onActionResult: (result: LendingMutationResult) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pickupWindowStart, setPickupWindowStart] = useState("");
  const [pickupWindowEnd, setPickupWindowEnd] = useState("");
  const [pickupHint, setPickupHint] = useState("");
  const [rating, setRating] = useState("5");
  const [note, setNote] = useState("");
  const actions = request.availableActions;

  async function runAction(action: LendingActionInput["action"]) {
    setPendingAction(action);
    const result = await transitionLending(window.fetch.bind(window), {
      bookingId: request.id,
      action,
      pickupWindowStart,
      pickupWindowEnd,
      pickupHint,
    });
    await onActionResult(result);
    setPendingAction(null);
  }

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("review");
    const result = await submitLendingReview(window.fetch.bind(window), {
      bookingId: request.id,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      note,
    });
    await onActionResult(result);
    setPendingAction(null);
  }

  return (
    <aside className="grid content-start gap-4 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] p-4">
      <div>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Lifecycle</p>
        <h3 className="mt-1 text-base font-semibold text-[#17231c]">Request controls</h3>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          Buttons report live unavailable states until CP4 routes land.
        </p>
      </div>

      {actions.length === 0 ? (
        <Notice
          status="unavailable"
          title="No actions available"
          detail="This request has no client-side transition controls, or the API did not return available actions."
        />
      ) : null}

      {actions.includes("schedule-pickup") ? (
        <div className="grid gap-3">
          <TextInput label="Pickup starts" onChange={setPickupWindowStart} type="datetime-local" value={pickupWindowStart} />
          <TextInput label="Pickup ends" onChange={setPickupWindowEnd} type="datetime-local" value={pickupWindowEnd} />
          <TextInput
            label="Pickup hint"
            onChange={setPickupHint}
            placeholder="Riverside Hub desk, no flat number"
            value={pickupHint}
          />
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {actions.filter((action) => action !== "review").map((action) => (
          <button
            className="min-h-11 rounded-md border border-[#315b44] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
            disabled={pendingAction !== null || (action === "schedule-pickup" && (!pickupWindowStart || !pickupWindowEnd || !pickupHint.trim()))}
            key={action}
            onClick={() => void runAction(action as LendingActionInput["action"])}
            type="button"
          >
            {pendingAction === action ? "Saving" : formatLendingStatus(action)}
          </button>
        ))}
      </div>

      {actions.includes("review") ? (
        <form className="grid gap-3" onSubmit={handleReviewSubmit}>
          <TextInput label="Rating" onChange={setRating} type="number" value={rating} />
          <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
            Review note
            <textarea
              className="min-h-24 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Short return and care note"
              value={note}
            />
          </label>
          <button
            className="min-h-11 rounded-md bg-[#315b44] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
            disabled={pendingAction !== null}
            type="submit"
          >
            {pendingAction === "review" ? "Saving" : "Submit review"}
          </button>
        </form>
      ) : null}
    </aside>
  );
}

function LendingSafetyPanel({ requestsCount }: { requestsCount: number }) {
  return (
    <Panel>
      <p className="text-xs font-semibold uppercase text-[#65715f]">Terms and trust</p>
      <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">
        Lending without payment capture
      </h2>
      <div className="mt-4 grid gap-3">
        <CopyBlock
          title="Deposit preferences"
          detail="Deposit text is owner-provided context only. This checkpoint does not capture payment, hold funds, or write a payment ledger."
        />
        <CopyBlock
          title="Privacy"
          detail="Listings and requests use coarse areas and pickup hints. Do not enter phone numbers, emails, flat numbers, or exact coordinates."
        />
        <CopyBlock
          title="Live request count"
          detail={`${requestsCount} lending request${requestsCount === 1 ? "" : "s"} returned by the current API state.`}
        />
      </div>
    </Panel>
  );
}

function unavailableSnapshot(message: string): LendingSnapshot {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    listings: [],
    requests: [],
    endpoints: [
      { endpoint: "/api/lending/listings", status: "unavailable", httpStatus: null, message },
      { endpoint: "/api/lending/requests", status: "unavailable", httpStatus: null, message },
    ],
    message,
  };
}

function EndpointPanel({ endpoints }: { endpoints: LendingEndpointState[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="API readiness"
        title="Lending route checks"
        detail="Missing lending features are diagnosed by route registration and activation state first."
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
    <div className={`rounded-md border px-3 py-3 ${statusClass}`}>
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
      <p className="mt-1 break-words font-mono text-sm font-semibold text-[#17231c]">{safeText(value)}</p>
    </div>
  );
}

function CopyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3 text-sm leading-6 text-[#566250]">
      <p className="font-semibold text-[#17231c]">{title}</p>
      <p className="mt-1">{safeText(detail)}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <input
        className="min-h-11 min-w-0 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function categoryLabel(category: string): string {
  if (category === "fashion") {
    return "Wardrobe";
  }
  if (category === "household") {
    return "Household";
  }

  return formatLendingStatus(category);
}

function partyLabel(party: { label: string; coarseLocation: string | null; trustLabel: string | null }): string {
  return [party.label, party.coarseLocation, party.trustLabel].filter(Boolean).join(" - ");
}

function windowLabel(start: string | null, end: string | null): string {
  if (start && end) {
    return `${formatDateTime(start)} to ${formatDateTime(end)}`;
  }
  if (start) {
    return formatDateTime(start);
  }

  return "Not scheduled";
}

function safeText(value: string): string {
  return value
    .replace(/\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g, "[coordinates removed]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact removed]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (candidate) => {
      const digitCount = candidate.replace(/\D/g, "").length;
      return digitCount >= 9 ? "[contact removed]" : candidate;
    });
}
