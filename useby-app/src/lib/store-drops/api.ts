import type {
  StoreDrop,
  StoreDropDetailResult,
  StoreDropEndpointState,
  StoreDropMutationResult,
  StoreDropReservation,
  StoreDropReserveInput,
  StoreDropSnapshot,
} from "./types";

type Fetcher = typeof fetch;

const DROPS_ENDPOINT = "/api/store-drops";
const RESERVATIONS_ENDPOINT = "/api/store-drops/reservations";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function dateTimeValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function findFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function childArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  const data = asRecord(record.data);
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function firstObject(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = asRecord(record[key]);
    if (Object.keys(value).length > 0) {
      return value;
    }
  }

  const data = asRecord(record.data);
  for (const key of keys) {
    const value = asRecord(data[key]);
    if (Object.keys(value).length > 0) {
      return value;
    }
  }

  return {};
}

function endpointState(
  endpoint: string,
  status: StoreDropEndpointState["status"],
  httpStatus: number | null,
  message: string,
): StoreDropEndpointState {
  return { endpoint, status, httpStatus, message };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return asRecord(await response.json().catch(() => ({})));
}

function responseStatus(response: Response, body: Record<string, unknown>): StoreDropEndpointState["status"] {
  const explicit = stringValue(body.status).toLowerCase();
  if (response.ok && explicit !== "unavailable") {
    return "available";
  }

  if (response.status === 404 || response.status === 501 || response.status === 503 || explicit === "unavailable") {
    return "unavailable";
  }

  return "error";
}

function responseMessage(response: Response, body: Record<string, unknown>): string {
  return stringValue(
    findFirst(body, ["message", "reason", "error"]),
    response.ok ? "available" : `HTTP ${response.status}`,
  );
}

async function fetchEndpoint(fetcher: Fetcher, endpoint: string): Promise<{
  endpoint: StoreDropEndpointState;
  body: Record<string, unknown>;
}> {
  try {
    const response = await fetcher(endpoint, { headers: { accept: "application/json" } });
    const body = await readJsonResponse(response);
    const status = responseStatus(response, body);

    return {
      endpoint: endpointState(endpoint, status, response.status, responseMessage(response, body)),
      body: status === "available" ? body : {},
    };
  } catch (error) {
    return {
      endpoint: endpointState(endpoint, "error", null, error instanceof Error ? error.message : "Request failed."),
      body: {},
    };
  }
}

export function normalizeStoreDropReservation(value: unknown, dropIdFallback = ""): StoreDropReservation | null {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }

  const dropId = stringValue(
    findFirst(record, ["dropId", "drop_id", "storeDropId", "store_drop_id"]),
    dropIdFallback,
  );

  if (!dropId) {
    return null;
  }

  return {
    id: stringValue(findFirst(record, ["id", "reservationId", "reservation_id"]), "") || null,
    dropId,
    quantity: Math.max(1, integerValue(findFirst(record, ["quantity", "qty", "reservedQuantity", "reserved_quantity"])) ?? 1),
    status: stringValue(findFirst(record, ["status", "reservationStatus", "reservation_status"]), "active"),
    unpaidDemoIntent: booleanValue(findFirst(record, ["unpaidDemoIntent", "unpaid_demo_intent", "demoIntent", "demo_intent"]), true),
    createdAt: dateTimeValue(findFirst(record, ["createdAt", "created_at"])),
    updatedAt: dateTimeValue(findFirst(record, ["updatedAt", "updated_at"])),
    cancelledAt: dateTimeValue(findFirst(record, ["cancelledAt", "cancelled_at"])),
  };
}

