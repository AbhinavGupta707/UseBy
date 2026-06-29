import type {
  ExpiryBand,
  ExpiryEditInput,
  GroceryActionCard,
  GroceryEndpointState,
  GroceryInventoryItem,
  GroceryMatch,
  GroceryMutationResult,
  GrocerySnapshot,
  ManualGroceryInput,
  SafetyStatus,
  StorageState,
} from "./types";

type Fetcher = typeof fetch;

const SHELF_ENDPOINT = "/api/grocery/shelf";
const INVENTORY_ENDPOINT = "/api/grocery/inventory";
const ACTION_CARDS_ENDPOINT = "/api/grocery/action-cards";
const MATCHES_ENDPOINT = "/api/grocery/matches";

const IMPORT_ENDPOINTS = [
  "/api/grocery/receipt-imports",
  "/api/grocery/import-receipt",
  "/api/grocery/receipt",
] as const;

const EXPIRY_ENDPOINTS = [
  (itemId: string) => `/api/grocery/inventory/${encodeURIComponent(itemId)}`,
  (itemId: string) => `/api/grocery/items/${encodeURIComponent(itemId)}/expiry`,
  () => "/api/grocery/expiry",
] as const;

const expiryBands = new Set<ExpiryBand>(["expired", "today", "use_soon", "watch", "fresh", "unknown"]);
const storageStates = new Set<StorageState>(["sealed", "opened", "fridge", "freezer", "cupboard", "cooked"]);
const safetyStatuses = new Set<SafetyStatus>(["eligible", "restricted", "blocked", "unknown"]);

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

function dateValue(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value.slice(0, 10);
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

function endpointState(
  endpoint: string,
  status: GroceryEndpointState["status"],
  httpStatus: number | null,
  message: string,
): GroceryEndpointState {
  return { endpoint, status, httpStatus, message };
}

function classifyExpiryBand(record: Record<string, unknown>): ExpiryBand {
  const explicit = stringValue(findFirst(record, ["expiryBand", "expiry_band", "band"])).toLowerCase();
  if (expiryBands.has(explicit as ExpiryBand)) {
    return explicit as ExpiryBand;
  }

  const expiry = dateValue(findFirst(record, ["expiryDate", "expiry_date", "expiresAt", "expires_at", "useByDate", "use_by_date"]));
  if (!expiry) {
    return "unknown";
  }

  const today = new Date();
  const expiryDate = new Date(`${expiry}T12:00:00Z`);
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));
  const days = Math.ceil((expiryDate.getTime() - todayDate.getTime()) / 86_400_000);

  if (days < 0) {
    return "expired";
  }
  if (days === 0) {
    return "today";
  }
  if (days <= 3) {
    return "use_soon";
  }
  if (days <= 7) {
    return "watch";
  }

  return "fresh";
}

function normalizeSafety(value: unknown): SafetyStatus | string {
  const status = stringValue(value, "unknown").toLowerCase();
  return safetyStatuses.has(status as SafetyStatus) ? (status as SafetyStatus) : status;
}

function normalizeStorage(value: unknown): StorageState | string {
  const state = stringValue(value, "cupboard").toLowerCase();
  return storageStates.has(state as StorageState) ? (state as StorageState) : state;
}

export function normalizeInventoryItem(value: unknown, index = 0): GroceryInventoryItem {
  const record = asRecord(value);
  const metadata = asRecord(record.metadata);
  const expiryDate = dateValue(findFirst(record, [
    "expiryDate",
    "expiry_date",
    "confirmedExpiryDate",
    "confirmed_expiry_date",
    "useByDate",
    "use_by_date",
    "bestBeforeDate",
    "best_before_date",
    "expiresAt",
    "expires_at",
  ]));
  const confidence = numberValue(findFirst(record, ["expiryConfidence", "expiry_confidence", "confidence"]));
  const confirmed = findFirst(record, ["confirmedExpiryDate", "confirmed_expiry_date", "useByDate", "use_by_date"]);

  return {
    id: stringValue(findFirst(record, ["id", "itemId", "item_instance_id"]), `item-${index}`),
    name: stringValue(findFirst(record, ["name", "title", "itemName", "item_name"]), "Unnamed grocery item"),
    quantity: stringValue(findFirst(record, ["quantity", "qty"]), "1"),
    unit: stringValue(record.unit, "each"),
    storageState: normalizeStorage(findFirst(record, ["storageState", "storage_state"])),
    safetyStatus: normalizeSafety(findFirst(record, ["safetyStatus", "safety_status"])),
    itemState: stringValue(findFirst(record, ["itemState", "item_state", "state"]), "private"),
    expiryBand: classifyExpiryBand(record),
    expiryDate,
    expirySource: expiryDate ? (confirmed ? "confirmed" : "estimated") : "unknown",
    expiryConfidence: confidence,
    detail: stringValue(findFirst(record, ["detail", "description", "note"]) ?? metadata.note, "") || null,
  };
}

