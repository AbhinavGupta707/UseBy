import { describe, expect, it } from "vitest";
import {
  loadBookingDetail,
  loadBookingsSnapshot,
  normalizeBooking,
  requestBooking,
  submitSafetyAcknowledgement,
  transitionBooking,
} from "./api";

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe("booking UI API helpers", () => {
  it("normalizes list responses with privacy-preserving booking fields", async () => {
    const fetcher = async () => jsonResponse({
      bookings: [
        {
          id: "booking-1",
          status: "pickup_scheduled",
          viewer_role: "receiver",
          item: { id: "item-1", title: "Tortilla wraps", category: "grocery", safety_status: "eligible" },
          owner: { label: "Household A", coarse_location_label: "Riverside north" },
          receiver: { label: "Household B", coarse_location_label: "Riverside south" },
          distance_meters: 420,
          handoff: {
            pickup_window_start: "2026-07-01T17:00:00.000Z",
            pickup_location_hint: "Riverside Hub desk",
          },
        },
      ],
    });

    const snapshot = await loadBookingsSnapshot(fetcher);

    expect(snapshot.status).toBe("available");
    expect(snapshot.bookings[0]?.item.name).toBe("Tortilla wraps");
    expect(snapshot.bookings[0]?.owner.coarseLocation).toBe("Riverside north");
    expect(snapshot.bookings[0]?.handoff.pickupHint).toBe("Riverside Hub desk");
    expect(snapshot.bookings[0]?.distanceLabel).toBe("420 m");
  });

  it("reports missing booking routes as unavailable without fallback bookings", async () => {
    const fetcher = async () => jsonResponse({ status: "unavailable", reason: "route not installed" }, { status: 404 });

    const snapshot = await loadBookingsSnapshot(fetcher);
    const detail = await loadBookingDetail(fetcher, "booking-1");

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.bookings).toHaveLength(0);
    expect(detail.status).toBe("unavailable");
    expect(detail.bookings).toHaveLength(0);
  });

  it("requires live safety acknowledgement before request flow can proceed", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ message: "missing" }, { status: 404 });
    };

    const ack = await submitSafetyAcknowledgement(fetcher, {
      matchId: "match-1",
      itemInstanceId: "item-1",
      needId: "need-1",
      acknowledged: true,
      sealedPackagedOnly: true,
      noSafetyCertification: true,
      source: "grocery_match_card",
    });
    const request = await requestBooking(fetcher, {
      matchId: "match-1",
      itemInstanceId: "item-1",
      needId: "need-1",
      source: "grocery_match_card",
    });

    expect(ack.status).toBe("unavailable");
    expect(request.status).toBe("unavailable");
    expect(calls).toContain("/api/safety/food-acknowledgements");
    expect(calls).toContain("/api/bookings/request");
  });

  it("builds transition endpoints for handoff actions", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ bookingId: "booking-1", message: "scheduled" });
    };

    const result = await transitionBooking(fetcher, {
      bookingId: "booking-1",
      action: "schedule-pickup",
      pickupWindowStart: "2026-07-01T17:00",
      pickupWindowEnd: "2026-07-01T18:00",
      pickupHint: "Riverside Hub desk",
    });

    expect(result.status).toBe("ok");
    expect(calls).toEqual(["/api/bookings/booking-1/schedule-pickup"]);
  });

  it("creates timeline states for accepted through reviewed bookings", () => {
    const booking = normalizeBooking({
      id: "booking-2",
      status: "reviewed",
      created_at: "2026-07-01T12:00:00.000Z",
      accepted_at: "2026-07-01T12:05:00.000Z",
      handoff: {
        pickup_window_start: "2026-07-01T17:00:00.000Z",
        picked_up_at: "2026-07-01T17:20:00.000Z",
        completed_at: "2026-07-01T17:40:00.000Z",
      },
      review: { rating: 5, created_at: "2026-07-01T17:45:00.000Z" },
    });

    expect(booking.timeline.map((event) => event.status)).toEqual([
      "requested",
      "reserved",
      "pickup_scheduled",
      "picked_up",
      "completed",
      "reviewed",
    ]);
    expect(booking.availableActions).toEqual([]);
  });
});
