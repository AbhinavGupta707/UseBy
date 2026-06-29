export type GroceryLoadStatus = "available" | "partial" | "unavailable" | "error";

export type GroceryMutationStatus = "ok" | "unavailable" | "error";

export type ExpiryBand = "expired" | "today" | "use_soon" | "watch" | "fresh" | "unknown";

export type SafetyStatus = "eligible" | "restricted" | "blocked" | "unknown";

export type StorageState = "sealed" | "opened" | "fridge" | "freezer" | "cupboard" | "cooked";

export type GroceryInventoryItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  storageState: StorageState | string;
  safetyStatus: SafetyStatus | string;
  itemState: string;
  expiryBand: ExpiryBand;
  expiryDate: string | null;
  expirySource: "confirmed" | "estimated" | "unknown";
  expiryConfidence: number | null;
  detail: string | null;
};

export type GroceryActionCard = {
  id: string;
  type: string;
  title: string;
  body: string;
  rationale: string;
  priority: "high" | "medium" | "low" | string;
  safetyStatus: SafetyStatus | string;
  status: string;
  itemName: string | null;
};

export type GroceryMatch = {
  id: string;
  itemId: string | null;
  needId: string | null;
  itemName: string;
  needTitle: string;
  distanceMeters: number | null;
  score: number | null;
  rationale: string;
  safetyStatus: SafetyStatus | string;
  status: string;
  ownerCoarseLocation: string | null;
  requesterCoarseLocation: string | null;
};

export type GroceryEndpointState = {
  endpoint: string;
  status: GroceryLoadStatus;
  httpStatus: number | null;
  message: string;
};

export type GrocerySnapshot = {
  status: GroceryLoadStatus;
  checkedAt: string;
  inventory: GroceryInventoryItem[];
  actionCards: GroceryActionCard[];
  matches: GroceryMatch[];
  endpoints: GroceryEndpointState[];
  message: string | null;
};

export type ManualGroceryInput = {
  itemName: string;
  quantity: string;
  unit: string;
  storageState: StorageState;
  expiryDate: string;
  receiptLines: string;
};

export type ExpiryEditInput = {
  itemId: string;
  storageState: StorageState;
  expiryDate: string;
  safetyStatus: SafetyStatus;
};

export type GroceryMutationResult = {
  status: GroceryMutationStatus;
  endpoint: string;
  httpStatus: number | null;
  message: string;
};
