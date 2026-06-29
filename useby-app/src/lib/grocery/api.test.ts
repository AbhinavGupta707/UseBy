import { describe, expect, it } from "vitest";
import {
  loadGrocerySnapshot,
  normalizeInventoryItem,
  submitExpiryEdit,
  submitManualGrocery,
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

describe("grocery UI API helpers", () => {
  it("normalizes split route responses without exposing unavailable fallback data", async () => {
    const fetcher = async () => jsonResponse({
      inventory: [
        {
          id: "item-wraps",
          title: "Tortilla wraps",
          quantity: "2",
          unit: "packs",
          storage_state: "sealed",
          safety_status: "eligible",
          use_by_date: "2026-07-02",
          expiry_confidence: "0.92",
        },
      ],
      action_cards: [
        {
          id: "card-scan",
          card_type: "scan_label",
          title: "Scan yoghurt label",
          body: "Confirm the date before any sharing action.",
          explanation: "Low expiry confidence returned by the action engine.",
        },
      ],
      matches: [
        {
          id: "match-1",
          item_name: "Tortilla wraps",
          need_title: "Wraps for dinner",
          distance_m: 420,
          score: "0.81",
          explanation: "Eligible sealed item inside the need radius.",
        },
      ],
    });

    const snapshot = await loadGrocerySnapshot(fetcher);

    expect(snapshot.status).toBe("available");
    expect(snapshot.inventory[0]?.name).toBe("Tortilla wraps");
    expect(snapshot.inventory[0]?.safetyStatus).toBe("eligible");
    expect(snapshot.actionCards[0]?.type).toBe("scan_label");
    expect(snapshot.matches[0]?.distanceMeters).toBe(420);
  });

  it("falls back to split endpoints and marks missing routes unavailable", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      if (endpoint === "/api/grocery/inventory") {
        return jsonResponse({ items: [{ id: "item-1", name: "Spinach", expires_at: "2026-06-30" }] });
      }

      return jsonResponse({ message: "not installed" }, { status: 404 });
    };

    const snapshot = await loadGrocerySnapshot(fetcher);

    expect(snapshot.status).toBe("partial");
    expect(snapshot.inventory).toHaveLength(1);
    expect(snapshot.endpoints.find((endpoint) => endpoint.endpoint === "/api/grocery/action-cards")?.status).toBe("unavailable");
    expect(snapshot.actionCards).toHaveLength(0);
  });

  it("tries live mutation routes and reports unavailable when none are installed", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ message: "missing" }, { status: 404 });
    };

    const importResult = await submitManualGrocery(fetcher, {
      itemName: "Mushrooms",
      quantity: "1",
      unit: "pack",
      storageState: "fridge",
      expiryDate: "2026-07-01",
      receiptLines: "",
    });
    const editResult = await submitExpiryEdit(fetcher, {
      itemId: "item-1",
      storageState: "fridge",
      expiryDate: "2026-07-02",
      safetyStatus: "unknown",
    });

    expect(importResult.status).toBe("unavailable");
    expect(editResult.status).toBe("unavailable");
    expect(calls).toContain("/api/grocery/import");
    expect(calls).toContain("/api/grocery/items/item-1");
  });

  it("derives honest expiry bands from visible dates when the backend omits a band", () => {
    const item = normalizeInventoryItem({
      id: "item-yoghurt",
      title: "Greek yoghurt",
      use_by_date: "2026-07-02",
      safety_status: "restricted",
    });

    expect(item.expiryDate).toBe("2026-07-02");
    expect(["today", "use_soon", "watch", "fresh", "expired"]).toContain(item.expiryBand);
    expect(item.safetyStatus).toBe("restricted");
  });
});
