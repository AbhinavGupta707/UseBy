import type {
  DemandPool,
  DemandPoolBid,
  DemandPoolCommitment,
  DemandPoolCommitmentInput,
  DemandPoolCreateInput,
  DemandPoolDetailResult,
  DemandPoolEndpointState,
  DemandPoolItem,
  DemandPoolMutationResult,
  DemandPoolOrder,
  DemandPoolSnapshot,
} from "./types";

type Fetcher = typeof fetch;

const POOLS_ENDPOINT = "/api/demand-pools";
const ORDERS_ENDPOINT = "/api/demand-pools/orders";

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

function integerValue(value: unknown, fallback = 0): number {
  const parsed = numberValue(value);
  return parsed === null ? fallback : Math.max(0, Math.round(parsed));
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
  status: DemandPoolEndpointState["status"],
  httpStatus: number | null,
  message: string,
): DemandPoolEndpointState {
  return { endpoint, status, httpStatus, message };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return asRecord(await response.json().catch(() => ({})));
}

function responseStatus(response: Response, body: Record<string, unknown>): DemandPoolEndpointState["status"] {
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
  endpoint: DemandPoolEndpointState;
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

export function normalizeDemandPoolItem(value: unknown, index = 0): DemandPoolItem {
  const record = asRecord(value);
  return {
    id: stringValue(findFirst(record, ["id", "itemId", "item_id"]), "") || null,
    name: stringValue(findFirst(record, ["name", "title", "itemName", "item_name"]), `Requested item ${index + 1}`),
    quantity: stringValue(findFirst(record, ["quantity", "qty", "amount"]), "") || null,
    unit: stringValue(record.unit, "") || null,
  };
}

function normalizeCommitment(value: unknown, poolId: string): DemandPoolCommitment | null {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }

  return {
    id: stringValue(findFirst(record, ["id", "commitmentId", "commitment_id"]), "") || null,
    poolId,
    quantity: Math.max(1, integerValue(findFirst(record, ["quantity", "qty"]), 1)),
    maxPriceCents: centsValue(findFirst(record, ["maxPriceCents", "max_price_cents", "maxPriceIntentCents", "max_price_intent_cents", "maxPrice", "max_price"])),
    status: stringValue(findFirst(record, ["status", "commitmentStatus", "commitment_status"]), "active"),
    unpaidDemoIntent: booleanValue(findFirst(record, ["unpaidDemoIntent", "unpaid_demo_intent", "isDemoIntent", "is_demo_intent"]), true),
    createdAt: dateTimeValue(findFirst(record, ["createdAt", "created_at"])),
    updatedAt: dateTimeValue(findFirst(record, ["updatedAt", "updated_at"])),
  };
}

export function normalizeDemandPoolBid(value: unknown, index = 0): DemandPoolBid {
  const record = asRecord(value);
  const merchant = firstObject(record, ["merchant", "merchantProfile", "merchant_profile"]);

  return {
    id: stringValue(findFirst(record, ["id", "bidId", "bid_id"]), `bid-${index}`),
    merchantName: stringValue(findFirst(record, ["merchantName", "merchant_name"]) ?? findFirst(merchant, ["name", "displayName", "display_name"]), "Local merchant"),
    priceCents: centsValue(findFirst(record, ["priceCents", "price_cents", "unitPriceCents", "unit_price_cents", "price", "unitPrice", "unit_price"])),
    availableQuantity: numberValue(findFirst(record, ["availableQuantity", "available_quantity", "quantity", "capacity"])),
    pickupWindowStart: dateTimeValue(findFirst(record, ["pickupWindowStart", "pickup_window_start", "windowStart", "window_start"])),
    pickupWindowEnd: dateTimeValue(findFirst(record, ["pickupWindowEnd", "pickup_window_end", "windowEnd", "window_end"])),
    substitutionPolicy: stringValue(findFirst(record, ["substitutionPolicy", "substitution_policy", "substitutions"]), "") || null,
    fulfilmentTerms: stringValue(findFirst(record, ["fulfilmentTerms", "fulfillmentTerms", "fulfilment_terms", "fulfillment_terms", "terms"]), "") || null,
    status: stringValue(findFirst(record, ["status", "bidStatus", "bid_status"]), "submitted"),
    scoreLabel: scoreLabel(findFirst(record, ["score", "scoreLabel", "score_label"])),
    safeToShow: booleanValue(findFirst(record, ["safeToShow", "safe_to_show", "visibleToConsumers", "visible_to_consumers"]), true),
  };
}