export function normalizeStoreDrop(value: unknown, index = 0): StoreDrop {
  const record = asRecord(value);
  const merchant = firstObject(record, ["merchant", "merchantProfile", "merchant_profile", "store"]);
  const pickup = firstObject(record, ["pickup", "pickupWindow", "pickup_window"]);
  const availability = firstObject(record, ["quantity", "availability", "capacity"]);
  const price = firstObject(record, ["price", "demoPrice", "demo_price"]);
  const reservation = firstObject(record, [
    "currentHouseholdReservation",
    "current_household_reservation",
    "currentReservation",
    "current_reservation",
    "viewerReservation",
    "viewer_reservation",
    "householdReservation",
    "household_reservation",
    "myReservation",
    "my_reservation",
  ]);
  const id = stringValue(findFirst(record, ["id", "dropId", "drop_id", "storeDropId", "store_drop_id"]), `drop-${index}`);
  const totalQuantity = integerValue(
    findFirst(record, ["totalQuantity", "total_quantity", "initialQuantity", "initial_quantity"]) ??
      findFirst(availability, ["total", "totalQuantity", "quantity", "initialQuantity"]),
  );
  const reservedQuantity = integerValue(
    findFirst(record, ["reservedQuantity", "reserved_quantity", "activeReservationQuantity", "active_reservation_quantity"]) ??
      findFirst(availability, ["reserved", "reservedQuantity"]),
  );
  const explicitRemaining = integerValue(
    findFirst(record, ["remainingQuantity", "remaining_quantity", "availableQuantity", "available_quantity"]) ??
      findFirst(availability, ["remaining", "remainingQuantity", "availableQuantity", "available"]),
  );

  return {
    id,
    title: stringValue(findFirst(record, ["title", "name", "dropTitle", "drop_title"]), "Surplus drop"),
    description: stringValue(findFirst(record, ["description", "summary", "details", "notes"]), "") || null,
    status: stringValue(findFirst(record, ["status", "dropStatus", "drop_status"]), "available"),
    merchantDisplayName: stringValue(
      findFirst(record, ["merchantDisplayName", "merchant_display_name", "merchantName", "merchant_name"]) ??
        findFirst(merchant, ["displayName", "display_name", "name"]),
      "Local merchant",
    ),
    coarsePickupArea: coarsePickupArea(record, merchant, pickup),
    remainingQuantity: explicitRemaining ?? computedRemaining(totalQuantity, reservedQuantity),
    totalQuantity,
    reservedQuantity,
    pickupWindowStart: dateTimeValue(
      findFirst(record, ["pickupWindowStart", "pickup_window_start", "windowStart", "window_start"]) ??
        findFirst(pickup, ["start", "startsAt", "starts_at", "windowStart", "window_start", "pickupWindowStart"]),
    ),
    pickupWindowEnd: dateTimeValue(
      findFirst(record, ["pickupWindowEnd", "pickup_window_end", "windowEnd", "window_end"]) ??
        findFirst(pickup, ["end", "endsAt", "ends_at", "windowEnd", "window_end", "pickupWindowEnd"]),
    ),
    priceCents: centsValue(
      findFirst(record, ["priceCents", "price_cents", "pricePence", "price_pence", "displayPrice"]) ??
        findFirst(price, ["amountCents", "amount_cents", "priceCents", "price_cents"]),
    ),
    currency: stringValue(findFirst(record, ["currency"]) ?? findFirst(price, ["currency"]), "GBP"),
    safetyNotes: safetyNotes(record),
    currentReservation: normalizeStoreDropReservation(reservation, id),
    availableActions: normalizeActions(findFirst(record, ["availableActions", "available_actions", "actions"])),
  };
}

export async function loadStoreDropSnapshot(fetcher: Fetcher): Promise<StoreDropSnapshot> {
  const [dropsResponse, reservationsResponse] = await Promise.all([
    fetchEndpoint(fetcher, DROPS_ENDPOINT),
    fetchEndpoint(fetcher, RESERVATIONS_ENDPOINT),
  ]);
  const endpoints = [dropsResponse.endpoint, reservationsResponse.endpoint];
  const reservations = childArray(reservationsResponse.body, ["reservations", "storeDropReservations", "store_drop_reservations", "items"])
    .map((reservation) => normalizeStoreDropReservation(reservation))
    .filter((reservation): reservation is StoreDropReservation => reservation !== null);
  const reservationByDropId = new Map(
    reservations
      .filter((reservation) => isActiveReservationStatus(reservation.status))
      .map((reservation) => [reservation.dropId, reservation]),
  );
  const drops = childArray(dropsResponse.body, ["drops", "storeDrops", "store_drops", "items"])
    .map(normalizeStoreDrop)
    .map((drop) => ({
      ...drop,
      currentReservation: drop.currentReservation ?? reservationByDropId.get(drop.id) ?? null,
    }));
  const available = endpoints.filter((endpoint) => endpoint.status === "available").length;
  const errors = endpoints.filter((endpoint) => endpoint.status === "error").length;

  return {
    status: available === endpoints.length
      ? "available"
      : available > 0
        ? "partial"
        : errors > 0
          ? "error"
          : "unavailable",
    checkedAt: new Date().toISOString(),
    drops,
    reservations,
    endpoints,
    message: available > 0
      ? "Some surplus drop routes are live; missing CP7 routes are shown as unavailable."
      : "Surplus drop API routes are not installed yet.",
  };
}

