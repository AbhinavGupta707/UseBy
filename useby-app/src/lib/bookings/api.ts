import type {
  Booking,
  BookingActionInput,
  BookingActorRole,
  BookingEndpointState,
  BookingHandoff,
  BookingLifecycleStatus,
  BookingMutationResult,
  BookingParty,
  BookingRequestInput,
  BookingReview,
  BookingReviewInput,
  BookingSnapshot,
  BookingTimelineEvent,
  SafetyAcknowledgementInput,
} from "./types";

type Fetcher = typeof fetch;

const BOOKINGS_ENDPOINT = "/api/bookings";
const BOOKING_REQUEST_ENDPOINT = "/api/bookings/request";
const SAFETY_ACK_ENDPOINTS = [
  "/api/safety/food-acknowledgements",
  "/api/safety/acknowledgements",
  "/api/bookings/safety-acknowledgements",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string | null | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function withHouseholdContext(endpoint: string, householdId?: string | null): string {
  if (!householdId) {
    return endpoint;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}householdId=${encodeURIComponent(householdId)}`;
}

function withSafetyAckQuery(endpoint: string, input: SafetyAcknowledgementInput): string {
  const search = new URLSearchParams();
  if (input.householdId) {
    search.set("householdId", input.householdId);
  }
  const itemId = uuidOrNull(input.itemInstanceId);
  if (itemId) {
    search.set("itemId", itemId);
  }
  search.set("acknowledgementType", "food_handoff");

  const query = search.toString();
  if (!query) {
    return endpoint;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${query}`;
}

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
  status: BookingEndpointState["status"],
  httpStatus: number | null,
  message: string,
): BookingEndpointState {
  return { endpoint, status, httpStatus, message };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return asRecord(await response.json().catch(() => ({})));
}

