import { describe, expect, it } from "vitest";
import {
  loadMerchantSnapshot,
  normalizeMerchantBid,
  normalizeMerchantPickup,
  normalizeMerchantPool,
  submitMerchantBid,
  transitionMerchantPickup,
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
    ]);
    expect(snapshot.endpoints.filter((endpoint) => endpoint.status === "unavailable")).toHaveLength(2);
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
});
