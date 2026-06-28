export const DEMO_SCOPE = "demo:riverside-quarter";
export const DEMO_NEIGHBOURHOOD_ID = "demo-neighbourhood-riverside-quarter";
export const DEMO_SEED_VERSION = "checkpoint-1-lane-1b-v1";

export const FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS = [
  "actionCards",
  "matches",
  "bookings",
  "handoffs",
  "rentalWindows",
  "poolOrders",
  "pickupTasks",
  "storeDropReservations",
  "trustEvents",
  "reviews",
  "jobRuns",
] as const;

type ItemCategory = "grocery" | "fashion" | "household";
type GroceryStorageState = "sealed" | "fridge" | "freezer" | "cupboard";
type ItemState = "private" | "use_soon" | "listed";
type SafetyStatus = "eligible" | "restricted" | "unknown";
type NeedStatus = "open";
type DemandPoolStatus = "gathering";
type MerchantBidStatus = "submitted";
type StoreDropStatus = "published";

interface DemoCoordinates {
  lat: number;
  lng: number;
  precision: "exact_demo_only";
}

interface DemoBaseEntity {
  demoId: string;
  demoScope: typeof DEMO_SCOPE;
}

export interface DemoNeighbourhood extends DemoBaseEntity {
  name: string;
  slug: string;
  description: string;
  center: DemoCoordinates;
  radiusMeters: number;
}

export interface DemoHousehold extends DemoBaseEntity {
  neighbourhoodId: typeof DEMO_NEIGHBOURHOOD_ID;
  displayName: string;
  building: string;
  unitLabel: string;
  householdType: "student_flat" | "young_professional" | "family" | "co_living";
  memberCount: number;
  location: DemoCoordinates;
  pickupNotes: string;
}

export interface DemoMerchant extends DemoBaseEntity {
  neighbourhoodId: typeof DEMO_NEIGHBOURHOOD_ID;
  displayName: string;
  merchantType: "grocer" | "bakery" | "dry_cleaner";
  locationName: string;
  location: DemoCoordinates;
  pickupWindow: string;
}

export interface DemoCatalogItem extends DemoBaseEntity {
  category: ItemCategory;
  name: string;
  unit: string;
  tags: string[];
  baselineShelfLifeDays?: number;
  safetyShareableWhenSealed?: boolean;
}

export interface DemoItemInstance extends DemoBaseEntity {
  householdId: string;
  catalogItemId: string;
  category: ItemCategory;
  displayName: string;
  quantity: number;
  unit: string;
  state: ItemState;
  safetyStatus: SafetyStatus;
  storageState?: GroceryStorageState;
  purchaseDate?: string;
  estimatedUseByBand?: "use_first" | "probably_this_week" | "freeze_share_soon" | "uncertain_scan_label";
  labelUseByDate?: string;
  size?: string;
  condition?: "new" | "excellent" | "good";
  availabilityNote?: string;
  lendingTerms?: string;
}

export interface DemoNeed extends DemoBaseEntity {
  householdId: string;
  category: ItemCategory;
  title: string;
  requestedBy: string;
  status: NeedStatus;
  neededBy: string;
  radiusMeters: number;
  maxPricePence?: number;
  notes: string;
  location: DemoCoordinates;
}

export interface DemoDemandPool extends DemoBaseEntity {
  neighbourhoodId: typeof DEMO_NEIGHBOURHOOD_ID;
  title: string;
  category: "grocery" | "household";
  status: DemandPoolStatus;
  thresholdHouseholds: number;
  maxPricePencePerHousehold: number;
  closesAt: string;
  pickupRadiusMeters: number;
  requestedItems: string[];
}

export interface DemoDemandPoolCommitment extends DemoBaseEntity {
  poolId: string;
  householdId: string;
  quantity: number;
  maxPricePence: number;
  committedAt: string;
}

export interface DemoMerchantBid extends DemoBaseEntity {
  poolId: string;
  merchantId: string;
  status: MerchantBidStatus;
  pricePencePerHousehold: number;
  pickupWindow: string;
  substitutionPolicy: string;
  fulfilmentNotes: string;
}

export interface DemoStoreDrop extends DemoBaseEntity {
  merchantId: string;
  title: string;
  status: StoreDropStatus;
  quantityTotal: number;
  quantityReserved: 0;
  pricePence: number;
  pickupWindow: string;
  safetyNotes: string;
  location: DemoCoordinates;
}