export async function loadStoreDropDetail(fetcher: Fetcher, dropId: string): Promise<StoreDropDetailResult> {
  const endpoint = `${DROPS_ENDPOINT}/${encodeURIComponent(dropId)}`;
  const response = await fetchEndpoint(fetcher, endpoint);
  const dropRecord = firstObject(response.body, ["drop", "storeDrop", "store_drop"]);
  const drop = Object.keys(dropRecord).length > 0
    ? normalizeStoreDrop(dropRecord)
    : childArray(response.body, ["drops", "storeDrops", "store_drops"]).map(normalizeStoreDrop)[0] ?? null;

  return {
    status: response.endpoint.status,
    checkedAt: new Date().toISOString(),
    drop,
    endpoint: response.endpoint,
    message: response.endpoint.status === "available"
      ? null
      : "Drop detail route is not available yet; showing list state only.",
  };
}

export async function submitStoreDropReservation(
  fetcher: Fetcher,
  input: StoreDropReserveInput,
): Promise<StoreDropMutationResult> {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return validationResult(input.dropId, "Choose at least one item before reserving.");
  }

  return postJson(fetcher, `${DROPS_ENDPOINT}/${encodeURIComponent(input.dropId)}/reserve`, {
    quantity: Math.round(quantity),
    metadata: {
      unpaidDemoIntent: true,
      noPayment: true,
      source: "consumer_store_drops_ui",
    },
  }, input.dropId);
}

export async function cancelStoreDropReservation(fetcher: Fetcher, dropId: string): Promise<StoreDropMutationResult> {
  return postJson(fetcher, `${DROPS_ENDPOINT}/${encodeURIComponent(dropId)}/cancel-reservation`, {
    source: "consumer_store_drops_ui",
    unpaidDemoIntent: true,
  }, dropId);
}

async function postJson(
  fetcher: Fetcher,
  endpoint: string,
  payload: Record<string, unknown>,
  dropId: string | null,
): Promise<StoreDropMutationResult> {
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await readJsonResponse(response);
    const explicit = stringValue(body.status).toLowerCase();
    const status = response.ok && explicit !== "unavailable"
      ? "ok"
      : response.status === 404 || response.status === 501 || response.status === 503 || explicit === "unavailable"
        ? "unavailable"
        : "error";

    return {
      status,
      endpoint,
      httpStatus: response.status,
      message: responseMessage(response, body),
      dropId: mutationDropId(body, dropId),
    };
  } catch (error) {
    return {
      status: "error",
      endpoint,
      httpStatus: null,
      message: error instanceof Error ? error.message : "Request failed.",
      dropId,
    };
  }
}

export function storeDropsEndpointSummary(snapshot: StoreDropSnapshot | null): string {
  if (!snapshot) {
    return "Checking surplus drop routes.";
  }

  const live = snapshot.endpoints.filter((endpoint) => endpoint.status === "available").length;
  return `${live}/${snapshot.endpoints.length} surplus route${snapshot.endpoints.length === 1 ? "" : "s"} live`;
}

export function formatDropStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDropPrice(drop: Pick<StoreDrop, "priceCents" | "currency">): string {
  if (drop.priceCents === null) {
    return "Demo price not returned";
  }

  return `${new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: drop.currency || "GBP",
    maximumFractionDigits: drop.priceCents % 100 === 0 ? 0 : 2,
  }).format(drop.priceCents / 100)} demo display only`;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not returned";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function pickupWindowLabel(drop: Pick<StoreDrop, "pickupWindowStart" | "pickupWindowEnd">): string {
  return `${formatDateTime(drop.pickupWindowStart)} to ${formatDateTime(drop.pickupWindowEnd)}`;
}

