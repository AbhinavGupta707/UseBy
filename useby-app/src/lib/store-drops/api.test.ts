import { describe, expect, it } from "vitest";
import {
  canReserveDrop,
  loadStoreDropSnapshot,
  normalizeStoreDrop,
  submitStoreDropReservation,
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

describe("store drops UI API helpers", () => {
  it("normalizes live drops and current reservations without exposing precise location fields", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      if (endpoint === "/api/store-drops") {
        return jsonResponse({
          drops: [
            {
              id: "drop-bread",
              title: "Bakery end-of-day bag",
              status: "published",
              merchant_display_name: "Riverside Bakery",
              pickup_address: "1 Private Street",
              latitude: 51.5,
              longitude: -0.1,
              pickup_area_label: "Riverside Quarter",
              total_quantity: 8,
              reserved_quantity: 3,
              price_cents: 250,
              pickup_window_start: "2026-06-29T17:00:00.000Z",
              pickup_window_end: "2026-06-29T19:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({
        reservations: [
          {
            id: "reservation-1",
            drop_id: "drop-bread",
            quantity: 2,
            status: "active",
            unpaid_demo_intent: true,
          },
        ],
      });
    };

    const snapshot = await loadStoreDropSnapshot(fetcher);

    expect(snapshot.status).toBe("available");
    expect(snapshot.drops[0]?.merchantDisplayName).toBe("Riverside Bakery");
    expect(snapshot.drops[0]?.coarsePickupArea).toBe("Riverside Quarter");
    expect(snapshot.drops[0]?.remainingQuantity).toBe(5);
    expect(snapshot.drops[0]?.currentReservation?.quantity).toBe(2);
    expect(JSON.stringify(snapshot.drops[0])).not.toContain("Private Street");
    expect(JSON.stringify(snapshot.drops[0])).not.toContain("latitude");
    expect(JSON.stringify(snapshot.drops[0])).not.toContain("longitude");
  });

  it("marks missing CP7 routes unavailable instead of manufacturing drop cards", async () => {
    const fetcher = async () => jsonResponse({ status: "unavailable", message: "CP7 schema missing" }, { status: 503 });

    const snapshot = await loadStoreDropSnapshot(fetcher);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.drops).toHaveLength(0);
    expect(snapshot.reservations).toHaveLength(0);
    expect(snapshot.endpoints.every((endpoint) => endpoint.status === "unavailable")).toBe(true);
  });

  it("validates reservation quantity and posts unpaid no-payment metadata", async () => {
    const calls: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        endpoint: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return jsonResponse({ message: "Reserved", dropId: "drop-bread" });
    };

    const invalid = await submitStoreDropReservation(fetcher, {
      dropId: "drop-bread",
      quantity: "0",
    });
    const valid = await submitStoreDropReservation(fetcher, {
      dropId: "drop-bread",
      quantity: "2",
    });

    expect(invalid.status).toBe("error");
    expect(valid.status).toBe("ok");
    expect(calls[0]?.endpoint).toBe("/api/store-drops/drop-bread/reserve");
    expect(calls[0]?.body).toMatchObject({
      quantity: 2,
      metadata: {
        unpaidDemoIntent: true,
        noPayment: true,
        source: "consumer_store_drops_ui",
      },
    });
    expect(calls[0]?.body).not.toHaveProperty("card");
    expect(calls[0]?.body).not.toHaveProperty("deposit");
    expect(calls[0]?.body).not.toHaveProperty("paymentIntent");
  });

  it("blocks obviously unavailable drop states client-side", () => {
    const soldOut = normalizeStoreDrop({
      id: "drop-sold-out",
      status: "published",
      remaining_quantity: 0,
    });
    const paused = normalizeStoreDrop({
      id: "drop-paused",
      status: "paused",
      remaining_quantity: 2,
    });
    const reservable = normalizeStoreDrop({
      id: "drop-open",
      status: "published",
      remaining_quantity: 2,
    });

    expect(canReserveDrop(soldOut)).toBe(false);
    expect(canReserveDrop(paused)).toBe(false);
    expect(canReserveDrop(reservable)).toBe(true);
  });
});
