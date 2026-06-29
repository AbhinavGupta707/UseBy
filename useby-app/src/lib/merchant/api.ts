import type {
  MerchantBid,
  MerchantBidInput,
  MerchantDemandPool,
  MerchantEndpointState,
  MerchantMutationResult,
  MerchantPickup,
  MerchantPickupActionInput,
  MerchantSnapshot,
} from "./types";

type Fetcher = typeof fetch;

const POOLS_ENDPOINT = "/api/merchant/demand-pools";
const BIDS_ENDPOINT = "/api/merchant/bids";
const PICKUPS_ENDPOINT = "/api/merchant/pickups";

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
  status: MerchantEndpointState["status"],
  httpStatus: number | null,
  message: string,
): MerchantEndpointState {
  return { endpoint, status, httpStatus, message };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return asRecord(await response.json().catch(() => ({})));
}

function responseStatus(response: Response, body: Record<string, unknown>): MerchantEndpointState["status"] {
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
  endpoint: MerchantEndpointState;
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

export function normalizeMerchantPool(value: unknown, index = 0): MerchantDemandPool {
  const record = asRecord(value);
  const item = firstObject(record, ["item", "catalogItem", "catalog_item"]);
  const demand = firstObject(record, ["demand", "summary", "aggregateDemand", "aggregate_demand"]);
  const location = firstObject(record, ["location", "area", "neighbourhood"]);
  const merchantBid = firstObject(record, ["merchantBid", "merchant_bid"]);
  const status = stringValue(findFirst(record, ["status", "poolStatus", "pool_status"]), "gathering");
  const committedHouseholds = numberValue(
    findFirst(record, ["committedHouseholds", "committed_households", "householdCount", "household_count"]) ??
      findFirst(demand, ["households", "committedHouseholds"]),
  );
  const committedQuantity = numberValue(
    findFirst(record, ["committedQuantity", "committed_quantity", "quantity"]) ??
      findFirst(demand, ["quantity", "committedQuantity"]),
  );
  const thresholdHouseholds = numberValue(findFirst(record, ["thresholdHouseholds", "threshold_households"]));
  const thresholdQuantity = numberValue(findFirst(record, ["thresholdQuantity", "threshold_quantity"]));
  const unit = stringValue(findFirst(record, ["unit"]) ?? findFirst(item, ["unit"]), "each");
  const requestedItems = childArray(record, ["requestedItems", "requested_items", "items"])
    .map((entry) => stringValue(typeof entry === "string" ? entry : findFirst(asRecord(entry), ["name", "title"])))
    .filter(Boolean);

  return {
    id: stringValue(findFirst(record, ["id", "poolId", "pool_id"]), `pool-${index}`),
    title: stringValue(findFirst(record, ["title", "name"]) ?? findFirst(item, ["name", "title"]), "Demand pool"),
    description: stringValue(findFirst(record, ["description", "notes"]), "") || null,
    status,
    category: stringValue(findFirst(record, ["category"]) ?? findFirst(item, ["category"]), "") || null,
    unit,
    thresholdQuantity,
    committedQuantity,
    thresholdHouseholds,
    committedHouseholds,
    closesAt: dateTimeValue(findFirst(record, ["closesAt", "closes_at", "closeAt", "close_at"])),
    coarseArea: stringValue(
      findFirst(record, ["coarseArea", "coarse_area", "areaLabel", "area_label", "neighbourhoodName"]) ??
        findFirst(location, ["label", "name", "coarseArea"]),
      "",
    ) || null,
    demandSummary: demandSummary(committedHouseholds, thresholdHouseholds, committedQuantity, thresholdQuantity, unit),
    requestedItems,
    maxPriceLabel: priceLabel(
      numberValue(findFirst(record, ["maxPriceCentsPerHousehold", "max_price_cents_per_household", "maxPriceCents", "max_price_cents", "maxPricePence", "max_price_pence"])),
      stringValue(findFirst(record, ["currency"]), "GBP"),
    ),
    bidStatus: stringValue(findFirst(record, ["bidStatus", "bid_status", "merchantBidStatus"]) ?? findFirst(merchantBid, ["status"]), "") || null,
  };
}

export function normalizeMerchantBid(value: unknown, index = 0): MerchantBid {
  const record = asRecord(value);
  const pool = firstObject(record, ["pool", "demandPool", "demand_pool"]);

  return {
    id: stringValue(findFirst(record, ["id", "bidId", "bid_id"]), `bid-${index}`),
    poolId: stringValue(findFirst(record, ["poolId", "pool_id", "demandPoolId", "demand_pool_id"]) ?? pool.id, "") || null,
    poolTitle: stringValue(findFirst(record, ["poolTitle", "pool_title"]) ?? findFirst(pool, ["title", "name"]), "Demand pool"),
    status: stringValue(findFirst(record, ["status", "bidStatus", "bid_status"]), "submitted"),
    priceLabel: priceLabel(
      numberValue(findFirst(record, ["priceCents", "price_cents", "pricePence", "price_pence"])),
      stringValue(findFirst(record, ["currency"]), "GBP"),
    ) ?? "Price not returned",
    availableQuantity: numberValue(findFirst(record, ["availableQuantity", "available_quantity", "quantity"])),
    minQuantity: numberValue(findFirst(record, ["minQuantity", "min_quantity"])),
    pickupWindowStart: dateTimeValue(findFirst(record, ["pickupWindowStart", "pickup_window_start"])),
    pickupWindowEnd: dateTimeValue(findFirst(record, ["pickupWindowEnd", "pickup_window_end"])),
    score: numberValue(findFirst(record, ["score", "bidScore", "bid_score"])),
    terms: stringValue(findFirst(record, ["terms", "fulfilmentTerms", "fulfillmentTerms", "substitutionPolicy"]), "") || null,
    submittedAt: dateTimeValue(findFirst(record, ["submittedAt", "submitted_at", "createdAt", "created_at"])),
  };
}

export function normalizeMerchantPickup(value: unknown, index = 0): MerchantPickup {
  const record = asRecord(value);
  const pool = firstObject(record, ["pool", "demandPool", "demand_pool"]);
  const household = firstObject(record, ["household", "customer", "commitmentHousehold"]);
  const order = firstObject(record, ["order", "poolOrder", "pool_order"]);
  const status = stringValue(findFirst(record, ["status", "pickupStatus", "pickup_status"]) ?? order.status, "awarded");

  return {
    id: stringValue(findFirst(record, ["id", "pickupId", "pickup_id"]), `pickup-${index}`),
    orderId: stringValue(findFirst(record, ["orderId", "order_id"]) ?? order.id, `order-${index}`),
    poolId: stringValue(findFirst(record, ["poolId", "pool_id", "demandPoolId", "demand_pool_id"]) ?? pool.id, "") || null,
    poolTitle: stringValue(findFirst(record, ["poolTitle", "pool_title"]) ?? findFirst(pool, ["title", "name"]), "Awarded pool"),
    status,
    householdLabel: stringValue(
      findFirst(record, ["householdLabel", "household_label", "customerLabel", "customer_label"]) ??
        findFirst(household, ["publicLabel", "public_label", "label", "displayName", "name"]),
      "Household",
    ),
    coarseArea: stringValue(
      findFirst(record, ["coarseArea", "coarse_area", "areaLabel", "area_label"]) ??
        findFirst(household, ["coarseLocationLabel", "coarse_location_label", "coarseArea", "coarseLocation", "area"]),
      "",
    ) || null,
    quantity: numberValue(findFirst(record, ["quantity"]) ?? order.quantity),
    unit: stringValue(findFirst(record, ["unit"]) ?? order.unit, "each"),
    pickupWindowStart: dateTimeValue(findFirst(record, ["pickupWindowStart", "pickup_window_start"])),
    pickupWindowEnd: dateTimeValue(findFirst(record, ["pickupWindowEnd", "pickup_window_end"])),
    readyAt: dateTimeValue(findFirst(record, ["readyAt", "ready_at"])),
    collectedAt: dateTimeValue(findFirst(record, ["collectedAt", "collected_at"])),
    availableActions: normalizePickupActions(findFirst(record, ["availableActions", "available_actions", "actions"]), status),
  };
}

function normalizePickupActions(value: unknown, status: string): string[] {
  const explicit = asArray(value)
    .map((action) => stringValue(typeof action === "string" ? action : findFirst(asRecord(action), ["action", "type"])))
    .filter(Boolean);

  if (explicit.length > 0) {
    return explicit;
  }

  if (["awarded", "created", "pending", "scheduled"].includes(status)) {
    return ["ready"];
  }

  if (["ready", "ready_for_pickup"].includes(status)) {
    return ["collected"];
  }

  return [];
}

function priceLabel(value: number | null, currency = "GBP"): string | null {
  if (value === null) {
    return null;
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      currency,
      style: "currency",
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toFixed(2)}`;
  }
}

function demandSummary(
  committedHouseholds: number | null,
  thresholdHouseholds: number | null,
  committedQuantity: number | null,
  thresholdQuantity: number | null,
  unit: string,
): string {
  const households = committedHouseholds === null
    ? "households not returned"
    : thresholdHouseholds === null
      ? `${committedHouseholds} households`
      : `${committedHouseholds}/${thresholdHouseholds} households`;
  const quantity = committedQuantity === null
    ? "quantity not returned"
    : thresholdQuantity === null
      ? `${committedQuantity} ${unit}`
      : `${committedQuantity}/${thresholdQuantity} ${unit}`;

  return `${households}, ${quantity}`;
}

async function postJson(
  fetcher: Fetcher,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<MerchantMutationResult> {
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
    const status = responseStatus(response, body);
    const entity = firstObject(body, ["bid", "pickup", "order", "result"]);

    return {
      status: status === "available" ? "ok" : status === "unavailable" ? "unavailable" : "error",
      endpoint,
      httpStatus: response.status,
      message: responseMessage(response, body),
      entityId: stringValue(findFirst(body, ["id", "bidId", "orderId", "pickupId"]) ?? findFirst(entity, ["id", "orderId", "order_id", "pickupTaskId", "pickup_task_id"]), "") || null,
    };
  } catch (error) {
    return {
      status: "error",
      endpoint,
      httpStatus: null,
      message: error instanceof Error ? error.message : "Request failed.",
      entityId: null,
    };
  }
}

export async function loadMerchantSnapshot(fetcher: Fetcher): Promise<MerchantSnapshot> {
  const [poolsResponse, bidsResponse, pickupsResponse] = await Promise.all([
    fetchEndpoint(fetcher, POOLS_ENDPOINT),
    fetchEndpoint(fetcher, BIDS_ENDPOINT),
    fetchEndpoint(fetcher, PICKUPS_ENDPOINT),
  ]);
  const pools = childArray(poolsResponse.body, ["pools", "demandPools", "demand_pools", "items", "results"])
    .map(normalizeMerchantPool);
  const bids = childArray(bidsResponse.body, ["bids", "merchantBids", "merchant_bids", "items", "results"])
    .map(normalizeMerchantBid);
  const pickups = childArray(pickupsResponse.body, ["pickups", "orders", "pickupTasks", "pickup_tasks", "items", "results"])
    .map(normalizeMerchantPickup);
  const endpoints = [poolsResponse.endpoint, bidsResponse.endpoint, pickupsResponse.endpoint];

  return {
    status: summarizeStatus(endpoints),
    checkedAt: new Date().toISOString(),
    pools,
    bids,
    pickups,
    summary: {
      activePools: pools.filter((pool) => ["gathering", "threshold_met", "bidding"].includes(pool.status)).length,
      committedHouseholds: pools.reduce((sum, pool) => sum + (pool.committedHouseholds ?? 0), 0),
      committedQuantity: pools.reduce((sum, pool) => sum + (pool.committedQuantity ?? 0), 0),
      submittedBids: bids.filter((bid) => bid.status === "submitted").length,
      awardedPickups: pickups.length,
    },
    endpoints,
    message: endpoints.every((endpoint) => endpoint.status === "available")
      ? "Merchant routes are live."
      : "Merchant DemandPool routes are not installed or are unavailable in this environment.",
  };
}

export async function submitMerchantBid(fetcher: Fetcher, input: MerchantBidInput): Promise<MerchantMutationResult> {
  return postJson(fetcher, BIDS_ENDPOINT, {
    demandPoolId: input.poolId,
    poolId: input.poolId,
    priceCents: input.priceCents,
    availableQuantity: input.availableQuantity,
    minQuantity: input.minQuantity,
    pickupWindowStart: input.pickupWindowStart || null,
    pickupWindowEnd: input.pickupWindowEnd || null,
    terms: input.terms,
    substitutionPolicy: input.substitutionPolicy,
    fulfilmentNotes: input.fulfilmentNotes,
    source: "merchant_portal",
  });
}

export async function transitionMerchantPickup(
  fetcher: Fetcher,
  input: MerchantPickupActionInput,
): Promise<MerchantMutationResult> {
  const endpoint = `${PICKUPS_ENDPOINT}/${encodeURIComponent(input.orderId)}/${input.action}`;

  return postJson(fetcher, endpoint, {
    source: "merchant_portal",
  });
}

export function merchantEndpointSummary(snapshot: MerchantSnapshot | null): string {
  if (!snapshot) {
    return "Checking merchant routes.";
  }

  const live = snapshot.endpoints.filter((endpoint) => endpoint.status === "available").length;
  return `${live}/${snapshot.endpoints.length} merchant routes live`;
}

export function formatMerchantStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function summarizeStatus(endpoints: MerchantEndpointState[]): MerchantSnapshot["status"] {
  if (endpoints.every((endpoint) => endpoint.status === "available")) {
    return "available";
  }
  if (endpoints.some((endpoint) => endpoint.status === "error")) {
    return endpoints.some((endpoint) => endpoint.status === "available") ? "partial" : "error";
  }
  if (endpoints.some((endpoint) => endpoint.status === "available")) {
    return "partial";
  }

  return "unavailable";
}
