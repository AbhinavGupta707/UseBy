export type MerchantLoadStatus = "available" | "partial" | "unavailable" | "error";

export type MerchantMutationStatus = "ok" | "unavailable" | "error";

export type MerchantBidStatus =
  | "submitted"
  | "winning"
  | "rejected"
  | "withdrawn"
  | "fulfilled"
  | "cancelled"
  | string;

export type MerchantPoolStatus =
  | "draft"
  | "gathering"
  | "threshold_met"
  | "bidding"
  | "awarded"
  | "ready_for_pickup"
  | "fulfilled"
  | "expired"
  | "cancelled"
  | string;

export type MerchantEndpointState = {
  endpoint: string;
  status: MerchantLoadStatus;
  httpStatus: number | null;
  message: string;
};

export type MerchantDemandPool = {
  id: string;
  title: string;
  description: string | null;
  status: MerchantPoolStatus;
  category: string | null;
  unit: string;
  thresholdQuantity: number | null;
  committedQuantity: number | null;
  thresholdHouseholds: number | null;
  committedHouseholds: number | null;
  closesAt: string | null;
  coarseArea: string | null;
  demandSummary: string;
  requestedItems: string[];
  maxPriceLabel: string | null;
  bidStatus: MerchantBidStatus | null;
};

export type MerchantBid = {
  id: string;
  poolId: string | null;
  poolTitle: string;
  status: MerchantBidStatus;
  priceLabel: string;
  availableQuantity: number | null;
  minQuantity: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  score: number | null;
  terms: string | null;
  submittedAt: string | null;
};

export type MerchantPickup = {
  id: string;
  orderId: string;
  poolId: string | null;
  poolTitle: string;
  status: string;
  householdLabel: string;
  coarseArea: string | null;
  quantity: number | null;
  unit: string;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  availableActions: string[];
};

export type MerchantDemandSummary = {
  activePools: number;
  committedHouseholds: number;
  committedQuantity: number;
  submittedBids: number;
  awardedPickups: number;
};

export type MerchantSnapshot = {
  status: MerchantLoadStatus;
  checkedAt: string;
  pools: MerchantDemandPool[];
  bids: MerchantBid[];
  pickups: MerchantPickup[];
  summary: MerchantDemandSummary;
  endpoints: MerchantEndpointState[];
  message: string | null;
};

export type MerchantBidInput = {
  poolId: string;
  priceCents: number;
  availableQuantity: number;
  minQuantity: number;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  terms: string;
  substitutionPolicy: string;
  fulfilmentNotes: string;
};

export type MerchantPickupActionInput = {
  orderId: string;
  action: "ready" | "collected";
};

export type MerchantMutationResult = {
  status: MerchantMutationStatus;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  entityId: string | null;
};
