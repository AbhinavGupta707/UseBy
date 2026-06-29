export type LendingLoadStatus = "available" | "partial" | "unavailable" | "error";

export type LendingMutationStatus = "ok" | "unavailable" | "error";

export type LendingCategory = "fashion" | "household" | string;

export type LendingActorRole = "owner" | "borrower" | "requester" | "unknown";

export type LendingLifecycleStatus =
  | "requested"
  | "accepted"
  | "reserved"
  | "pickup_scheduled"
  | "picked_up"
  | "returned"
  | "completed"
  | "reviewed"
  | "declined"
  | "cancelled"
  | "disputed"
  | string;

export type LendingParty = {
  householdId: string | null;
  label: string;
  coarseLocation: string | null;
  trustLabel: string | null;
};

export type LendingListing = {
  id: string;
  itemId: string | null;
  title: string;
  category: LendingCategory;
  size: string | null;
  condition: string | null;
  availabilityLabel: string;
  terms: string | null;
  cleaningNotes: string | null;
  returnExpectations: string | null;
  pickupHint: string | null;
  depositPreference: string | null;
  owner: LendingParty;
  distanceLabel: string | null;
  status: string;
};

export type LendingRequest = {
  id: string;
  status: LendingLifecycleStatus;
  viewerRole: LendingActorRole;
  listingId: string | null;
  item: {
    id: string | null;
    title: string;
    category: LendingCategory;
    size: string | null;
    condition: string | null;
  };
  owner: LendingParty;
  borrower: LendingParty;
  borrowWindowStart: string | null;
  borrowWindowEnd: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  pickupHint: string | null;
  terms: string | null;
  depositPreference: string | null;
  review: {
    rating: number | null;
    note: string | null;
    createdAt: string | null;
  } | null;
  availableActions: string[];
};

export type LendingEndpointState = {
  endpoint: string;
  status: LendingLoadStatus;
  httpStatus: number | null;
  message: string;
};

export type LendingSnapshot = {
  status: LendingLoadStatus;
  checkedAt: string;
  listings: LendingListing[];
  requests: LendingRequest[];
  endpoints: LendingEndpointState[];
  message: string | null;
};

export type LendingRequestInput = {
  listingId: string;
  borrowWindowStart: string;
  borrowWindowEnd: string;
  note: string;
};

export type LendingActionInput = {
  bookingId: string;
  action:
    | "accept"
    | "decline"
    | "cancel"
    | "schedule-pickup"
    | "picked-up"
    | "returned"
    | "complete";
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  pickupHint?: string;
};

export type LendingReviewInput = {
  bookingId: string;
  rating: number;
  note: string;
};

export type LendingMutationResult = {
  status: LendingMutationStatus;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  bookingId: string | null;
};