export function normalizeDemandPoolOrder(value: unknown, index = 0): DemandPoolOrder {
  const record = asRecord(value);
  const merchant = firstObject(record, ["merchant", "merchantProfile", "merchant_profile"]);

  return {
    id: stringValue(findFirst(record, ["id", "orderId", "order_id", "pickupTaskId", "pickup_task_id"]), `order-${index}`),
    poolId: stringValue(findFirst(record, ["poolId", "pool_id", "demandPoolId", "demand_pool_id"]), ""),
    status: stringValue(findFirst(record, ["status", "orderStatus", "order_status", "pickupStatus", "pickup_status"]), "pending"),
    merchantName: stringValue(findFirst(record, ["merchantName", "merchant_name"]) ?? findFirst(merchant, ["name", "displayName", "display_name"]), "") || null,
    quantity: numberValue(findFirst(record, ["quantity", "qty"])),
    totalPriceCents: centsValue(findFirst(record, ["totalPriceCents", "total_price_cents", "priceCents", "price_cents", "totalPrice", "total_price"])),
    pickupWindowStart: dateTimeValue(findFirst(record, ["pickupWindowStart", "pickup_window_start", "windowStart", "window_start"])),
    pickupWindowEnd: dateTimeValue(findFirst(record, ["pickupWindowEnd", "pickup_window_end", "windowEnd", "window_end"])),
    pickupAreaLabel: stringValue(findFirst(record, ["pickupAreaLabel", "pickup_area_label", "pickupArea", "pickup_area"]), "") || null,
    pickupHint: stringValue(findFirst(record, ["pickupHint", "pickup_hint", "pickupLocationHint", "pickup_location_hint"]), "") || null,
    readyAt: dateTimeValue(findFirst(record, ["readyAt", "ready_at"])),
    collectedAt: dateTimeValue(findFirst(record, ["collectedAt", "collected_at"])),
  };
}

export function normalizeDemandPool(value: unknown, index = 0): DemandPool {
  const record = asRecord(value);
  const id = stringValue(findFirst(record, ["id", "poolId", "pool_id", "demandPoolId", "demand_pool_id"]), `pool-${index}`);
  const progress = firstObject(record, ["progress", "threshold"]);
  const currentUserCommitment = firstObject(record, [
    "currentUserCommitment",
    "current_user_commitment",
    "viewerCommitment",
    "viewer_commitment",
    "myCommitment",
    "my_commitment",
  ]);
  const winningBidRecord = firstObject(record, ["winningBid", "winning_bid", "awardedBid", "awarded_bid"]);

  return {
    id,
    title: stringValue(findFirst(record, ["title", "name"]), "Neighbourhood demand pool"),
    description: stringValue(findFirst(record, ["description", "summary", "detail"]), "") || null,
    status: stringValue(findFirst(record, ["status", "poolStatus", "pool_status"]), "gathering"),
    thresholdQuantity: Math.max(1, integerValue(findFirst(record, ["thresholdQuantity", "threshold_quantity", "targetQuantity", "target_quantity"]) ?? progress.target, 1)),
    committedQuantity: integerValue(findFirst(record, ["committedQuantity", "committed_quantity", "currentQuantity", "current_quantity", "totalQuantity", "total_quantity"]) ?? progress.current, 0),
    householdCount: integerValue(findFirst(record, ["householdCount", "household_count", "committedHouseholds", "committed_households"]) ?? progress.households, 0),
    closesAt: dateTimeValue(findFirst(record, ["closesAt", "closes_at", "closeAt", "close_at", "biddingEndsAt", "bidding_ends_at"])),
    maxPriceCents: centsValue(findFirst(record, ["maxPriceCents", "max_price_cents", "maxPriceIntentCents", "max_price_intent_cents", "maxPrice", "max_price"])),
    pickupRadiusMeters: numberValue(findFirst(record, ["pickupRadiusMeters", "pickup_radius_meters", "radiusMeters", "radius_meters"])),
    pickupAreaLabel: stringValue(findFirst(record, ["pickupAreaLabel", "pickup_area_label", "pickupArea", "pickup_area", "areaLabel", "area_label"]), "") || null,
    items: childArray(record, ["items", "requestedItems", "requested_items", "lines"]).map(normalizeDemandPoolItem),
    currentUserCommitment: normalizeCommitment(currentUserCommitment, id),
    merchantBids: childArray(record, ["merchantBids", "merchant_bids", "bids"]).map(normalizeDemandPoolBid),
    winningBid: Object.keys(winningBidRecord).length > 0 ? normalizeDemandPoolBid(winningBidRecord) : null,
    orders: childArray(record, ["orders", "poolOrders", "pool_orders", "pickups", "pickupTasks", "pickup_tasks"]).map(normalizeDemandPoolOrder),
    availableActions: normalizeActions(findFirst(record, ["availableActions", "available_actions", "actions"])),
  };
}

