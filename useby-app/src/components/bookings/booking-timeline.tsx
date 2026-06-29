import type { Booking, BookingLifecycleStatus } from "../../lib/bookings/types";
import { formatStatus } from "../../lib/bookings/api";

const terminalStatuses = new Set(["declined", "cancelled", "disputed"]);

const timelineOrder: BookingLifecycleStatus[] = [
  "requested",
  "reserved",
  "pickup_scheduled",
  "picked_up",
  "completed",
  "reviewed",
];

export function BookingTimeline({ booking }: { booking: Booking }) {
  const eventByStatus = new Map(booking.timeline.map((event) => [event.status, event]));
  const visibleStatuses = terminalStatuses.has(booking.status)
    ? ["requested", booking.status]
    : timelineOrder;

  return (
    <div className="grid gap-3">
      {visibleStatuses.map((status) => {
        const event = eventByStatus.get(status);
        const active = event !== undefined || booking.status === status;
        const current = booking.status === status || (status === "reserved" && booking.status === "accepted");

        return (
          <div
            className={`grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-md border px-3 py-3 ${
              active
                ? "border-[#bfd4c2] bg-[#f5faf2]"
                : "border-[#e5eadf] bg-[#fbfcf7]"
            }`}
            key={status}
          >
            <span
              className={`mt-1 size-3 rounded-full ${
                current ? "bg-[#315b44]" : active ? "bg-[#7da06f]" : "bg-[#d5ddcf]"
              }`}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[#17231c]">
                  {event?.label ?? (status === "reserved" ? "Accepted / reserved" : formatStatus(status))}
                </p>
                {event?.at ? (
                  <span className="rounded-md border border-[#dbe4d2] bg-white px-2 py-1 font-mono text-xs text-[#566250]">
                    {formatDateTime(event.at)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-[#65715f]">
                {event?.detail ?? timelineDetail(status)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function timelineDetail(status: BookingLifecycleStatus): string {
  if (status === "requested") {
    return "Waiting for owner response.";
  }
  if (status === "reserved") {
    return "Once accepted, the item is held for this neighbour and cannot be double-booked.";
  }
  if (status === "pickup_scheduled") {
    return "Pickup details stay coarse and avoid exact household coordinates.";
  }
  if (status === "picked_up") {
    return "Receiver has collected the item.";
  }
  if (status === "completed") {
    return "Completion closes the handoff and records the outcome.";
  }
  if (status === "reviewed") {
    return "Review saved for trust context.";
  }
  if (status === "declined") {
    return "The owner declined this request.";
  }
  if (status === "cancelled") {
    return "The booking was cancelled.";
  }
  if (status === "disputed") {
    return "This handoff needs moderation review.";
  }

  return "Booking state returned by the live API.";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}
