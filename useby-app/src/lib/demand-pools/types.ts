export type DemandPoolLoadStatus = "available" | "partial" | "unavailable" | "error";

export type DemandPoolMutationStatus = "ok" | "unavailable" | "error";

export type DemandPoolStatus =
  | "gathering"
  | "threshold_met"
  | "bidding"
  | "awarded"
  | "ready_for_pickup"
  | "fulfilled"
  | "cancelled"
  | "expired"
  | string;

export type DemandPoolItem = {
  id: string | null;
  name: string;
  quantity: string | null;
  unit: string | null;
};

export type DemandPoolCommitment = {
  id: string | null;
  poolId: string;
  quantity: number;
  maxPriceCents: number | null;
  status: string;
  unpaidDemoIntent: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DemandPoolBid = {
  id: string;
  merchantName: string;
  priceCents: number | null;
  availableQuantity: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  substitutionPolicy: string | null;
  fulfilmentTerms: string | null;
  status: string;
  scoreLabel: string | null;
  safeToShow: boolean;
};

export type DemandPoolOrder = {
  id: string;
  poolId: string;
  status: string;
  merchantName: string | null;
  quantity: number | null;
  totalPriceCents: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  pickupAreaLabel: string | null;
  pickupHint: string | null;
  readyAt: string | null;
  collectedAt: string | null;
};

export type DemandPool = {
  id: string;
  title: string;
  description: string | null;
  status: DemandPoolStatus;
  thresholdQuantity: number;
  committedQuantity: number;
  householdCount: number;
  closesAt: string | null;
  maxPriceCents: number | null;
  pickupRadiusMeters: number | null;
  pickupAreaLabel: string | null;
  items: DemandPoolItem[];
  currentUserCommitment: DemandPoolCommitment | null;
  merchantBids: DemandPoolBid[];
  winningBid: DemandPoolBid | null;
  orders: DemandPoolOrder[];
  availableActions: string[];
};

export type DemandPoolEndpointState = {
  endpoint: string;
  status: DemandPoolLoadStatus;
  httpStatus: number | null;
  message: string;
};

export type DemandPoolSnapshot = {
  status: DemandPoolLoadStatus;
  checkedAt: string;
  pools: DemandPool[];
  orders: DemandPoolOrder[];
  endpoints: DemandPoolEndpointState[];
  message: string | null;
};

export type DemandPoolDetailResult = {
  status: DemandPoolLoadStatus;
  checkedAt: string;
  pool: DemandPool | null;
  endpoint: DemandPoolEndpointState;
  message: string | null;
};

export type DemandPoolMutationResult = {
  status: DemandPoolMutationStatus;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  poolId: string | null;
};

export type DemandPoolCommitmentInput = {
  poolId: string;
  quantity: string;
  maxPrice: string;
};

export type DemandPoolCreateInput = {
  title: string;
  requestedItems: string;
  targetQuantity: string;
  maxPrice: string;
  pickupRadius: string;
  pickupArea: string;
  closesAt: string;
};