export interface DemoReceiptImport extends DemoBaseEntity {
  householdId: string;
  merchantName: string;
  purchaseDate: string;
  parsedAt: string;
  source: "seeded_parsed_receipt";
}

export interface DemoReceiptLineItem extends DemoBaseEntity {
  receiptImportId: string;
  catalogItemId: string;
  rawText: string;
  quantity: number;
  pricePence: number;
}

export interface DemoExpiryLabel extends DemoBaseEntity {
  itemInstanceId: string;
  source: "seeded_parsed_expiry_label";
  rawText: string;
  parsedUseByDate: string;
}

export interface DemoGs1DigitalLink {
  demoScope: typeof DEMO_SCOPE;
  url: string;
  gtin: string;
  lot: string;
  bestBefore: string;
}

export interface DemoSeedMetadata {
  demoScope: typeof DEMO_SCOPE;
  seedVersion: typeof DEMO_SEED_VERSION;
  seedBatchId: string;
  fixtureGeneratedAt: string;
  actor: "demo_seed";
  reason: string;
  auditEvent: {
    eventType: "demo.seed_world";
    entityType: "seed_batch";
    route: "/api/demo/seed";
  };
}

export interface DemoWorldFixture {
  metadata: DemoSeedMetadata;
  neighbourhood: DemoNeighbourhood;
  households: DemoHousehold[];
  merchants: DemoMerchant[];
  catalogItems: DemoCatalogItem[];
  itemInstances: DemoItemInstance[];
  needs: DemoNeed[];
  demandPools: DemoDemandPool[];
  demandPoolCommitments: DemoDemandPoolCommitment[];
  merchantBids: DemoMerchantBid[];
  storeDrops: DemoStoreDrop[];
  receiptImports: DemoReceiptImport[];
  receiptLineItems: DemoReceiptLineItem[];
  expiryLabels: DemoExpiryLabel[];
  gs1DigitalLinks: DemoGs1DigitalLink[];
}

const demoLocation = (latOffset: number, lngOffset: number): DemoCoordinates => ({
  lat: 51.506 + latOffset,
  lng: -0.104 + lngOffset,
  precision: "exact_demo_only",
});

const base = <T extends Omit<DemoBaseEntity, "demoScope">>(entity: T): T & { demoScope: typeof DEMO_SCOPE } => ({
  ...entity,
  demoScope: DEMO_SCOPE,
});

