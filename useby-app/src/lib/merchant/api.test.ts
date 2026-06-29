import { describe, expect, it } from "vitest";
import {
  loadMerchantSnapshot,
  normalizeMerchantBid,
  normalizeMerchantHeatmapCell,
  normalizeMerchantPickup,
  normalizeMerchantPool,
  normalizeMerchantStoreDrop,
  submitMerchantBid,
  submitMerchantStoreDrop,
  transitionMerchantPickup,
  transitionMerchantStoreDrop,
} from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("merchant API helpers", () => {
  it("normalizes anonymised active pools, bids, and pickups", async () => {
    const pool = normalizeMerchantPool({
      id: "pool-1",
      title: "Sunday veg boxes",
      status: "bidding",
      committedHouseholds: 7,
      thresholdHouseholds: 8,
      committedQuantity: "7",
      thresholdQuantity: "8",
      unit: "box",
      coarseArea: "Riverside Quarter",
      requestedItems: ["veg box"],
      maxPriceCents: 1400,
    });
    const bid = normalizeMerchantBid({
      id: "bid-1",
      demandPoolId: "pool-1",
      poolTitle: "Sunday veg boxes",
      status: "submitted",
      priceCents: 1250,
      availableQuantity: "10",
      pickupWindowStart: "2026-07-01T16:00:00.000Z",
    });
    const pickup = normalizeMerchantPickup({
      id: "pickup-1",
      orderId: "order-1",
      poolTitle: "Sunday veg boxes",
      status: "ready",
      householdLabel: "Household 4",
      coarseArea: "Riverside Quarter",
      quantity: "1",
      unit: "box",
    });

    expect(pool.demandSummary).toBe("7/8 households, 7/8 box");
    expect(pool.maxPriceLabel).toBe("£14.00");
    expect(pool.coarseArea).toBe("Riverside Quarter");
    expect(bid.priceLabel).toBe("£12.50");
    expect(bid.poolId).toBe("pool-1");
    expect(pickup.availableActions).toContain("collected");
    expect(JSON.stringify({ pool, bid, pickup }).toLowerCase()).not.toMatch(/latitude|longitude|email|phone/);
  });

  it("loads planned merchant routes and keeps missing endpoints unavailable", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/demand-pools")) {
        return jsonResponse({ pools: [{ id: "pool-1", title: "Pantry bundle", status: "bidding" }] });
      }
      return jsonResponse({ status: "unavailable", message: "not installed" }, 503);
    };

    const snapshot = await loadMerchantSnapshot(fetcher as typeof fetch);

    expect(snapshot.status).toBe("partial");
    expect(snapshot.pools).toHaveLength(1);
    expect(snapshot.endpoints.map((endpoint) => endpoint.endpoint)).toEqual([
      "/api/merchant/demand-pools",
      "/api/merchant/bids",
      "/api/merchant/pickups",
      "/api/merchant/store-drops",
      "/api/merchant/heatmap",
    ]);
    expect(snapshot.endpoints.filter((endpoint) => endpoint.status === "unavailable")).toHaveLength(4);
  });

  it("normalizes CP7 drops, reservations, heatmap cells, and remaining capacity", () => {
    const drop = normalizeMerchantStoreDrop({
      id: "drop-1",
      title: "Evening bakery bundles",
      status: "published",
      quantityTotal: 12,
      unit: "bundle",
      pricePence: 350,
      pickupWindowStart: "2026-07-01T17:00:00.000Z",
      pickupWindowEnd: "2026-07-01T19:00:00.000Z",
      coarseArea: "Riverside Quarter",
      activeReservations: [
        {
          id: "reservation-1",
          quantity: 2,
          householdLabel: "Household 4",
          coarseArea: "North riverside",
          status: "active",
        },
        {
          id: "reservation-2",
          quantity: 1,
          householdLabel: "Household 7",
          coarseArea: "Courtyard side",
          status: "cancelled",
        },
      ],
    });
    const cell = normalizeMerchantHeatmapCell({
      cellId: "rq-1",
      label: "North riverside",
      demandCount: 6,
      dropCount: 2,
      reservationCount: 4,
      intensity: "high",
    });

    expect(drop.remainingQuantity).toBe(10);
    expect(drop.quantityReserved).toBe(2);
    expect(drop.activeReservations).toHaveLength(1);
    expect(drop.priceLabel).toBe("£3.50");
    expect(cell).toMatchObject({
      id: "rq-1",
      demandCount: 6,
      reservationCount: 4,
      intensity: "high",
    });
    expect(JSON.stringify({ drop, cell }).toLowerCase()).not.toMatch(/latitude|longitude|unitlabel|email|phone/);
  });

  it("posts bids and pickup transitions to the planned Lane 6B routes", async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        path: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return jsonResponse({ bid: { id: "bid-1" }, message: "saved" });
    };

    const bidResult = await submitMerchantBid(fetcher as typeof fetch, {
      poolId: "pool-1",
      priceCents: 1299,
      availableQuantity: 12,
      minQuantity: 6,
      pickupWindowStart: "2026-07-01T16:00",
      pickupWindowEnd: "2026-07-01T18:00",
      terms: "Merchant-packed bundle.",
      substitutionPolicy: "Like-for-like substitutions.",
      fulfilmentNotes: "Ready after award.",
    });
    const pickupResult = await transitionMerchantPickup(fetcher as typeof fetch, {
      orderId: "order-1",
      action: "ready",
    });

    expect(bidResult).toMatchObject({ status: "ok", endpoint: "/api/merchant/bids", entityId: "bid-1" });
    expect(pickupResult.endpoint).toBe("/api/merchant/pickups/order-1/ready");
    expect(requests[0]).toMatchObject({
      path: "/api/merchant/bids",
      body: {
        demandPoolId: "pool-1",
        priceCents: 1299,
        source: "merchant_portal",
      },
    });
  });

  it("posts CP7 drop create, edit, and status transitions to planned merchant routes", async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        path: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return jsonResponse({ drop: { id: "drop-1" }, message: "saved" });
    };

    const createResult = await submitMerchantStoreDrop(fetcher as typeof fetch, {
      title: "Evening bakery bundles",
      quantityTotal: 12,
      unit: "bundle",
      priceCents: 350,
      pickupWindowStart: "2026-07-01T17:00",
      pickupWindowEnd: "2026-07-01T19:00",
      safetyNotes: "Merchant-packed surplus.",
    });
    const editResult = await submitMerchantStoreDrop(fetcher as typeof fetch, {
      dropId: "drop-1",
      title: "Evening bakery bundles",
      quantityTotal: 10,
      unit: "bundle",
      priceCents: 300,
      pickupWindowStart: "2026-07-01T17:00",
      pickupWindowEnd: "2026-07-01T19:00",
      safetyNotes: "Merchant-packed surplus.",
    });
    const publishResult = await transitionMerchantStoreDrop(fetcher as typeof fetch, {
      dropId: "drop-1",
      action: "publish",
    });

    expect(createResult).toMatchObject({ status: "ok", endpoint: "/api/merchant/store-drops", entityId: "drop-1" });
    expect(editResult.endpoint).toBe("/api/merchant/store-drops/drop-1");
    expect(publishResult.endpoint).toBe("/api/merchant/store-drops/drop-1/publish");
    expect(requests[0]).toMatchObject({
      path: "/api/merchant/store-drops",
      body: {
        title: "Evening bakery bundles",
        quantityTotal: 12,
        paymentMode: "unpaid_demo_intent",
        source: "merchant_portal",
      },
    });
    expect(requests[2].body).toMatchObject({
      source: "merchant_portal",
      paymentMode: "unpaid_demo_intent",
    });
  });
});
