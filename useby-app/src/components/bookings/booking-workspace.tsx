"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  bookingsEndpointSummary,
  formatStatus,
  loadBookingDetail,
  loadBookingsSnapshot,
  submitBookingReview,
  transitionBooking,
} from "../../lib/bookings/api";
import type {
  Booking,
  BookingActionInput,
  BookingEndpointState,
  BookingMutationResult,
  BookingSnapshot,
} from "../../lib/bookings/types";
import { BookingTimeline } from "./booking-timeline";

type BookingWorkspaceMode = "list" | "detail";

const statusClasses = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

const terminalStatuses = new Set(["reviewed", "declined", "cancelled", "disputed"]);

export function BookingWorkspace({
  bookingId,
  mode = "list",
}: {
  bookingId?: string;
  mode?: BookingWorkspaceMode;
}) {
  const [snapshot, setSnapshot] = useState<BookingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<BookingMutationResult | null>(null);

  async function refresh() {
    if (typeof window.fetch !== "function") {
      setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment.", bookingId));
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextSnapshot = bookingId
        ? await loadBookingDetail(window.fetch.bind(window), bookingId)
        : await loadBookingsSnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Booking state refresh failed.");
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
          setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment.", bookingId));
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextSnapshot = bookingId
          ? await loadBookingDetail(window.fetch.bind(window), bookingId)
          : await loadBookingsSnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Booking state refresh failed.");
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
  }, [bookingId]);

  const counts = useMemo(() => {
    const bookings = snapshot?.bookings ?? [];
    return {
      total: bookings.length,
      active: bookings.filter((booking) => !terminalStatuses.has(booking.status)).length,
      terminal: bookings.filter((booking) => terminalStatuses.has(booking.status)).length,
    };
  }, [snapshot]);
  const detailBooking = mode === "detail" ? snapshot?.bookings[0] ?? null : null;

  return (
    <div className="useby-bookings-root space-y-5">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .useby-bookings-root *,
          .useby-bookings-root *::before,
          .useby-bookings-root *::after {
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
            <p className="text-xs font-semibold uppercase text-[#65715f]">Bookings</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#17231c] sm:text-3xl">
              {mode === "detail" ? "Booking handoff detail" : "Booking and handoff queue"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566250]">
              {mode === "detail"
                ? "Track the request, pickup, and completion state while household locations stay coarse."
                : "Live booking rows show current requests, pickups, and completed handoffs."}
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
          {detailBooking ? (
            <>
              <Metric label="Status" value={formatStatus(detailBooking.status)} />
              <Metric label="Owner area" value={detailBooking.owner.coarseLocation ?? "Coarse area"} />
              <Metric label="Receiver area" value={detailBooking.receiver.coarseLocation ?? "Coarse area"} />
              <Metric label="Distance" value={detailBooking.distanceLabel ?? "Approximate only"} />
            </>
          ) : (
            <>
              <Metric label="Route state" value={bookingsEndpointSummary(snapshot)} />
              <Metric label="Bookings" value={String(counts.total)} />
              <Metric label="Active" value={String(counts.active)} />
              <Metric label="Closed" value={String(counts.terminal)} />
            </>
          )}
        </div>
      </section>

      {loadError ? <Notice status="error" title="Booking refresh failed" detail={loadError} /> : null}
      {mutationResult ? (
        <Notice
          status={mutationResult.status}
          title={mutationResult.status === "ok" ? "Saved through live route" : "Live route did not complete"}
          detail={mode === "detail" ? mutationResult.message : `${mutationResult.endpoint}${mutationResult.httpStatus ? ` returned HTTP ${mutationResult.httpStatus}` : ""}. ${mutationResult.message}`}
        />
      ) : null}

      {isLoading && !snapshot ? <LoadingGrid /> : null}

      {!isLoading && snapshot ? (
        <>
          <BookingsPanel
            bookings={snapshot.bookings}
            mode={mode}
            onActionResult={async (result) => {
              setMutationResult(result);
              if (result.status === "ok") {
                await refresh();
              }
            }}
          />
          {mode === "detail" ? null : <EndpointPanel endpoints={snapshot.endpoints} />}
        </>
      ) : null}
    </div>
  );
}

function BookingsPanel({
  bookings,
  mode,
  onActionResult,
}: {
  bookings: Booking[];
  mode: BookingWorkspaceMode;
  onActionResult: (result: BookingMutationResult) => Promise<void>;
}) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label={mode === "detail" ? "Handoff" : "Queue"}
        title={mode === "detail" ? "Current booking state" : "Live booking requests"}
        detail="Location stays coarse before acceptance. After acceptance, show only a pickup hint, never raw household coordinates or direct contact details."
      />
      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings returned"
          detail="Requests created from eligible nearby matches will appear here after a neighbour asks to reserve an item."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {bookings.map((booking) => (
            <BookingCard booking={booking} key={booking.id} mode={mode} onActionResult={onActionResult} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function BookingCard({
  booking,
  mode,
  onActionResult,
}: {
  booking: Booking;
  mode: BookingWorkspaceMode;
  onActionResult: (result: BookingMutationResult) => Promise<void>;
}) {
  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">{formatStatus(booking.status)}</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">
              {displayItemName(booking.item.name)}
            </h2>
          </div>
          {mode === "list" ? (
            <Link
              className="inline-flex min-h-10 items-center rounded-md border border-[#315b44] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white"
              href={`/bookings/${encodeURIComponent(booking.id)}`}
            >
              Open
            </Link>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Owner" value={partyLabel(booking.owner)} />
          <Fact label="Receiver" value={partyLabel(booking.receiver)} />
          <Fact label="Pre-acceptance area" value={booking.locationLabel ?? booking.owner.coarseLocation ?? "Coarse label only"} />
          <Fact label="Distance" value={booking.distanceLabel ?? "Approximate only"} />
        </div>

        <div className="mt-4 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3 text-sm leading-6 text-[#566250]">
          <p className="font-semibold text-[#17231c]">Privacy and safety</p>
          <p className="mt-1">
            UseBy does not show exact household coordinates or direct personal contact details. Food sharing is limited to eligible sealed packaged goods; the app records acknowledgement but is not a food safety or freshness guarantee.
          </p>
          {booking.handoff.pickupHint ? (
            <p className="mt-2">
              Pickup hint after acceptance: <span className="font-semibold text-[#17231c]">{booking.handoff.pickupHint}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <BookingTimeline booking={booking} />
        </div>
      </div>

      <BookingActionControls booking={booking} onActionResult={onActionResult} />
    </article>
  );
}

function BookingActionControls({
  booking,
  onActionResult,
}: {
  booking: Booking;
  onActionResult: (result: BookingMutationResult) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pickupWindowStart, setPickupWindowStart] = useState("");
  const [pickupWindowEnd, setPickupWindowEnd] = useState("");
  const [pickupHint, setPickupHint] = useState("");
  const [rating, setRating] = useState("5");
  const [note, setNote] = useState("");
  const actions = booking.availableActions;

  async function runAction(action: BookingActionInput["action"]) {
    setPendingAction(action);
    const result = await transitionBooking(window.fetch.bind(window), {
      bookingId: booking.id,
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
    const result = await submitBookingReview(window.fetch.bind(window), {
      bookingId: booking.id,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      note,
    });
    await onActionResult(result);
    setPendingAction(null);
  }

  return (
    <aside className="grid content-start gap-4 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] p-4">
      <div>
        <p className="text-xs font-semibold uppercase text-[#65715f]">Actions</p>
        <h3 className="mt-1 text-base font-semibold text-[#17231c]">
          {booking.viewerRole === "unknown" ? "Owner / receiver controls" : `${formatStatus(booking.viewerRole)} controls`}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#65715f]">
          Move this handoff through the live booking workflow.
        </p>
      </div>

      {actions.length === 0 ? (
        <Notice
          status="unavailable"
          title="No actions available"
          detail="This handoff is waiting for the next participant or has reached a closed state."
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
            onClick={() => void runAction(action as BookingActionInput["action"])}
            type="button"
          >
            {pendingAction === action ? "Saving" : formatStatus(action)}
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
              placeholder="Short handoff note for trust context"
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

function unavailableSnapshot(message: string, bookingId?: string): BookingSnapshot {
  const endpoint = bookingId ? `/api/bookings/${bookingId}` : "/api/bookings";
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    bookings: [],
    endpoints: [{ endpoint, status: "unavailable", httpStatus: null, message }],
    message,
  };
}

function EndpointPanel({ endpoints }: { endpoints: BookingEndpointState[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="API readiness"
        title="Booking route checks"
        detail="Missing booking features are diagnosed by route registration and activation state first."
      />
      <div className="divide-y divide-[#edf1e8]">
        {endpoints.map((endpoint) => (
          <div key={endpoint.endpoint} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center sm:px-5">
            <div className="min-w-0">
              <p className="break-words font-mono text-sm font-semibold text-[#17231c]">{endpoint.endpoint}</p>
              <p className="mt-1 text-sm leading-6 text-[#65715f]">
                {endpoint.httpStatus ? `HTTP ${endpoint.httpStatus}` : "No HTTP response"} · {endpoint.message}
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
      <p className="mt-1 break-words font-mono text-sm font-semibold text-[#17231c]">{value}</p>
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

function partyLabel(party: Booking["owner"]): string {
  return [party.label, party.coarseLocation, party.trustLabel].filter(Boolean).join(" · ");
}

function displayItemName(value: string): string {
  const cleaned = value
    .replace(/\byoghourt\b/gi, "yoghurt")
    .replace(/\bfinal\s+smoke\b/gi, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || "Shared item";
}
