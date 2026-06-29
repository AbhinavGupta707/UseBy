import type {
  LendingActionInput,
  LendingActorRole,
  LendingEndpointState,
  LendingLifecycleStatus,
  LendingListing,
  LendingMutationResult,
  LendingParty,
  LendingRequest,
  LendingRequestInput,
  LendingReviewInput,
  LendingSnapshot,
} from "./types";

type Fetcher = typeof fetch;

const LISTINGS_ENDPOINT = "/api/lending/listings";
const REQUESTS_ENDPOINT = "/api/lending/requests";
const REQUEST_ENDPOINT = "/api/lending/request";

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
  status: LendingEndpointState["status"],
  httpStatus: number | null,
  message: string,
): LendingEndpointState {
  return { endpoint, status, httpStatus, message };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return asRecord(await response.json().catch(() => ({})));
}

function responseStatus(response: Response, body: Record<string, unknown>): LendingEndpointState["status"] {
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
  endpoint: LendingEndpointState;
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

export function normalizeLendingListing(value: unknown, index = 0): LendingListing {
  const record = asRecord(value);
  const item = firstObject(record, ["item", "itemInstance", "item_instance", "listing"]);
  const owner = firstObject(record, ["owner", "ownerHousehold", "owner_household"]);
  const terms = firstObject(record, ["terms", "lendingTerms", "lending_terms"]);
  const availability = firstObject(record, ["availability", "availabilityWindow", "availability_window"]);
  const id = stringValue(findFirst(record, ["id", "listingId", "listing_id"]), `listing-${index}`);
  const itemId = stringValue(findFirst(record, ["itemInstanceId", "item_instance_id", "itemId", "item_id"]) ?? item.id, "") || null;
  const title = stringValue(findFirst(record, ["title", "name", "itemName", "item_name"]) ?? findFirst(item, ["title", "name"]), "Lendable item");

  return {
    id,
    itemId,
    title,
    category: stringValue(findFirst(record, ["category"]) ?? findFirst(item, ["category"]), "household"),
    size: stringValue(findFirst(record, ["size", "sizeLabel", "size_label"]) ?? findFirst(item, ["size", "sizeLabel"]), "") || null,
    condition: stringValue(findFirst(record, ["condition", "conditionLabel", "condition_label"]) ?? findFirst(item, ["condition", "conditionLabel"]), "") || null,
    availabilityLabel: normalizeAvailabilityLabel(record, availability),
    terms: stringValue(findFirst(record, ["terms", "termsSummary", "terms_summary", "returnTerms", "return_terms"]) ?? terms.summary, "") || null,
    cleaningNotes: stringValue(findFirst(record, ["cleaningNotes", "cleaning_notes"]) ?? terms.cleaningNotes ?? terms.cleaning_notes, "") || null,
    returnExpectations: stringValue(findFirst(record, ["returnExpectations", "return_expectations"]) ?? terms.returnExpectations ?? terms.return_expectations, "") || null,
    pickupHint: stringValue(findFirst(record, ["pickupHint", "pickup_hint"]) ?? terms.pickupHint ?? terms.pickup_hint, "") || null,
    depositPreference: stringValue(findFirst(record, ["depositPreference", "deposit_preference"]) ?? terms.depositPreference ?? terms.deposit_preference, "") || null,
    owner: normalizeParty(owner, "Owner household"),
    distanceLabel: normalizeDistanceLabel(findFirst(record, ["distanceLabel", "distance_label", "distanceMeters", "distance_meters"])),
    status: stringValue(findFirst(record, ["status", "itemState", "item_state", "listingState", "listing_state"]), "listed"),
  };
}

export function normalizeLendingRequest(value: unknown, index = 0): LendingRequest {
  const record = asRecord(value);
  const item = firstObject(record, ["item", "itemInstance", "item_instance", "listing"]);
  const owner = firstObject(record, ["owner", "ownerHousehold", "owner_household"]);
  const borrower = firstObject(record, ["borrower", "requester", "receiver", "borrowerHousehold", "requesterHousehold"]);
  const handoff = firstObject(record, ["handoff", "handoffState"]);
  const terms = firstObject(record, ["terms", "lendingTerms", "lending_terms"]);
  const review = firstObject(record, ["review"]);
  const status = stringValue(findFirst(record, ["status", "bookingStatus", "booking_status"]), "requested") as LendingLifecycleStatus;

  return {
    id: stringValue(findFirst(record, ["id", "bookingId", "booking_id", "requestId", "request_id"]), `request-${index}`),
    status,
    viewerRole: normalizeRole(findFirst(record, ["viewerRole", "viewer_role", "actorRole", "actor_role"])),
    listingId: stringValue(findFirst(record, ["listingId", "listing_id"]), "") || null,
    item: {
      id: stringValue(findFirst(record, ["itemInstanceId", "item_instance_id", "itemId", "item_id"]) ?? item.id, "") || null,
      title: stringValue(findFirst(record, ["itemName", "item_name", "title", "name"]) ?? findFirst(item, ["title", "name"]), "Lending request"),
      category: stringValue(findFirst(record, ["category"]) ?? findFirst(item, ["category"]), "household"),
      size: stringValue(findFirst(record, ["size", "sizeLabel", "size_label"]) ?? findFirst(item, ["size", "sizeLabel"]), "") || null,
      condition: stringValue(findFirst(record, ["condition", "conditionLabel", "condition_label"]) ?? findFirst(item, ["condition", "conditionLabel"]), "") || null,
    },
    owner: normalizeParty(owner, "Owner household"),
    borrower: normalizeParty(borrower, "Borrowing household"),
    borrowWindowStart: dateTimeValue(findFirst(record, ["borrowWindowStart", "borrow_window_start", "windowStart", "window_start", "startsAt", "starts_at"])),
    borrowWindowEnd: dateTimeValue(findFirst(record, ["borrowWindowEnd", "borrow_window_end", "windowEnd", "window_end", "endsAt", "ends_at"])),
    pickupWindowStart: dateTimeValue(findFirst(handoff, ["pickupWindowStart", "pickup_window_start", "windowStart", "window_start"])),
    pickupWindowEnd: dateTimeValue(findFirst(handoff, ["pickupWindowEnd", "pickup_window_end", "windowEnd", "window_end"])),
    pickupHint: stringValue(findFirst(record, ["pickupHint", "pickup_hint"]) ?? findFirst(handoff, ["pickupHint", "pickup_hint", "pickupLocationHint", "pickup_location_hint"]), "") || null,
    terms: stringValue(findFirst(record, ["terms", "termsSummary", "terms_summary"]) ?? terms.summary, "") || null,
    depositPreference: stringValue(findFirst(record, ["depositPreference", "deposit_preference"]) ?? terms.depositPreference ?? terms.deposit_preference, "") || null,
    review: Object.keys(review).length > 0
      ? {
          rating: numberValue(findFirst(review, ["rating", "score"])),
          note: stringValue(findFirst(review, ["note", "body", "comment"]), "") || null,
          createdAt: dateTimeValue(findFirst(review, ["createdAt", "created_at"])),
        }
      : null,
    availableActions: normalizeActions(findFirst(record, ["availableActions", "available_actions", "actions"]), status),
  };
}

function normalizeAvailabilityLabel(record: Record<string, unknown>, availability: Record<string, unknown>): string {
  const explicit = stringValue(findFirst(record, ["availabilityLabel", "availability_label"]) ?? availability.label);
  if (explicit) {
    return explicit;
  }

  const start = dateTimeValue(findFirst(record, ["availableFrom", "available_from"]) ?? availability.start);
  const end = dateTimeValue(findFirst(record, ["availableUntil", "available_until"]) ?? availability.end);

  if (start && end) {
    return `${formatDateTime(start)} to ${formatDateTime(end)}`;
  }

  return "Ask owner for an available window";
}

function normalizeParty(record: Record<string, unknown>, fallbackLabel: string): LendingParty {
  return {
    householdId: stringValue(findFirst(record, ["householdId", "household_id", "id"]), "") || null,
    label: stringValue(findFirst(record, ["label", "name", "displayName", "display_name"]), fallbackLabel),
    coarseLocation: stringValue(findFirst(record, ["coarseLocation", "coarse_location", "coarseLocationLabel", "coarse_location_label", "area"]), "") || null,
    trustLabel: stringValue(findFirst(record, ["trustLabel", "trust_label", "trustSummary", "trust_summary"]), "") || null,
  };
}

function normalizeRole(value: unknown): LendingActorRole {
  const role = stringValue(value, "unknown").toLowerCase();
  if (role === "owner" || role === "borrower" || role === "requester") {
    return role;
  }

  return "unknown";
}

function normalizeActions(value: unknown, status: LendingLifecycleStatus): string[] {
  const explicit = asArray(value)
    .map((action) => stringValue(typeof action === "string" ? action : findFirst(asRecord(action), ["action", "type"])))
    .filter(Boolean);

  if (explicit.length > 0) {
    return explicit;
  }

  if (status === "requested") {
    return ["accept", "decline", "cancel"];
  }
  if (status === "accepted" || status === "reserved") {
    return ["schedule-pickup", "cancel"];
  }
  if (status === "pickup_scheduled") {
    return ["picked-up", "cancel"];
  }
  if (status === "picked_up") {
    return ["returned"];
  }
  if (status === "returned") {
    return ["complete"];
  }
  if (status === "completed") {
    return ["review"];
  }

  return [];
}

function normalizeDistanceLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  const distance = numberValue(value);
  if (distance === null) {
    return null;
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distance)} m`;
}

async function postJson(
  fetcher: Fetcher,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<LendingMutationResult> {
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
    const request = firstObject(body, ["request", "booking"]);

    return {
      status: status === "available" ? "ok" : status === "unavailable" ? "unavailable" : "error",
      endpoint,
      httpStatus: response.status,
      message: responseMessage(response, body),
      bookingId: stringValue(findFirst(body, ["bookingId", "booking_id", "requestId", "request_id"]) ?? findFirst(request, ["id", "bookingId"]), "") || null,
    };
  } catch (error) {
    return {
      status: "error",
      endpoint,
      httpStatus: null,
      message: error instanceof Error ? error.message : "Request failed.",
      bookingId: null,
    };
  }
}

export async function loadLendingSnapshot(fetcher: Fetcher): Promise<LendingSnapshot> {
  const [listingsResponse, requestsResponse] = await Promise.all([
    fetchEndpoint(fetcher, LISTINGS_ENDPOINT),
    fetchEndpoint(fetcher, REQUESTS_ENDPOINT),
  ]);
  const listings = childArray(listingsResponse.body, ["listings", "items", "results"]).map(normalizeLendingListing);
  const requests = childArray(requestsResponse.body, ["requests", "bookings", "items", "results"]).map(normalizeLendingRequest);
  const endpoints = [listingsResponse.endpoint, requestsResponse.endpoint];

  return {
    status: summarizeStatus(endpoints),
    checkedAt: new Date().toISOString(),
    listings,
    requests,
    endpoints,
    message: endpoints.every((endpoint) => endpoint.status === "available")
      ? "Lending routes are live."
      : "Lending API routes are not installed or are unavailable in this environment.",
  };
}

export async function requestLending(fetcher: Fetcher, input: LendingRequestInput): Promise<LendingMutationResult> {
  return postJson(fetcher, REQUEST_ENDPOINT, {
    listingId: input.listingId,
    borrowWindowStart: input.borrowWindowStart,
    borrowWindowEnd: input.borrowWindowEnd,
    note: input.note,
    source: "lending_ui",
  });
}

export async function transitionLending(fetcher: Fetcher, input: LendingActionInput): Promise<LendingMutationResult> {
  const endpoint = `/api/lending/${encodeURIComponent(input.bookingId)}/${input.action}`;

  return postJson(fetcher, endpoint, {
    pickupWindowStart: input.pickupWindowStart || null,
    pickupWindowEnd: input.pickupWindowEnd || null,
    pickupHint: input.pickupHint || null,
    source: "lending_ui",
  });
}

export async function submitLendingReview(fetcher: Fetcher, input: LendingReviewInput): Promise<LendingMutationResult> {
  const endpoint = `/api/lending/${encodeURIComponent(input.bookingId)}/review`;

  return postJson(fetcher, endpoint, {
    rating: input.rating,
    note: input.note,
    source: "lending_ui",
  });
}

export function lendingEndpointSummary(snapshot: LendingSnapshot | null): string {
  if (!snapshot) {
    return "Checking lending routes.";
  }

  const live = snapshot.endpoints.filter((endpoint) => endpoint.status === "available").length;
  return `${live}/${snapshot.endpoints.length} lending routes live`;
}

export function formatLendingStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatDateTime(value: string): string {
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

function summarizeStatus(endpoints: LendingEndpointState[]): LendingSnapshot["status"] {
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