export function isActiveReservationStatus(status: string): boolean {
  return ["active", "reserved", "confirmed", "pending"].includes(status.toLowerCase());
}

export function isDropExpired(drop: Pick<StoreDrop, "status" | "pickupWindowEnd">, now = new Date()): boolean {
  if (["expired", "closed"].includes(drop.status.toLowerCase())) {
    return true;
  }

  if (!drop.pickupWindowEnd) {
    return false;
  }

  const endsAt = new Date(drop.pickupWindowEnd);
  return !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime();
}

export function isDropSoldOut(drop: Pick<StoreDrop, "status" | "remainingQuantity">): boolean {
  return drop.status.toLowerCase() === "sold_out" || drop.remainingQuantity === 0;
}

export function canReserveDrop(drop: StoreDrop, now = new Date()): boolean {
  const status = drop.status.toLowerCase();
  const reservableStatus = ["available", "active", "published", "scheduled"].includes(status);
  const hasCapacity = drop.remainingQuantity === null || drop.remainingQuantity > 0;
  return reservableStatus && hasCapacity && !isDropExpired(drop, now) && !drop.currentReservation;
}

function computedRemaining(totalQuantity: number | null, reservedQuantity: number | null): number | null {
  if (totalQuantity === null || reservedQuantity === null) {
    return null;
  }

  return Math.max(0, totalQuantity - reservedQuantity);
}

function coarsePickupArea(
  record: Record<string, unknown>,
  merchant: Record<string, unknown>,
  pickup: Record<string, unknown>,
): string | null {
  return stringValue(
    findFirst(record, ["coarsePickupArea", "coarse_pickup_area", "pickupAreaLabel", "pickup_area_label", "areaLabel", "area_label", "neighbourhoodName"]) ??
      findFirst(merchant, ["coarsePickupArea", "coarse_pickup_area", "areaLabel", "area_label", "neighbourhoodName"]) ??
      findFirst(pickup, ["coarsePickupArea", "coarse_pickup_area", "areaLabel", "area_label"]),
    "",
  ) || null;
}

function safetyNotes(record: Record<string, unknown>): string[] {
  const safety = firstObject(record, ["safety", "safetyContract"]);
  const explicit = childArray(record, ["safetyNotes", "safety_notes", "consumerSafetyNotes", "consumer_safety_notes"])
    .map((note) => stringValue(note))
    .filter(Boolean)
    .slice(0, 4);

  if (explicit.length > 0) {
    return explicit;
  }

  const nested = [
    stringValue(findFirst(safety, ["notes"])),
    stringValue(findFirst(safety, ["notice"])),
  ].filter(Boolean);
  if (nested.length > 0) {
    return nested.slice(0, 4);
  }

  return [
    "Merchant-packed surplus; confirm condition at pickup.",
    "No freshness, ingredient, or allergen guarantee is made by UseBy.",
  ];
}

function normalizeActions(value: unknown): string[] {
  return asArray(value)
    .map((action) => stringValue(typeof action === "string" ? action : findFirst(asRecord(action), ["action", "type"])))
    .filter(Boolean);
}

function centsValue(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed === null) {
    return null;
  }

  if (typeof value === "string" && value.includes(".")) {
    return Math.round(parsed * 100);
  }

  return Math.round(parsed);
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "no") {
      return false;
    }
  }

  return fallback;
}

function mutationDropId(body: Record<string, unknown>, fallback: string | null): string | null {
  const nestedDrop = firstObject(body, ["drop", "storeDrop", "store_drop"]);
  return stringValue(
    findFirst(body, ["dropId", "drop_id", "storeDropId", "store_drop_id"]) ??
      findFirst(nestedDrop, ["id", "dropId", "drop_id", "storeDropId", "store_drop_id"]),
    fallback ?? "",
  ) || fallback;
}

function validationResult(dropId: string | null, message: string): StoreDropMutationResult {
  return {
    status: "error",
    endpoint: DROPS_ENDPOINT,
    httpStatus: null,
    message,
    dropId,
  };
}