export function normalizeActionCard(value: unknown, index = 0): GroceryActionCard {
  const record = asRecord(value);
  const facts = asRecord(record.facts);

  return {
    id: stringValue(findFirst(record, ["id", "cardId", "action_card_id"]), `card-${index}`),
    type: stringValue(findFirst(record, ["type", "cardType", "card_type"]), "action"),
    title: stringValue(record.title, "Action needs recompute"),
    body: stringValue(findFirst(record, ["body", "detail", "description"]), "The backend did not return card copy."),
    rationale: stringValue(findFirst(record, ["rationale", "explanation", "reason"]) ?? facts.rationale, "Computed from current inventory when available."),
    priority: stringValue(record.priority, "medium"),
    safetyStatus: normalizeSafety(findFirst(record, ["safetyStatus", "safety_status"]) ?? facts.safetyStatus),
    status: stringValue(record.status, "active"),
    itemName: stringValue(findFirst(record, ["itemName", "item_name"]) ?? facts.item, "") || null,
  };
}

export function normalizeMatch(value: unknown, index = 0): GroceryMatch {
  const record = asRecord(value);
  const item = asRecord(record.item);
  const need = asRecord(record.need);

  return {
    id: stringValue(findFirst(record, ["id", "matchId", "match_id"]), `match-${index}`),
    itemName: stringValue(findFirst(record, ["itemName", "item_name"]) ?? item.name ?? item.title, "Available grocery"),
    needTitle: stringValue(findFirst(record, ["needTitle", "need_title"]) ?? need.title, "Neighbour need"),
    distanceMeters: numberValue(findFirst(record, ["distanceMeters", "distance_meters", "distanceM", "distance_m"])),
    score: numberValue(record.score),
    rationale: stringValue(findFirst(record, ["rationale", "explanation", "reason"]), "Match rationale was not returned."),
    safetyStatus: normalizeSafety(findFirst(record, ["safetyStatus", "safety_status"]) ?? item.safetyStatus),
    status: stringValue(record.status, "proposed"),
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return asRecord(await response.json().catch(() => ({})));
}

async function fetchEndpoint(fetcher: Fetcher, endpoint: string): Promise<{
  endpoint: GroceryEndpointState;
  body: Record<string, unknown>;
}> {
  try {
    const response = await fetcher(endpoint, { headers: { accept: "application/json" } });
    const body = await readJsonResponse(response);
    const message = stringValue(findFirst(body, ["message", "reason", "error"]), response.ok ? "available" : `HTTP ${response.status}`);
    const status = response.ok ? "available" : response.status === 404 ? "unavailable" : "error";

    return {
      endpoint: endpointState(endpoint, status, response.status, message),
      body: response.ok ? body : {},
    };
  } catch (error) {
    return {
      endpoint: endpointState(
        endpoint,
        "error",
        null,
        error instanceof Error ? error.message : "Request failed.",
      ),
      body: {},
    };
  }
}

function snapshotFromShelf(body: Record<string, unknown>, endpoint: GroceryEndpointState): GrocerySnapshot {
  const inventory = childArray(body, ["inventory", "items", "itemInstances", "item_instances"])
    .map(normalizeInventoryItem);
  const actionCards = childArray(body, ["actionCards", "action_cards", "cards"])
    .map(normalizeActionCard);
  const matches = childArray(body, ["matches", "foodMatches", "food_matches"])
    .map(normalizeMatch);

  return {
    status: endpoint.status,
    checkedAt: new Date().toISOString(),
    inventory,
    actionCards,
    matches,
    endpoints: [endpoint],
    message: endpoint.status === "available" ? stringValue(body.message, "") || null : endpoint.message,
  };
}

export async function loadGrocerySnapshot(fetcher: Fetcher): Promise<GrocerySnapshot> {
  const shelf = await fetchEndpoint(fetcher, SHELF_ENDPOINT);
  if (shelf.endpoint.status === "available") {
    return snapshotFromShelf(shelf.body, shelf.endpoint);
  }

  const [inventoryResponse, actionCardsResponse, matchesResponse] = await Promise.all([
    fetchEndpoint(fetcher, INVENTORY_ENDPOINT),
    fetchEndpoint(fetcher, ACTION_CARDS_ENDPOINT),
    fetchEndpoint(fetcher, MATCHES_ENDPOINT),
  ]);
  const endpoints = [
    shelf.endpoint,
    inventoryResponse.endpoint,
    actionCardsResponse.endpoint,
    matchesResponse.endpoint,
  ];
  const available = endpoints.filter((endpoint) => endpoint.status === "available").length;
  const errors = endpoints.filter((endpoint) => endpoint.status === "error").length;

  return {
    status: available > 0 ? "partial" : errors > 0 ? "error" : "unavailable",
    checkedAt: new Date().toISOString(),
    inventory: childArray(inventoryResponse.body, ["inventory", "items", "itemInstances", "item_instances"]).map(normalizeInventoryItem),
    actionCards: childArray(actionCardsResponse.body, ["actionCards", "action_cards", "cards"]).map(normalizeActionCard),
    matches: childArray(matchesResponse.body, ["matches", "foodMatches", "food_matches"]).map(normalizeMatch),
    endpoints,
    message: available > 0
      ? "Some grocery endpoints are live; missing routes are shown as unavailable."
      : "Grocery API routes are not installed yet.",
  };
}

async function postJson(
  fetcher: Fetcher,
  endpoint: string,
  method: "POST" | "PATCH",
  payload: Record<string, unknown>,
): Promise<GroceryMutationResult> {
  try {
    const response = await fetcher(endpoint, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await readJsonResponse(response);
    const message = stringValue(findFirst(body, ["message", "reason", "error"]), response.ok ? "Saved." : `HTTP ${response.status}`);

    return {
      status: response.ok ? "ok" : response.status === 404 ? "unavailable" : "error",
      endpoint,
      httpStatus: response.status,
      message,
    };
  } catch (error) {
    return {
      status: "error",
      endpoint,
      httpStatus: null,
      message: error instanceof Error ? error.message : "Request failed.",
    };
  }
}

export async function submitManualGrocery(fetcher: Fetcher, input: ManualGroceryInput): Promise<GroceryMutationResult> {
  const payload = {
    mode: "manual",
    source: "consumer_grocery_ui",
    receiptText: input.receiptLines,
    lines: input.receiptLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    items: [
      {
        title: input.itemName,
        quantity: input.quantity,
        unit: input.unit,
        storageState: input.storageState,
        expiryDate: input.expiryDate || null,
      },
    ].filter((item) => item.title.trim().length > 0),
  };

  let lastResult: GroceryMutationResult | null = null;
  for (const endpoint of IMPORT_ENDPOINTS) {
    const result = await postJson(fetcher, endpoint, "POST", payload);
    if (result.status !== "unavailable") {
      return result;
    }
    lastResult = result;
  }

  return lastResult ?? {
    status: "unavailable",
    endpoint: IMPORT_ENDPOINTS[0],
    httpStatus: 404,
    message: "Receipt/manual import route is not installed yet.",
  };
}

export async function submitExpiryEdit(fetcher: Fetcher, input: ExpiryEditInput): Promise<GroceryMutationResult> {
  const payload = {
    itemId: input.itemId,
    storageState: input.storageState,
    labelDate: input.expiryDate || null,
    expiryDate: input.expiryDate || null,
    safetyStatus: input.safetyStatus,
    source: "consumer_grocery_ui",
  };

  let lastResult: GroceryMutationResult | null = null;
  for (const [index, endpointForItem] of EXPIRY_ENDPOINTS.entries()) {
    const endpoint = endpointForItem(input.itemId);
    const result = await postJson(fetcher, endpoint, index === 0 ? "PATCH" : "POST", payload);
    if (result.status !== "unavailable") {
      return result;
    }
    lastResult = result;
  }

  return lastResult ?? {
    status: "unavailable",
    endpoint: "/api/grocery/expiry",
    httpStatus: 404,
    message: "Expiry edit route is not installed yet.",
  };
}

export function endpointSummary(snapshot: GrocerySnapshot | null): string {
  if (!snapshot) {
    return "Checking grocery routes.";
  }

  const live = snapshot.endpoints.filter((endpoint) => endpoint.status === "available").length;
  return `${live}/${snapshot.endpoints.length} grocery route${snapshot.endpoints.length === 1 ? "" : "s"} live`;
}

export function arrayFromUnknown(value: unknown): unknown[] {
  return asArray(value);
}
