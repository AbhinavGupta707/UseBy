export type StoreDropLoadStatus = "available" | "partial" | "unavailable" | "error";

export type StoreDropMutationStatus = "ok" | "unavailable" | "error";

export type StoreDropStatus =
  | "draft"
  | "published"
  | "available"
  | "active"
  | "paused"
  | "closed"
  | "expired"
  | "sold_out"
  | string;

export type StoreDropReservation = {
  id: string | null;
  dropId: string;
  quantity: number;
  status: string;
  unpaidDemoIntent: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  cancelledAt: string | null;
};

export type StoreDrop = {
  id: string;
  title: string;
  description: string | null;
  status: StoreDropStatus;
  merchantDisplayName: string;
  coarsePickupArea: string | null;
  remainingQuantity: number | null;
  totalQuantity: number | null;
  reservedQuantity: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  priceCents: number | null;
  currency: string;
  safetyNotes: string[];
  currentReservation: StoreDropReservation | null;
  availableActions: string[];
};

export type StoreDropEndpointState = {
  endpoint: string;
  status: StoreDropLoadStatus;
  httpStatus: number | null;
  message: string;
};

export type StoreDropSnapshot = {
  status: StoreDropLoadStatus;
  checkedAt: string;
  drops: StoreDrop[];
  reservations: StoreDropReservation[];
  endpoints: StoreDropEndpointState[];
  message: string | null;
};

export type StoreDropDetailResult = {
  status: StoreDropLoadStatus;
  checkedAt: string;
  drop: StoreDrop | null;
  endpoint: StoreDropEndpointState;
  message: string | null;
};

export type StoreDropMutationResult = {
  status: StoreDropMutationStatus;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  dropId: string | null;
};

export type StoreDropReserveInput = {
  dropId: string;
  quantity: string;
};