export const RIVERSIDE_QUARTER_DEMO_WORLD: DemoWorldFixture = {
  metadata: {
    demoScope: DEMO_SCOPE,
    seedVersion: DEMO_SEED_VERSION,
    seedBatchId: "seed-batch-riverside-quarter-cp1",
    fixtureGeneratedAt: "2026-06-29T09:00:00.000Z",
    actor: "demo_seed",
    reason: "Checkpoint 1 deterministic input world for live UseBy demo reset.",
    auditEvent: {
      eventType: "demo.seed_world",
      entityType: "seed_batch",
      route: "/api/demo/seed",
    },
  },
  neighbourhood: base({
    demoId: DEMO_NEIGHBOURHOOD_ID,
    name: "Riverside Quarter",
    slug: "riverside-quarter",
    description: "Fictional dense community of university halls, apartments, and co-living blocks.",
    center: demoLocation(0, 0),
    radiusMeters: 850,
  }),
  households: [
    base({ demoId: "hh-atrium-2a", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Atrium 2A", building: "Atrium Hall", unitLabel: "2A", householdType: "student_flat", memberCount: 4, location: demoLocation(0.0008, -0.0005), pickupNotes: "Lobby shelf pickup only." }),
    base({ demoId: "hh-atrium-5c", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Atrium 5C", building: "Atrium Hall", unitLabel: "5C", householdType: "student_flat", memberCount: 5, location: demoLocation(0.0011, -0.0002), pickupNotes: "Meet at reception desk." }),
    base({ demoId: "hh-canopy-1b", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Canopy 1B", building: "Canopy House", unitLabel: "1B", householdType: "young_professional", memberCount: 2, location: demoLocation(-0.0004, 0.0009), pickupNotes: "Evening pickup after 18:00." }),
    base({ demoId: "hh-canopy-7d", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Canopy 7D", building: "Canopy House", unitLabel: "7D", householdType: "co_living", memberCount: 3, location: demoLocation(-0.0002, 0.0012), pickupNotes: "Concierge can hold sealed items." }),
    base({ demoId: "hh-courtyard-3e", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Courtyard 3E", building: "Courtyard Lofts", unitLabel: "3E", householdType: "young_professional", memberCount: 1, location: demoLocation(-0.0009, -0.0008), pickupNotes: "Use building message board for arrival." }),
    base({ demoId: "hh-courtyard-6f", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Courtyard 6F", building: "Courtyard Lofts", unitLabel: "6F", householdType: "family", memberCount: 3, location: demoLocation(-0.0012, -0.001), pickupNotes: "Weekend pickup preferred." }),
    base({ demoId: "hh-studio-4g", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Studio 4G", building: "Studio Yard", unitLabel: "4G", householdType: "co_living", memberCount: 6, location: demoLocation(0.0004, 0.0017), pickupNotes: "Shared kitchen pickup point." }),
    base({ demoId: "hh-studio-8h", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Studio 8H", building: "Studio Yard", unitLabel: "8H", householdType: "student_flat", memberCount: 4, location: demoLocation(0.0007, 0.0019), pickupNotes: "Front desk parcel cupboard." }),
  ],
  merchants: [
    base({ demoId: "merchant-river-pantry", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "River Pantry", merchantType: "grocer", locationName: "Riverside Arcade Unit A", location: demoLocation(0.0018, 0.0004), pickupWindow: "Daily 16:00-19:00" }),
    base({ demoId: "merchant-courtyard-bakehouse", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Courtyard Bakehouse", merchantType: "bakery", locationName: "Courtyard Market Stall 3", location: demoLocation(-0.0018, -0.0004), pickupWindow: "Daily 17:00-18:30" }),
    base({ demoId: "merchant-thread-and-press", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, displayName: "Thread And Press", merchantType: "dry_cleaner", locationName: "Riverside Arcade Unit C", location: demoLocation(0.0015, 0.0007), pickupWindow: "Weekdays 08:00-18:00" }),
  ],
  catalogItems: [
    base({ demoId: "cat-wraps", category: "grocery", name: "Sealed tortilla wraps", unit: "pack", tags: ["sealed", "bakery"], baselineShelfLifeDays: 7, safetyShareableWhenSealed: true }),
    base({ demoId: "cat-spinach", category: "grocery", name: "Baby spinach", unit: "bag", tags: ["fresh", "leafy"], baselineShelfLifeDays: 4, safetyShareableWhenSealed: false }),
    base({ demoId: "cat-mushrooms", category: "grocery", name: "Closed cup mushrooms", unit: "punnet", tags: ["fresh"], baselineShelfLifeDays: 5, safetyShareableWhenSealed: false }),
    base({ demoId: "cat-yoghurt", category: "grocery", name: "Greek yoghurt", unit: "pot", tags: ["dairy", "sealed"], baselineShelfLifeDays: 10, safetyShareableWhenSealed: true }),
    base({ demoId: "cat-rice", category: "grocery", name: "Long grain rice", unit: "bag", tags: ["pantry"], baselineShelfLifeDays: 365, safetyShareableWhenSealed: true }),
    base({ demoId: "cat-lentils", category: "grocery", name: "Red lentils", unit: "bag", tags: ["pantry"], baselineShelfLifeDays: 365, safetyShareableWhenSealed: true }),
    base({ demoId: "cat-coriander", category: "grocery", name: "Fresh coriander", unit: "bunch", tags: ["herb"], baselineShelfLifeDays: 3, safetyShareableWhenSealed: false }),
    base({ demoId: "cat-eggs", category: "grocery", name: "Free range eggs", unit: "box", tags: ["dairy"], baselineShelfLifeDays: 21, safetyShareableWhenSealed: true }),
    base({ demoId: "cat-sourdough", category: "grocery", name: "Sourdough loaf", unit: "loaf", tags: ["bakery"], baselineShelfLifeDays: 3, safetyShareableWhenSealed: false }),
    base({ demoId: "cat-vegbox", category: "grocery", name: "Student veg box", unit: "box", tags: ["bundle", "merchant"], baselineShelfLifeDays: 6, safetyShareableWhenSealed: false }),
    base({ demoId: "cat-black-dress", category: "fashion", name: "Black midi dress", unit: "item", tags: ["occasion", "formal"] }),
    base({ demoId: "cat-green-dress", category: "fashion", name: "Green satin dress", unit: "item", tags: ["occasion", "formal"] }),
    base({ demoId: "cat-navy-blazer", category: "fashion", name: "Navy blazer", unit: "item", tags: ["smart", "outerwear"] }),
    base({ demoId: "cat-trench", category: "fashion", name: "Light trench coat", unit: "item", tags: ["outerwear"] }),
    base({ demoId: "cat-party-bag", category: "fashion", name: "Small evening bag", unit: "item", tags: ["accessory"] }),
    base({ demoId: "cat-steamer", category: "household", name: "Garment steamer", unit: "item", tags: ["cleaning", "occasion"] }),
    base({ demoId: "cat-drill", category: "household", name: "Cordless drill", unit: "item", tags: ["tool"] }),
    base({ demoId: "cat-airbed", category: "household", name: "Single air bed", unit: "item", tags: ["guest"] }),
    base({ demoId: "cat-folding-table", category: "household", name: "Folding table", unit: "item", tags: ["event"] }),
    base({ demoId: "cat-projector", category: "household", name: "Mini projector", unit: "item", tags: ["event"] }),
  ],
  itemInstances: [
    base({ demoId: "item-wraps-atrium-2a", householdId: "hh-atrium-2a", catalogItemId: "cat-wraps", category: "grocery", displayName: "Unopened tortilla wraps", quantity: 2, unit: "pack", state: "use_soon", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-26", estimatedUseByBand: "freeze_share_soon" }),
    base({ demoId: "item-spinach-atrium-2a", householdId: "hh-atrium-2a", catalogItemId: "cat-spinach", category: "grocery", displayName: "Baby spinach", quantity: 1, unit: "bag", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-27", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-mushrooms-atrium-2a", householdId: "hh-atrium-2a", catalogItemId: "cat-mushrooms", category: "grocery", displayName: "Closed cup mushrooms", quantity: 1, unit: "punnet", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-27", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-yoghurt-atrium-5c", householdId: "hh-atrium-5c", catalogItemId: "cat-yoghurt", category: "grocery", displayName: "Sealed Greek yoghurt", quantity: 2, unit: "pot", state: "use_soon", safetyStatus: "eligible", storageState: "fridge", purchaseDate: "2026-06-24", estimatedUseByBand: "uncertain_scan_label", labelUseByDate: "2026-07-02" }),
    base({ demoId: "item-rice-atrium-5c", householdId: "hh-atrium-5c", catalogItemId: "cat-rice", category: "grocery", displayName: "Long grain rice", quantity: 1, unit: "bag", state: "private", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-18", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-lentils-canopy-1b", householdId: "hh-canopy-1b", catalogItemId: "cat-lentils", category: "grocery", displayName: "Red lentils", quantity: 2, unit: "bag", state: "private", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-12", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-coriander-canopy-1b", householdId: "hh-canopy-1b", catalogItemId: "cat-coriander", category: "grocery", displayName: "Fresh coriander", quantity: 1, unit: "bunch", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-28", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-eggs-canopy-7d", householdId: "hh-canopy-7d", catalogItemId: "cat-eggs", category: "grocery", displayName: "Free range eggs", quantity: 1, unit: "box", state: "private", safetyStatus: "eligible", storageState: "fridge", purchaseDate: "2026-06-20", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-sourdough-canopy-7d", householdId: "hh-canopy-7d", catalogItemId: "cat-sourdough", category: "grocery", displayName: "Sourdough loaf", quantity: 1, unit: "loaf", state: "private", safetyStatus: "restricted", storageState: "cupboard", purchaseDate: "2026-06-28", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-wraps-courtyard-3e", householdId: "hh-courtyard-3e", catalogItemId: "cat-wraps", category: "grocery", displayName: "Wholemeal wraps", quantity: 1, unit: "pack", state: "listed", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-25", estimatedUseByBand: "freeze_share_soon" }),
    base({ demoId: "item-yoghurt-courtyard-3e", householdId: "hh-courtyard-3e", catalogItemId: "cat-yoghurt", category: "grocery", displayName: "Sealed natural yoghurt", quantity: 1, unit: "pot", state: "use_soon", safetyStatus: "eligible", storageState: "fridge", purchaseDate: "2026-06-22", estimatedUseByBand: "uncertain_scan_label" }),
    base({ demoId: "item-rice-courtyard-6f", householdId: "hh-courtyard-6f", catalogItemId: "cat-rice", category: "grocery", displayName: "Basmati rice", quantity: 2, unit: "bag", state: "private", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-10", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-lentils-courtyard-6f", householdId: "hh-courtyard-6f", catalogItemId: "cat-lentils", category: "grocery", displayName: "Red lentils", quantity: 1, unit: "bag", state: "private", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-10", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-spinach-studio-4g", householdId: "hh-studio-4g", catalogItemId: "cat-spinach", category: "grocery", displayName: "Baby spinach", quantity: 2, unit: "bag", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-28", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-mushrooms-studio-4g", householdId: "hh-studio-4g", catalogItemId: "cat-mushrooms", category: "grocery", displayName: "Mushrooms", quantity: 1, unit: "punnet", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-27", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-coriander-studio-8h", householdId: "hh-studio-8h", catalogItemId: "cat-coriander", category: "grocery", displayName: "Coriander", quantity: 1, unit: "bunch", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-28", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-eggs-studio-8h", householdId: "hh-studio-8h", catalogItemId: "cat-eggs", category: "grocery", displayName: "Eggs", quantity: 1, unit: "box", state: "private", safetyStatus: "eligible", storageState: "fridge", purchaseDate: "2026-06-23", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-vegbox-atrium-2a", householdId: "hh-atrium-2a", catalogItemId: "cat-vegbox", category: "grocery", displayName: "Student veg box", quantity: 1, unit: "box", state: "private", safetyStatus: "restricted", storageState: "fridge", purchaseDate: "2026-06-28", estimatedUseByBand: "probably_this_week" }),
    base({ demoId: "item-sourdough-atrium-5c", householdId: "hh-atrium-5c", catalogItemId: "cat-sourdough", category: "grocery", displayName: "Seeded sourdough", quantity: 1, unit: "loaf", state: "private", safetyStatus: "restricted", storageState: "cupboard", purchaseDate: "2026-06-28", estimatedUseByBand: "use_first" }),
    base({ demoId: "item-wraps-canopy-7d", householdId: "hh-canopy-7d", catalogItemId: "cat-wraps", category: "grocery", displayName: "Gluten free wraps", quantity: 1, unit: "pack", state: "use_soon", safetyStatus: "eligible", storageState: "cupboard", purchaseDate: "2026-06-25", estimatedUseByBand: "freeze_share_soon" }),
    base({ demoId: "item-black-dress-canopy-1b", householdId: "hh-canopy-1b", catalogItemId: "cat-black-dress", category: "fashion", displayName: "Black midi dress", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "UK 10", condition: "excellent", availabilityNote: "Available Friday to Sunday.", lendingTerms: "Rental deposit required." }),
    base({ demoId: "item-green-dress-courtyard-3e", householdId: "hh-courtyard-3e", catalogItemId: "cat-green-dress", category: "fashion", displayName: "Green satin dress", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "UK 8", condition: "excellent", availabilityNote: "Available weekends.", lendingTerms: "Dry clean or pay cleaning fee." }),
    base({ demoId: "item-navy-blazer-atrium-5c", householdId: "hh-atrium-5c", catalogItemId: "cat-navy-blazer", category: "fashion", displayName: "Navy blazer", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "M", condition: "good", availabilityNote: "Weekday evenings.", lendingTerms: "Return next day." }),
    base({ demoId: "item-trench-courtyard-6f", householdId: "hh-courtyard-6f", catalogItemId: "cat-trench", category: "fashion", displayName: "Light trench coat", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "S", condition: "good", availabilityNote: "Available after 18:00.", lendingTerms: "No deposit for neighbours." }),
    base({ demoId: "item-party-bag-studio-4g", householdId: "hh-studio-4g", catalogItemId: "cat-party-bag", category: "fashion", displayName: "Small evening bag", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "One size", condition: "excellent", availabilityNote: "Any evening.", lendingTerms: "Return within 48 hours." }),
    base({ demoId: "item-black-dress-studio-8h", householdId: "hh-studio-8h", catalogItemId: "cat-black-dress", category: "fashion", displayName: "Black formal dress", quantity: 1, unit: "item", state: "private", safetyStatus: "eligible", size: "UK 12", condition: "good", availabilityNote: "Could list after cleaning.", lendingTerms: "Not currently public." }),
    base({ demoId: "item-green-dress-atrium-2a", householdId: "hh-atrium-2a", catalogItemId: "cat-green-dress", category: "fashion", displayName: "Green occasion dress", quantity: 1, unit: "item", state: "private", safetyStatus: "eligible", size: "UK 10", condition: "excellent", availabilityNote: "Owner considering rental.", lendingTerms: "Not currently public." }),
    base({ demoId: "item-blazer-canopy-7d", householdId: "hh-canopy-7d", catalogItemId: "cat-navy-blazer", category: "fashion", displayName: "Navy blazer", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "L", condition: "good", availabilityNote: "Weekends.", lendingTerms: "Return clean." }),
    base({ demoId: "item-trench-atrium-5c", householdId: "hh-atrium-5c", catalogItemId: "cat-trench", category: "fashion", displayName: "Tan trench coat", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "M", condition: "good", availabilityNote: "Friday to Monday.", lendingTerms: "Deposit preferred." }),
    base({ demoId: "item-party-bag-courtyard-6f", householdId: "hh-courtyard-6f", catalogItemId: "cat-party-bag", category: "fashion", displayName: "Silver evening bag", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", size: "One size", condition: "excellent", availabilityNote: "Available anytime.", lendingTerms: "Return within 72 hours." }),
    base({ demoId: "item-steamer-atrium-2a", householdId: "hh-atrium-2a", catalogItemId: "cat-steamer", category: "household", displayName: "Garment steamer", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", condition: "good", availabilityNote: "Borrow for one evening.", lendingTerms: "Return with water tank empty." }),
    base({ demoId: "item-drill-canopy-7d", householdId: "hh-canopy-7d", catalogItemId: "cat-drill", category: "household", displayName: "Cordless drill", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", condition: "good", availabilityNote: "Available weekends.", lendingTerms: "Includes basic bit set." }),
    base({ demoId: "item-airbed-courtyard-6f", householdId: "hh-courtyard-6f", catalogItemId: "cat-airbed", category: "household", displayName: "Single air bed", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", condition: "good", availabilityNote: "Available for guests.", lendingTerms: "Return deflated and dry." }),
    base({ demoId: "item-folding-table-studio-4g", householdId: "hh-studio-4g", catalogItemId: "cat-folding-table", category: "household", displayName: "Folding table", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", condition: "good", availabilityNote: "Weekend events.", lendingTerms: "Pickup from shared kitchen." }),
    base({ demoId: "item-projector-studio-8h", householdId: "hh-studio-8h", catalogItemId: "cat-projector", category: "household", displayName: "Mini projector", quantity: 1, unit: "item", state: "listed", safetyStatus: "eligible", condition: "excellent", availabilityNote: "Evenings only.", lendingTerms: "Deposit required." }),
    base({ demoId: "item-steamer-courtyard-3e", householdId: "hh-courtyard-3e", catalogItemId: "cat-steamer", category: "household", displayName: "Travel garment steamer", quantity: 1, unit: "item", state: "private", safetyStatus: "eligible", condition: "good", availabilityNote: "Could lend after testing.", lendingTerms: "Not currently public." }),
  ],
  needs: [
    base({ demoId: "need-wraps-tonight", householdId: "hh-studio-4g", category: "grocery", title: "Wraps or tortillas for dinner", requestedBy: "Studio 4G shared kitchen", status: "open", neededBy: "2026-06-29T19:00:00.000Z", radiusMeters: 500, maxPricePence: 300, notes: "Sealed pack only.", location: demoLocation(0.0004, 0.0017) }),
    base({ demoId: "need-coriander-curry", householdId: "hh-atrium-5c", category: "grocery", title: "Fresh coriander for curry night", requestedBy: "Atrium 5C", status: "open", neededBy: "2026-06-29T18:30:00.000Z", radiusMeters: 400, maxPricePence: 150, notes: "Small bunch is enough.", location: demoLocation(0.0011, -0.0002) }),
    base({ demoId: "need-wedding-outfit", householdId: "hh-canopy-7d", category: "fashion", title: "Wedding guest outfit this weekend", requestedBy: "Canopy 7D", status: "open", neededBy: "2026-07-03T12:00:00.000Z", radiusMeters: 700, maxPricePence: 2500, notes: "UK 8-10 dress or capsule pieces.", location: demoLocation(-0.0002, 0.0012) }),
    base({ demoId: "need-cordless-drill", householdId: "hh-atrium-2a", category: "household", title: "Borrow a drill for shelf brackets", requestedBy: "Atrium 2A", status: "open", neededBy: "2026-06-30T17:00:00.000Z", radiusMeters: 600, maxPricePence: 500, notes: "One hour borrow window.", location: demoLocation(0.0008, -0.0005) }),
    base({ demoId: "need-projector-social", householdId: "hh-courtyard-3e", category: "household", title: "Projector for common-room film night", requestedBy: "Courtyard 3E", status: "open", neededBy: "2026-07-01T20:00:00.000Z", radiusMeters: 800, maxPricePence: 1000, notes: "HDMI input preferred.", location: demoLocation(-0.0009, -0.0008) }),
  ],
  demandPools: [
    base({ demoId: "pool-student-pantry", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, title: "Student pantry staples", category: "grocery", status: "gathering", thresholdHouseholds: 6, maxPricePencePerHousehold: 1200, closesAt: "2026-07-01T12:00:00.000Z", pickupRadiusMeters: 750, requestedItems: ["Rice", "lentils", "pasta", "tinned tomatoes"] }),
    base({ demoId: "pool-sunday-veg", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, title: "Sunday veg bundle", category: "grocery", status: "gathering", thresholdHouseholds: 8, maxPricePencePerHousehold: 1400, closesAt: "2026-07-03T10:00:00.000Z", pickupRadiusMeters: 850, requestedItems: ["Potatoes", "carrots", "greens", "herbs"] }),
    base({ demoId: "pool-move-in-kit", neighbourhoodId: DEMO_NEIGHBOURHOOD_ID, title: "Move-in cleaning kit", category: "household", status: "gathering", thresholdHouseholds: 5, maxPricePencePerHousehold: 900, closesAt: "2026-07-05T15:00:00.000Z", pickupRadiusMeters: 700, requestedItems: ["Laundry tabs", "surface spray", "sponges", "bin bags"] }),
  ],
  demandPoolCommitments: [
    base({ demoId: "commit-pantry-atrium-2a", poolId: "pool-student-pantry", householdId: "hh-atrium-2a", quantity: 1, maxPricePence: 1200, committedAt: "2026-06-29T09:15:00.000Z" }),
    base({ demoId: "commit-pantry-atrium-5c", poolId: "pool-student-pantry", householdId: "hh-atrium-5c", quantity: 1, maxPricePence: 1100, committedAt: "2026-06-29T09:20:00.000Z" }),
    base({ demoId: "commit-pantry-studio-4g", poolId: "pool-student-pantry", householdId: "hh-studio-4g", quantity: 1, maxPricePence: 1200, committedAt: "2026-06-29T09:25:00.000Z" }),
    base({ demoId: "commit-veg-canopy-1b", poolId: "pool-sunday-veg", householdId: "hh-canopy-1b", quantity: 1, maxPricePence: 1400, committedAt: "2026-06-29T09:30:00.000Z" }),
    base({ demoId: "commit-veg-courtyard-6f", poolId: "pool-sunday-veg", householdId: "hh-courtyard-6f", quantity: 1, maxPricePence: 1300, committedAt: "2026-06-29T09:35:00.000Z" }),
    base({ demoId: "commit-kit-studio-8h", poolId: "pool-move-in-kit", householdId: "hh-studio-8h", quantity: 1, maxPricePence: 900, committedAt: "2026-06-29T09:40:00.000Z" }),
    base({ demoId: "commit-kit-canopy-7d", poolId: "pool-move-in-kit", householdId: "hh-canopy-7d", quantity: 1, maxPricePence: 900, committedAt: "2026-06-29T09:45:00.000Z" }),
  ],
  merchantBids: [
    base({ demoId: "bid-pantry-river-pantry", poolId: "pool-student-pantry", merchantId: "merchant-river-pantry", status: "submitted", pricePencePerHousehold: 1080, pickupWindow: "2026-07-01 16:00-19:00", substitutionPolicy: "Equivalent pantry staple substitution allowed.", fulfilmentNotes: "Can fulfil once six households commit." }),
    base({ demoId: "bid-veg-river-pantry", poolId: "pool-sunday-veg", merchantId: "merchant-river-pantry", status: "submitted", pricePencePerHousehold: 1320, pickupWindow: "2026-07-03 15:00-18:00", substitutionPolicy: "Seasonal vegetable substitutions allowed.", fulfilmentNotes: "Requires eight household threshold." }),
  ],
  storeDrops: [
    base({ demoId: "drop-bakehouse-evening-boxes", merchantId: "merchant-courtyard-bakehouse", title: "Evening bakery surplus box", status: "published", quantityTotal: 12, quantityReserved: 0, pricePence: 350, pickupWindow: "2026-06-29T17:00:00.000Z/2026-06-29T18:30:00.000Z", safetyNotes: "Merchant-packed same-day baked goods.", location: demoLocation(-0.0018, -0.0004) }),
    base({ demoId: "drop-river-pantry-veg-bags", merchantId: "merchant-river-pantry", title: "Close-of-day veg bag", status: "published", quantityTotal: 10, quantityReserved: 0, pricePence: 450, pickupWindow: "2026-06-29T18:00:00.000Z/2026-06-29T19:00:00.000Z", safetyNotes: "Merchant-packed produce; wash before use.", location: demoLocation(0.0018, 0.0004) }),
  ],
  receiptImports: [
    base({ demoId: "receipt-atrium-2a-river-pantry", householdId: "hh-atrium-2a", merchantName: "River Pantry", purchaseDate: "2026-06-27", parsedAt: "2026-06-29T09:05:00.000Z", source: "seeded_parsed_receipt" }),
  ],
  receiptLineItems: [
    base({ demoId: "receipt-line-spinach", receiptImportId: "receipt-atrium-2a-river-pantry", catalogItemId: "cat-spinach", rawText: "BABY SPINACH 200G", quantity: 1, pricePence: 180 }),
    base({ demoId: "receipt-line-mushrooms", receiptImportId: "receipt-atrium-2a-river-pantry", catalogItemId: "cat-mushrooms", rawText: "CLOSED CUP MUSHROOMS", quantity: 1, pricePence: 160 }),
    base({ demoId: "receipt-line-wraps", receiptImportId: "receipt-atrium-2a-river-pantry", catalogItemId: "cat-wraps", rawText: "TORTILLA WRAPS 8PK", quantity: 2, pricePence: 240 }),
    base({ demoId: "receipt-line-yoghurt", receiptImportId: "receipt-atrium-2a-river-pantry", catalogItemId: "cat-yoghurt", rawText: "GREEK YOGHURT 500G", quantity: 1, pricePence: 220 }),
    base({ demoId: "receipt-line-coriander", receiptImportId: "receipt-atrium-2a-river-pantry", catalogItemId: "cat-coriander", rawText: "FRESH CORIANDER", quantity: 1, pricePence: 95 }),
  ],
  expiryLabels: [
    base({ demoId: "expiry-label-yoghurt-atrium-5c", itemInstanceId: "item-yoghurt-atrium-5c", source: "seeded_parsed_expiry_label", rawText: "USE BY 02 JUL 2026", parsedUseByDate: "2026-07-02" }),
  ],
  gs1DigitalLinks: [
    {
      demoScope: DEMO_SCOPE,
      url: "https://id.gs1.org/01/09506000134352/10/RQ26A/15/260704",
      gtin: "09506000134352",
      lot: "RQ26A",
      bestBefore: "2026-07-04",
    },
  ],
};

export const RIVERSIDE_QUARTER_EXPECTED_COUNTS = {
  households: 8,
  merchants: 3,
  groceryItemInstances: 20,
  fashionItemInstances: 10,
  householdItemInstances: 6,
  needs: 5,
  demandPools: 3,
  storeDrops: 2,
  receiptImports: 1,
  expiryLabels: 1,
  gs1DigitalLinks: 1,
} as const;

export function summarizeDemoWorld(world: DemoWorldFixture = RIVERSIDE_QUARTER_DEMO_WORLD) {
  const countItemsByCategory = (category: ItemCategory) =>
    world.itemInstances.filter((item) => item.category === category).length;

  return {
    demoScope: world.metadata.demoScope,
    seedVersion: world.metadata.seedVersion,
    neighbourhoods: 1,
    households: world.households.length,
    merchants: world.merchants.length,
    catalogItems: world.catalogItems.length,
    itemInstances: world.itemInstances.length,
    groceryItemInstances: countItemsByCategory("grocery"),
    fashionItemInstances: countItemsByCategory("fashion"),
    householdItemInstances: countItemsByCategory("household"),
    needs: world.needs.length,
    demandPools: world.demandPools.length,
    demandPoolCommitments: world.demandPoolCommitments.length,
    merchantBids: world.merchantBids.length,
    storeDrops: world.storeDrops.length,
    receiptImports: world.receiptImports.length,
    receiptLineItems: world.receiptLineItems.length,
    expiryLabels: world.expiryLabels.length,
    gs1DigitalLinks: world.gs1DigitalLinks.length,
  };
}

export function listSeededFinalOutputViolations(world: unknown): string[] {
  if (!world || typeof world !== "object") {
    return [];
  }

  return FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS.filter((collectionName) => {
    const maybeCollection = (world as Record<string, unknown>)[collectionName];
    return Array.isArray(maybeCollection) && maybeCollection.length > 0;
  });
}