async function checkExistingSafetyAcknowledgement(
  fetcher: Fetcher,
  endpoint: string,
  input: SafetyAcknowledgementInput,
): Promise<BookingMutationResult | null> {
  try {
    const response = await fetcher(withSafetyAckQuery(endpoint, input), {
      headers: { accept: "application/json" },
    });
    const body = await readJsonResponse(response);

    if (response.ok && body.acknowledged === true) {
      return {
        status: "ok",
        endpoint,
        httpStatus: response.status,
        message: "Food safety acknowledgement already recorded.",
        bookingId: null,
      };
    }

    if (response.status === 404 || response.status === 501) {
      return {
        status: "unavailable",
        endpoint,
        httpStatus: response.status,
        message: responseMessage(response, body),
        bookingId: null,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function responseStatus(response: Response, body: Record<string, unknown>): BookingEndpointState["status"] {
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
  endpoint: BookingEndpointState;
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

export function normalizeBooking(value: unknown, index = 0): Booking {
  const record = asRecord(value);
  const item = firstObject(record, ["item", "itemInstance", "item_instance"]);
  const owner = firstObject(record, ["owner", "ownerHousehold", "owner_household"]);
  const receiver = firstObject(record, ["receiver", "requester", "receiverHousehold", "requesterHousehold"]);
  const handoffRecord = firstObject(record, ["handoff", "handoffState"]);
  const reviewRecord = firstObject(record, ["review"]);
  const status = stringValue(findFirst(record, ["status", "bookingStatus", "booking_status"]), "requested") as BookingLifecycleStatus;
  const id = stringValue(findFirst(record, ["id", "bookingId", "booking_id"]), `booking-${index}`);

  return {
    id,
    status,
    viewerRole: normalizeRole(findFirst(record, ["viewerRole", "viewer_role", "actorRole", "actor_role"])),
    bookingType: stringValue(findFirst(record, ["bookingType", "booking_type", "type"]), "share"),
    item: {
      id: stringValue(findFirst(record, ["itemInstanceId", "item_instance_id"]) ?? findFirst(item, ["id", "itemId"]), "") || null,
      name: stringValue(findFirst(record, ["itemName", "item_name"]) ?? findFirst(item, ["name", "title"]), "Shared item"),
      category: stringValue(findFirst(record, ["category"]) ?? findFirst(item, ["category"]), "grocery"),
      safetyStatus: stringValue(findFirst(record, ["safetyStatus", "safety_status"]) ?? findFirst(item, ["safetyStatus", "safety_status"]), "") || null,
    },
    matchId: stringValue(findFirst(record, ["matchId", "match_id"]), "") || null,
    needId: stringValue(findFirst(record, ["needId", "need_id"]), "") || null,
    owner: normalizeParty(owner, "Owner household"),
    receiver: normalizeParty(receiver, "Receiving household"),
    distanceLabel: normalizeDistanceLabel(findFirst(record, ["distanceLabel", "distance_label", "distanceMeters", "distance_meters"])),
    locationLabel: stringValue(findFirst(record, ["locationLabel", "location_label", "coarseLocation", "coarse_location"]), "") || null,
    createdAt: dateTimeValue(findFirst(record, ["createdAt", "created_at", "requestedAt", "requested_at"])),
    updatedAt: dateTimeValue(findFirst(record, ["updatedAt", "updated_at"])),
    handoff: normalizeHandoff(handoffRecord),
    review: Object.keys(reviewRecord).length > 0 ? normalizeReview(reviewRecord) : null,
    timeline: normalizeTimeline(record, handoffRecord, reviewRecord, status),
    availableActions: normalizeActions(findFirst(record, ["availableActions", "available_actions", "actions"]), status),
  };
}

function normalizeRole(value: unknown): BookingActorRole {
  const role = stringValue(value, "unknown").toLowerCase();
  return role === "owner" || role === "receiver" ? role : "unknown";
}

function normalizeParty(record: Record<string, unknown>, fallbackLabel: string): BookingParty {
  return {
    householdId: stringValue(findFirst(record, ["householdId", "household_id", "id"]), "") || null,
    label: stringValue(findFirst(record, ["label", "name", "displayName", "display_name"]), fallbackLabel),
    coarseLocation: stringValue(findFirst(record, ["coarseLocation", "coarse_location", "coarseLocationLabel", "coarse_location_label"]), "") || null,
    trustLabel: stringValue(findFirst(record, ["trustLabel", "trust_label", "trustSummary", "trust_summary"]), "") || null,
  };
}

function normalizeHandoff(record: Record<string, unknown>): BookingHandoff {
  return {
    status: stringValue(findFirst(record, ["status", "handoffStatus", "handoff_status"]), "") || null,
    pickupWindowStart: dateTimeValue(findFirst(record, ["pickupWindowStart", "pickup_window_start", "windowStart", "window_start"])),
    pickupWindowEnd: dateTimeValue(findFirst(record, ["pickupWindowEnd", "pickup_window_end", "windowEnd", "window_end"])),
    pickupHint: stringValue(findFirst(record, ["pickupHint", "pickup_hint", "pickupLocationHint", "pickup_location_hint"]), "") || null,
    pickedUpAt: dateTimeValue(findFirst(record, ["pickedUpAt", "picked_up_at"])),
    completedAt: dateTimeValue(findFirst(record, ["completedAt", "completed_at"])),
  };
}

function normalizeReview(record: Record<string, unknown>): BookingReview {
  return {
    rating: numberValue(findFirst(record, ["rating", "score"])),
    note: stringValue(findFirst(record, ["note", "body", "comment"]), "") || null,
    createdAt: dateTimeValue(findFirst(record, ["createdAt", "created_at"])),
  };
}

function normalizeTimeline(
  record: Record<string, unknown>,
  handoff: Record<string, unknown>,
  review: Record<string, unknown>,
  status: BookingLifecycleStatus,
): BookingTimelineEvent[] {
  const explicit = childArray(record, ["timeline", "events"]).map((event, index) => {
    const eventRecord = asRecord(event);
    const eventStatus = stringValue(findFirst(eventRecord, ["status", "type"]), `event-${index}`) as BookingLifecycleStatus;

    return {
      status: eventStatus,
      label: stringValue(eventRecord.label, formatStatus(eventStatus)),
      at: dateTimeValue(findFirst(eventRecord, ["at", "createdAt", "created_at"])),
      detail: stringValue(findFirst(eventRecord, ["detail", "message"]), "") || null,
    };
  });

  if (explicit.length > 0) {
    return explicit;
  }

  const requestedAt = dateTimeValue(findFirst(record, ["requestedAt", "requested_at", "createdAt", "created_at"]));
  const acceptedAt = dateTimeValue(findFirst(record, ["acceptedAt", "accepted_at", "reservedAt", "reserved_at"]));
  const declinedAt = dateTimeValue(findFirst(record, ["declinedAt", "declined_at"]));
  const cancelledAt = dateTimeValue(findFirst(record, ["cancelledAt", "cancelled_at"]));
  const disputedAt = dateTimeValue(findFirst(record, ["disputedAt", "disputed_at"]));
  const pickupWindow = dateTimeValue(findFirst(handoff, ["pickupWindowStart", "pickup_window_start", "windowStart", "window_start"]));
  const pickedUpAt = dateTimeValue(findFirst(handoff, ["pickedUpAt", "picked_up_at"]));
  const completedAt = dateTimeValue(findFirst(handoff, ["completedAt", "completed_at"]));
  const reviewedAt = dateTimeValue(findFirst(review, ["createdAt", "created_at"]));
  const events: BookingTimelineEvent[] = [
    { status: "requested", label: "Requested", at: requestedAt, detail: "Receiver asked to reserve this item." },
  ];

  if (acceptedAt || ["accepted", "reserved", "pickup_scheduled", "picked_up", "completed", "reviewed"].includes(status)) {
    events.push({ status: "reserved", label: "Accepted / reserved", at: acceptedAt, detail: "Owner accepted and the item is held for this neighbour." });
  }
  if (pickupWindow || ["pickup_scheduled", "picked_up", "completed", "reviewed"].includes(status)) {
    events.push({ status: "pickup_scheduled", label: "Pickup scheduled", at: pickupWindow, detail: "Pickup hint is shown without exact household coordinates." });
  }
  if (pickedUpAt || ["picked_up", "completed", "reviewed"].includes(status)) {
    events.push({ status: "picked_up", label: "Picked up", at: pickedUpAt, detail: "Receiver confirmed collection." });
  }
  if (completedAt || ["completed", "reviewed"].includes(status)) {
    events.push({ status: "completed", label: "Completed", at: completedAt, detail: "Completion closes the handoff and records the outcome." });
  }
  if (reviewedAt || status === "reviewed") {
    events.push({ status: "reviewed", label: "Reviewed", at: reviewedAt, detail: "Review saved for trust context." });
  }
  if (declinedAt || status === "declined") {
    events.push({ status: "declined", label: "Declined", at: declinedAt, detail: "Owner declined the request." });
  }
  if (cancelledAt || status === "cancelled") {
    events.push({ status: "cancelled", label: "Cancelled", at: cancelledAt, detail: "Request was cancelled before completion." });
  }
  if (disputedAt || status === "disputed") {
    events.push({ status: "disputed", label: "Disputed", at: disputedAt, detail: "Handoff needs moderation or support review." });
  }

  return events;
}

function normalizeActions(value: unknown, status: BookingLifecycleStatus): string[] {
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
): Promise<BookingMutationResult> {
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
    const booking = firstObject(body, ["booking"]);

    return {
      status: status === "available" ? "ok" : status === "unavailable" ? "unavailable" : "error",
      endpoint,
      httpStatus: response.status,
      message: responseMessage(response, body),
      bookingId: stringValue(findFirst(body, ["bookingId", "booking_id"]) ?? findFirst(booking, ["id", "bookingId"]), "") || null,
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

export async function loadBookingsSnapshot(fetcher: Fetcher): Promise<BookingSnapshot> {
  const response = await fetchEndpoint(fetcher, BOOKINGS_ENDPOINT);
  const bookings = childArray(response.body, ["bookings", "items", "results"]).map(normalizeBooking);

  return {
    status: response.endpoint.status,
    checkedAt: new Date().toISOString(),
    bookings,
    endpoints: [response.endpoint],
    message: response.endpoint.status === "available"
      ? "Bookings route is live."
      : "Booking API route is not installed or is unavailable in this environment.",
  };
}

export async function loadBookingDetail(fetcher: Fetcher, bookingId: string): Promise<BookingSnapshot> {
  const endpoint = `${BOOKINGS_ENDPOINT}/${encodeURIComponent(bookingId)}`;
  const response = await fetchEndpoint(fetcher, endpoint);
  const bookingRecord = firstObject(response.body, ["booking"]);
  const bookings = Object.keys(bookingRecord).length > 0
    ? [normalizeBooking(bookingRecord)]
    : childArray(response.body, ["bookings", "items", "results"]).map(normalizeBooking);

  return {
    status: response.endpoint.status,
    checkedAt: new Date().toISOString(),
    bookings,
    endpoints: [response.endpoint],
    message: response.endpoint.status === "available"
      ? "Booking detail route is live."
      : "Booking detail route is not installed or is unavailable in this environment.",
  };
}

export async function submitSafetyAcknowledgement(
  fetcher: Fetcher,
  input: SafetyAcknowledgementInput,
): Promise<BookingMutationResult> {
  const itemId = uuidOrNull(input.itemInstanceId);
  const payload = {
    acknowledgementType: "food_handoff",
    itemId,
    bookingId: null,
    acknowledgedNotice: input.acknowledged,
    metadata: {
      matchId: input.matchId,
      needId: input.needId,
      itemId: input.itemInstanceId,
      sealedPackagedOnly: input.sealedPackagedOnly,
      noSafetyCertification: input.noSafetyCertification,
      category: "grocery",
      source: input.source,
    },
  };
  let lastResult: BookingMutationResult | null = null;

  for (const endpoint of SAFETY_ACK_ENDPOINTS) {
    const existing = await checkExistingSafetyAcknowledgement(fetcher, endpoint, input);
    if (existing?.status === "ok") {
      return existing;
    }

    const result = await postJson(fetcher, withHouseholdContext(endpoint, input.householdId), payload);
    if (result.status !== "unavailable") {
      return result;
    }
    lastResult = result;
  }

  return lastResult ?? {
    status: "unavailable",
    endpoint: SAFETY_ACK_ENDPOINTS[0],
    httpStatus: 404,
    message: "Food safety acknowledgement route is not installed yet.",
    bookingId: null,
  };
}

export async function requestBooking(fetcher: Fetcher, input: BookingRequestInput): Promise<BookingMutationResult> {
  return postJson(fetcher, withHouseholdContext(BOOKING_REQUEST_ENDPOINT, input.householdId), {
    matchId: input.matchId,
    itemId: uuidOrNull(input.itemInstanceId),
    needId: input.needId,
    bookingType: "share",
    category: "grocery",
    source: input.source,
  });
}

export async function transitionBooking(fetcher: Fetcher, input: BookingActionInput): Promise<BookingMutationResult> {
  const endpoint = `${BOOKINGS_ENDPOINT}/${encodeURIComponent(input.bookingId)}/${input.action}`;

  return postJson(fetcher, endpoint, {
    pickupWindowStart: input.pickupWindowStart || null,
    pickupWindowEnd: input.pickupWindowEnd || null,
    pickupHint: input.pickupHint || null,
    source: "booking_ui",
  });
}

export async function submitBookingReview(fetcher: Fetcher, input: BookingReviewInput): Promise<BookingMutationResult> {
  const endpoint = `${BOOKINGS_ENDPOINT}/${encodeURIComponent(input.bookingId)}/review`;

  return postJson(fetcher, endpoint, {
    rating: input.rating,
    note: input.note,
    source: "booking_ui",
  });
}

export function bookingsEndpointSummary(snapshot: BookingSnapshot | null): string {
  if (!snapshot) {
    return "Checking booking routes.";
  }

  const live = snapshot.endpoints.filter((endpoint) => endpoint.status === "available").length;
  return `${live}/${snapshot.endpoints.length} booking route${snapshot.endpoints.length === 1 ? "" : "s"} live`;
}

export function formatStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
