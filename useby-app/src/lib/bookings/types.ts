export type BookingLoadStatus = "available" | "partial" | "unavailable" | "error";

export type BookingMutationStatus = "ok" | "unavailable" | "error";

export type BookingLifecycleStatus =
  | "requested"
  | "accepted"
  | "reserved"
  | "pickup_scheduled"
  | "picked_up"
  | "completed"
  | "reviewed"
  | "declined"
  | "cancelled"
  | "disputed"
  | "returned"
  | string;

export type BookingActorRole = "owner" | "receiver" | "unknown";

export type BookingParty = {
  householdId: string | null;
  label: string;
  coarseLocation: string | null;
  trustLabel: string | null;
};

export type BookingItem = {
  id: string | null;
  name: string;
  category: string;
  safetyStatus: string | null;
};

export type BookingHandoff = {
  status: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  pickupHint: string | null;
  pickedUpAt: string | null;
  completedAt: string | null;
};

export type BookingReview = {
  rating: number | null;
  note: string | null;
  createdAt: string | null;
};

export type BookingTimelineEvent = {
  status: BookingLifecycleStatus;
  label: string;
  at: string | null;
  detail: string | null;
};

export type Booking = {
  id: string;
  status: BookingLifecycleStatus;
  viewerRole: BookingActorRole;
  bookingType: string;
  item: BookingItem;
  matchId: string | null;
  needId: string | null;
  owner: BookingParty;
  receiver: BookingParty;
  distanceLabel: string | null;
  locationLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  handoff: BookingHandoff;
  review: BookingReview | null;
  timeline: BookingTimelineEvent[];
  availableActions: string[];
};

export type BookingEndpointState = {
  endpoint: string;
  status: BookingLoadStatus;
  httpStatus: number | null;
  message: string;
};

export type BookingSnapshot = {
  status: BookingLoadStatus;
  checkedAt: string;
  bookings: Booking[];
  endpoints: BookingEndpointState[];
  message: string | null;
};

export type BookingMutationResult = {
  status: BookingMutationStatus;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  bookingId: string | null;
};

export type SafetyAcknowledgementInput = {
  matchId: string;
  itemInstanceId: string | null;
  needId: string | null;
  householdId?: string | null;
  acknowledged: boolean;
  sealedPackagedOnly: boolean;
  noSafetyCertification: boolean;
  source: "grocery_match_card" | "booking_detail";
};

export type BookingRequestInput = {
  matchId: string;
  itemInstanceId: string | null;
  needId: string | null;
  householdId?: string | null;
  source: "grocery_match_card" | "booking_detail";
};

export type BookingActionInput = {
  bookingId: string;
  action:
    | "accept"
    | "decline"
    | "cancel"
    | "schedule-pickup"
    | "picked-up"
    | "complete";
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  pickupHint?: string;
};

export type BookingReviewInput = {
  bookingId: string;
  rating: number;
  note: string;
};