export async function loadDemandPoolSnapshot(fetcher: Fetcher): Promise<DemandPoolSnapshot> {
  const [poolsResponse, ordersResponse] = await Promise.all([
    fetchEndpoint(fetcher, POOLS_ENDPOINT),
    fetchEndpoint(fetcher, ORDERS_ENDPOINT),
  ]);
  const endpoints = [poolsResponse.endpoint, ordersResponse.endpoint];
  const pools = childArray(poolsResponse.body, ["pools", "demandPools", "demand_pools", "items"]).map(normalizeDemandPool);
  const orders = childArray(ordersResponse.body, ["orders", "poolOrders", "pool_orders", "pickups", "pickupTasks", "pickup_tasks"]).map(normalizeDemandPoolOrder);
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
    pools,
    orders,
    endpoints,
    message: available > 0
      ? "Some DemandPool routes are live; missing CP6 routes are shown as unavailable."
      : "DemandPool API routes are not installed yet.",
  };
}

export async function loadDemandPoolDetail(fetcher: Fetcher, poolId: string): Promise<DemandPoolDetailResult> {
  const endpoint = `${POOLS_ENDPOINT}/${encodeURIComponent(poolId)}`;
  const response = await fetchEndpoint(fetcher, endpoint);
  const poolRecord = firstObject(response.body, ["pool", "demandPool", "demand_pool"]);
  const pool = Object.keys(poolRecord).length > 0
    ? normalizeDemandPool(poolRecord)
    : childArray(response.body, ["pools", "demandPools", "demand_pools"]).map(normalizeDemandPool)[0] ?? null;

  return {
    status: response.endpoint.status,
    checkedAt: new Date().toISOString(),
    pool,
    endpoint: response.endpoint,
    message: response.endpoint.status === "available"
      ? null
      : "Pool detail route is not available yet; showing list state only.",
  };
}

export async function submitDemandPoolCommitment(
  fetcher: Fetcher,
  input: DemandPoolCommitmentInput,
): Promise<DemandPoolMutationResult> {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return validationResult(input.poolId, "Choose at least one bundle before committing.");
  }

  const maxPriceCents = parseMoneyToCents(input.maxPrice);
  if (maxPriceCents === null || maxPriceCents < 1) {
    return validationResult(input.poolId, "Enter a positive max-price intent.");
  }

  return postJson(fetcher, `${POOLS_ENDPOINT}/${encodeURIComponent(input.poolId)}/commit`, {
    quantity: Math.round(quantity),
    maxPriceCents,
    maxPriceIntentCents: maxPriceCents,
    unpaidDemoIntent: true,
    source: "consumer_demand_pool_ui",
  }, input.poolId);
}

