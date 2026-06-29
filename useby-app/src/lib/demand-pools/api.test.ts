import { describe, expect, it } from "vitest";
import {
  loadDemandPoolSnapshot,
  normalizeDemandPool,
  submitDemandPoolCommitment,
  submitDemandPoolCreate,
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

describe("demand pool UI API helpers", () => {
  it("normalizes live pool and pickup route responses without adding fixture outcomes", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      if (endpoint === "/api/demand-pools") {
        return jsonResponse({
          pools: [
            {
              id: "pool-roast",
              title: "Sunday roast bundle",
              status: "bidding",
              threshold_quantity: 10,
              committed_quantity: 7,
              household_count: 5,
              max_price_cents: 1200,
              pickup_area_label: "Riverside Quarter",
              pickup_radius_meters: 1500,
              requested_items: [{ name: "Potatoes", quantity: "2", unit: "kg" }],
              current_user_commitment: {
                id: "commit-1",
                quantity: 1,
                max_price_intent_cents: 1200,
                unpaid_demo_intent: true,
              },
              merchant_bids: [
                {
                  id: "bid-1",
                  merchant_name: "Riverside Grocer",
                  price_cents: 1150,
                  available_quantity: 12,
                  safe_to_show: true,
                },
              ],
            },
          ],
        });
      }

      return jsonResponse({
        orders: [
          {
            id: "order-1",
            pool_id: "pool-roast",
            status: "ready_for_pickup",
            merchant_name: "Riverside Grocer",
          },
        ],
      });
    };

    const snapshot = await loadDemandPoolSnapshot(fetcher);

    expect(snapshot.status).toBe("available");
    expect(snapshot.pools[0]?.title).toBe("Sunday roast bundle");
    expect(snapshot.pools[0]?.currentUserCommitment?.unpaidDemoIntent).toBe(true);
    expect(snapshot.pools[0]?.merchantBids[0]?.merchantName).toBe("Riverside Grocer");
    expect(snapshot.orders[0]?.status).toBe("ready_for_pickup");
  });

  it("marks missing CP6 routes unavailable instead of manufacturing pools", async () => {
    const fetcher = async () => jsonResponse({ status: "unavailable", message: "CP6 schema missing" }, { status: 503 });

    const snapshot = await loadDemandPoolSnapshot(fetcher);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.pools).toHaveLength(0);
    expect(snapshot.orders).toHaveLength(0);
    expect(snapshot.endpoints.every((endpoint) => endpoint.status === "unavailable")).toBe(true);
  });

  it("validates commitment intent and posts unpaid demo wording to the planned route", async () => {
    const calls: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        endpoint: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return jsonResponse({ message: "Committed", poolId: "pool-roast" });
    };

    const invalid = await submitDemandPoolCommitment(fetcher, {
      poolId: "pool-roast",
      quantity: "0",
      maxPrice: "12",
    });
    const valid = await submitDemandPoolCommitment(fetcher, {
      poolId: "pool-roast",
      quantity: "2",
      maxPrice: "11.50",
    });

    expect(invalid.status).toBe("error");
    expect(valid.status).toBe("ok");
    expect(calls[0]?.endpoint).toBe("/api/demand-pools/pool-roast/commit");
    expect(calls[0]?.body).toMatchObject({
      quantity: 2,
      maxPricePence: 1150,
      metadata: {
        maxPriceCents: 1150,
        unpaidDemoIntent: true,
        source: "consumer_demand_pool_ui",
      },
    });
    expect(calls[0]?.body).not.toHaveProperty("card");
    expect(calls[0]?.body).not.toHaveProperty("deposit");
  });

  it("posts pool creation as input state and leaves awards to live jobs", async () => {
    let payload: Record<string, unknown> | null = null;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return jsonResponse({ message: "Created", pool_id: "pool-new" });
    };

    const result = await submitDemandPoolCreate(fetcher, {
      title: "Student pantry staples",
      requestedItems: "Rice, beans",
      targetQuantity: "8",
      maxPrice: "9",
      pickupRadius: "2",
      pickupArea: "Riverside Quarter",
      closesAt: "",
    });

    expect(result.status).toBe("ok");
    expect(payload).toMatchObject({
      title: "Student pantry staples",
      thresholdQuantity: 8,
      maxPricePencePerHousehold: 900,
      requestedItems: ["Rice", "beans"],
      metadata: {
        maxPriceCents: 900,
        unpaidDemoIntent: true,
        source: "consumer_demand_pool_ui",
      },
    });
    expect(payload).not.toHaveProperty("winningBid");
    expect(payload).not.toHaveProperty("orders");
  });

  it("keeps unsafe bids hidden from consumer detail decisions", () => {
    const pool = normalizeDemandPool({
      id: "pool-1",
      merchant_bids: [
        { id: "safe", merchant_name: "Public bid", safe_to_show: true },
        { id: "private", merchant_name: "Private draft", safe_to_show: false },
      ],
    });

    expect(pool.merchantBids).toHaveLength(2);
    expect(pool.merchantBids.filter((bid) => bid.safeToShow).map((bid) => bid.id)).toEqual(["safe"]);
  });
});
