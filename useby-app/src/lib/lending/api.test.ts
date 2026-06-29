import { describe, expect, it } from "vitest";
import {
  loadLendingSnapshot,
  normalizeLendingListing,
  normalizeLendingRequest,
  requestLending,
  transitionLending,
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

describe("lending UI API helpers", () => {
  it("normalizes privacy-preserving listings and lending requests", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/listings")) {
        return jsonResponse({
          listings: [
            {
              id: "listing-1",
              item: { id: "item-1", title: "Navy occasion dress", category: "fashion", size: "UK 10" },
              condition_label: "Freshly cleaned",
              availability_label: "Weekends",
              owner: { label: "Household A", coarse_location_label: "Riverside north" },
              distance_meters: 530,
              lending_terms: {
                summary: "Return in garment bag",
                deposit_preference: "Owner prefers a refundable deposit.",
              },
            },
          ],
        });
      }

      return jsonResponse({
        requests: [
          {
            id: "booking-1",
            status: "picked_up",
            viewer_role: "borrower",
            item: { title: "Cordless drill", category: "household", condition: "Good" },
            owner: { label: "Household A", coarse_location_label: "Riverside north" },
            borrower: { label: "Household B", coarse_location_label: "Riverside south" },
            borrow_window_start: "2026-07-01T12:00:00.000Z",
            borrow_window_end: "2026-07-02T12:00:00.000Z",
          },
        ],
      });
    };

    const snapshot = await loadLendingSnapshot(fetcher);

    expect(snapshot.status).toBe("available");
    expect(snapshot.listings[0]?.title).toBe("Navy occasion dress");
    expect(snapshot.listings[0]?.owner.coarseLocation).toBe("Riverside north");
    expect(snapshot.listings[0]?.distanceLabel).toBe("530 m");
    expect(snapshot.listings[0]?.depositPreference).toBe("Owner prefers a refundable deposit.");
    expect(snapshot.requests[0]?.availableActions).toEqual(["returned"]);
  });

  it("reports missing lending routes as unavailable without fake listings", async () => {
    const fetcher = async () => jsonResponse({ status: "unavailable", reason: "route not installed" }, { status: 404 });

    const snapshot = await loadLendingSnapshot(fetcher);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.listings).toHaveLength(0);
    expect(snapshot.requests).toHaveLength(0);
    expect(snapshot.endpoints.map((endpoint) => endpoint.endpoint)).toEqual([
      "/api/lending/listings",
      "/api/lending/requests",
    ]);
  });

  it("builds CP4 request and lifecycle endpoints", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ bookingId: "booking-1", message: "ok" });
    };

    const request = await requestLending(fetcher, {
      listingId: "listing-1",
      borrowWindowStart: "2026-07-01T12:00",
      borrowWindowEnd: "2026-07-02T12:00",
      note: "Can collect from lobby",
    });
    const returned = await transitionLending(fetcher, {
      bookingId: "booking-1",
      action: "returned",
    });

    expect(request.status).toBe("ok");
    expect(returned.status).toBe("ok");
    expect(calls.map((call) => call.url)).toEqual([
      "/api/lending/request",
      "/api/lending/booking-1/returned",
    ]);
    expect(calls[0]?.body).toMatchObject({ listingId: "listing-1", source: "lending_ui" });
  });

  it("normalizes listing and request fallback fields", () => {
    const listing = normalizeLendingListing({
      listing_id: "listing-2",
      item_name: "Folding chairs",
      category: "household",
      owner_household: { display_name: "Owner", area: "West courtyard" },
    });
    const request = normalizeLendingRequest({
      booking_id: "booking-2",
      status: "returned",
      item_name: "Blazer",
      category: "fashion",
    });

    expect(listing.availabilityLabel).toBe("Ask owner for an available window");
    expect(listing.owner.coarseLocation).toBe("West courtyard");
    expect(request.availableActions).toEqual(["complete"]);
  });
});