export async function cancelDemandPoolCommitment(fetcher: Fetcher, poolId: string): Promise<DemandPoolMutationResult> {
  return postJson(fetcher, `${POOLS_ENDPOINT}/${encodeURIComponent(poolId)}/cancel-commitment`, {
    source: "consumer_demand_pool_ui",
  }, poolId);
}

export async function submitDemandPoolCreate(
  fetcher: Fetcher,
  input: DemandPoolCreateInput,
): Promise<DemandPoolMutationResult> {
  if (input.title.trim().length < 3) {
    return validationResult(null, "Name the pool before creating it.");
  }

  const targetQuantity = Number(input.targetQuantity);
  if (!Number.isFinite(targetQuantity) || targetQuantity < 2) {
    return validationResult(null, "Set a target threshold of at least two bundles.");
  }

  const maxPriceCents = parseMoneyToCents(input.maxPrice);
  if (maxPriceCents === null || maxPriceCents < 1) {
    return validationResult(null, "Enter a positive max-price intent.");
  }

  const pickupRadiusMeters = Math.max(100, Math.round((Number(input.pickupRadius) || 1) * 1000));
  const requestedItems = input.requestedItems
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name, quantity: "1", unit: "bundle item" }));

  if (requestedItems.length === 0) {
    return validationResult(null, "Add at least one requested item.");
  }

  return postJson(fetcher, POOLS_ENDPOINT, {
    title: input.title.trim(),
    requestedItems,
    thresholdQuantity: Math.round(targetQuantity),
    maxPriceCents,
    maxPriceIntentCents: maxPriceCents,
    pickupRadiusMeters,
    pickupAreaLabel: input.pickupArea.trim() || null,
    closesAt: input.closesAt || null,
    unpaidDemoIntent: true,
    source: "consumer_demand_pool_ui",
  }, null);
}

async function postJson(
  fetcher: Fetcher,
  endpoint: string,
  payload: Record<string, unknown>,
  poolId: string | null,
): Promise<DemandPoolMutationResult> {
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
      poolId: stringValue(findFirst(body, ["poolId", "pool_id", "demandPoolId", "demand_pool_id"]), poolId ?? "") || poolId,
    };
  } catch (error) {
    return {
      status: "error",
      endpoint,
      httpStatus: null,
      message: error instanceof Error ? error.message : "Request failed.",
      poolId,
    };
  }
}

export function demandPoolsEndpointSummary(snapshot: DemandPoolSnapshot | null): string {
  if (!snapshot) {
    return "Checking DemandPool routes.";
  }

  const live = snapshot.endpoints.filter((endpoint) => endpoint.status === "available").length;
  return `${live}/${snapshot.endpoints.length} DemandPool route${snapshot.endpoints.length === 1 ? "" : "s"} live`;
}

export function formatPoolStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatMoney(cents: number | null): string {
  if (cents === null) {
    return "Not returned";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
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

export function poolProgress(pool: DemandPool): number {
  if (pool.thresholdQuantity <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((pool.committedQuantity / pool.thresholdQuantity) * 100)));
}

function parseMoneyToCents(value: string): number | null {
  const normalized = value.replace(/gbp/gi, "").replace(/[,\s]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
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

function scoreLabel(value: unknown): string | null {
  const explicit = stringValue(value);
  if (explicit) {
    return explicit;
  }

  const numeric = numberValue(value);
  return numeric === null ? null : `${Math.round(numeric * 100)} pts`;
}

function normalizeActions(value: unknown): string[] {
  return asArray(value)
    .map((action) => stringValue(action))
    .filter(Boolean);
}

function validationResult(poolId: string | null, message: string): DemandPoolMutationResult {
  return {
    status: "error",
    endpoint: POOLS_ENDPOINT,
    httpStatus: null,
    message,
    poolId,
  };
}
