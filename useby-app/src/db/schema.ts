import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const itemCategoryValues = ["grocery", "fashion", "household"] as const;
export const itemStateValues = [
  "private",
  "use_soon",
  "listed",
  "offered",
  "reserved",
  "picked_up",
  "handed_off",
  "returned",
  "completed",
  "consumed",
  "expired",
  "cancelled",
  "disputed",
] as const;
export const storageStateValues = [
  "sealed",
  "opened",
  "fridge",
  "freezer",
  "cupboard",
  "cooked",
] as const;
export const safetyStatusValues = ["eligible", "restricted", "blocked", "unknown"] as const;
export const needStatusValues = ["open", "matched", "fulfilled", "expired", "cancelled"] as const;
export const poolStatusValues = [
  "draft",
  "gathering",
  "threshold_met",
  "bidding",
  "awarded",
  "ready_for_pickup",
  "fulfilled",
  "expired",
  "cancelled",
] as const;
export const bidStatusValues = [
  "submitted",
  "winning",
  "rejected",
  "withdrawn",
  "fulfilled",
  "cancelled",
] as const;
export const memberRoleValues = ["owner", "adult", "child", "guest"] as const;
export const merchantUserRoleValues = ["owner", "manager", "staff"] as const;
export const membershipStatusValues = ["active", "invited", "removed"] as const;
export const inventoryEventTypeValues = [
  "created",
  "observed",
  "state_changed",
  "quantity_adjusted",
  "location_changed",
  "deleted",
] as const;
export const commitmentStatusValues = ["active", "cancelled", "fulfilled"] as const;
export const fileRoleValues = [
  "receipt",
  "expiry_label",
  "item_photo",
  "profile_photo",
  "merchant_asset",
] as const;
export const jobRunStatusValues = ["started", "succeeded", "failed", "skipped"] as const;
export const idempotencyStatusValues = ["started", "completed", "failed"] as const;
export const seedBatchStatusValues = ["started", "applied", "failed", "rolled_back"] as const;
export const receiptImportStatusValues = ["started", "parsed", "applied", "failed"] as const;
export const expiryObservationSourceValues = ["receipt", "label", "manual", "gs1", "system"] as const;
export const expiryConfidenceValues = ["low", "medium", "high", "confirmed"] as const;
export const matchStatusValues = [
  "active",
  "proposed",
  "accepted",
  "rejected",
  "expired",
  "converted",
  "invalidated",
] as const;
export const actionCardStatusValues = [
  "active",
  "dismissed",
  "snoozed",
  "completed",
  "invalidated",
] as const;
export const bookingStatusValues = [
  "requested",
  "accepted",
  "reserved",
  "pickup_scheduled",
  "picked_up",
  "returned",
  "completed",
  "reviewed",
  "cancelled",
  "declined",
  "disputed",
] as const;
export const handoffStatusValues = [
  "pending",
  "scheduled",
  "picked_up",
  "returned",
  "completed",
  "cancelled",
  "disputed",
] as const;
export const trustEventTypeValues = [
  "booking_completed",
  "booking_reviewed",
  "booking_cancelled",
  "report_submitted",
  "block_created",
] as const;
export const reviewRatingValues = [
  "positive",
  "neutral",
  "negative",
] as const;
export const reportStatusValues = [
  "open",
  "under_review",
  "resolved",
  "dismissed",
] as const;
export const blockStatusValues = ["active", "lifted"] as const;

export const itemCategoryEnum = pgEnum("item_category", itemCategoryValues);
export const itemStateEnum = pgEnum("item_state", itemStateValues);
export const storageStateEnum = pgEnum("storage_state", storageStateValues);
export const safetyStatusEnum = pgEnum("safety_status", safetyStatusValues);
export const needStatusEnum = pgEnum("need_status", needStatusValues);
export const poolStatusEnum = pgEnum("pool_status", poolStatusValues);
export const bidStatusEnum = pgEnum("bid_status", bidStatusValues);
export const memberRoleEnum = pgEnum("member_role", memberRoleValues);
export const merchantUserRoleEnum = pgEnum("merchant_user_role", merchantUserRoleValues);
export const membershipStatusEnum = pgEnum("membership_status", membershipStatusValues);
export const inventoryEventTypeEnum = pgEnum("inventory_event_type", inventoryEventTypeValues);
export const commitmentStatusEnum = pgEnum("commitment_status", commitmentStatusValues);
export const fileRoleEnum = pgEnum("file_role", fileRoleValues);
export const jobRunStatusEnum = pgEnum("job_run_status", jobRunStatusValues);
export const idempotencyStatusEnum = pgEnum("idempotency_status", idempotencyStatusValues);
export const seedBatchStatusEnum = pgEnum("seed_batch_status", seedBatchStatusValues);
export const receiptImportStatusEnum = pgEnum("receipt_import_status", receiptImportStatusValues);
export const expiryObservationSourceEnum = pgEnum("expiry_observation_source", expiryObservationSourceValues);
export const expiryConfidenceEnum = pgEnum("expiry_confidence", expiryConfidenceValues);
export const matchStatusEnum = pgEnum("match_status", matchStatusValues);
export const actionCardStatusEnum = pgEnum("action_card_status", actionCardStatusValues);
export const bookingStatusEnum = pgEnum("booking_status", bookingStatusValues);
export const handoffStatusEnum = pgEnum("handoff_status", handoffStatusValues);
export const trustEventTypeEnum = pgEnum("trust_event_type", trustEventTypeValues);
export const reviewRatingEnum = pgEnum("review_rating", reviewRatingValues);
export const reportStatusEnum = pgEnum("report_status", reportStatusValues);
export const blockStatusEnum = pgEnum("block_status", blockStatusValues);

type JsonObject = Record<string, unknown>;
type GeographyPoint = string;

export const geographyPoint = customType<{
  data: GeographyPoint;
  driverData: string;
  config: { srid?: number };
}>({
  dataType(config) {
    return `geography(Point, ${config?.srid ?? 4326})`;
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

const demoScope = {
  demoScopeId: text("demo_scope_id"),
  isDemo: boolean("is_demo").default(false).notNull(),
};

const metadata = (name = "metadata") =>
  jsonb(name).$type<JsonObject>().default(sql`'{}'::jsonb`).notNull();

export const neighbourhoods = pgTable(
  "neighbourhoods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: text("name").notNull(),
    city: text("city"),
    countryCode: varchar("country_code", { length: 2 }).default("GB").notNull(),
    timezone: text("timezone").default("Europe/London").notNull(),
    centerLocation: geographyPoint("center_location", { srid: 4326 }).notNull(),
    serviceRadiusMeters: integer("service_radius_meters").default(1500).notNull(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("neighbourhoods_slug_idx").on(table.slug),
    index("neighbourhoods_center_location_gix").using("gist", table.centerLocation),
    index("neighbourhoods_demo_scope_idx").on(table.demoScopeId),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    authSubject: text("auth_subject"),
    avatarFileId: uuid("avatar_file_id"),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_auth_subject_idx").on(table.authSubject).where(sql`${table.authSubject} is not null`),
    index("users_demo_scope_idx").on(table.demoScopeId),
  ],
);

export const households = pgTable(
  "households",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    publicLabel: text("public_label").notNull(),
    homeLocation: geographyPoint("home_location", { srid: 4326 }).notNull(),
    coarseLocationLabel: text("coarse_location_label").notNull(),
    trustScore: integer("trust_score").default(0).notNull(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("households_neighbourhood_idx").on(table.neighbourhoodId),
    index("households_home_location_gix").using("gist", table.homeLocation),
    index("households_demo_scope_idx").on(table.demoScopeId),
    check("households_trust_score_non_negative", sql`${table.trustScore} >= 0`),
  ],
);

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").default("adult").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("household_members_household_user_idx").on(table.householdId, table.userId),
    index("household_members_user_idx").on(table.userId),
    index("household_members_status_idx").on(table.status),
  ],
);

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    websiteUrl: text("website_url"),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("merchants_slug_idx").on(table.slug),
    index("merchants_demo_scope_idx").on(table.demoScopeId),
  ],
);

export const merchantUsers = pgTable(
  "merchant_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: merchantUserRoleEnum("role").default("staff").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("merchant_users_merchant_user_idx").on(table.merchantId, table.userId),
    index("merchant_users_user_idx").on(table.userId),
  ],
);

export const merchantLocations = pgTable(
  "merchant_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    neighbourhoodId: uuid("neighbourhood_id").references(() => neighbourhoods.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    publicAddress: text("public_address").notNull(),
    location: geographyPoint("location", { srid: 4326 }).notNull(),
    pickupNotes: text("pickup_notes"),
    isActive: boolean("is_active").default(true).notNull(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("merchant_locations_merchant_idx").on(table.merchantId),
    index("merchant_locations_neighbourhood_idx").on(table.neighbourhoodId),
    index("merchant_locations_location_gix").using("gist", table.location),
  ],
);

export const itemCatalog = pgTable(
  "item_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
    externalRef: text("external_ref"),
    category: itemCategoryEnum("category").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    description: text("description"),
    defaultStorageState: storageStateEnum("default_storage_state").default("cupboard").notNull(),
    defaultSafetyStatus: safetyStatusEnum("default_safety_status").default("unknown").notNull(),
    allergens: text("allergens").array().default(sql`ARRAY[]::text[]`).notNull(),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("item_catalog_merchant_external_ref_idx")
      .on(table.merchantId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    index("item_catalog_category_idx").on(table.category),
    index("item_catalog_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
  ],
);

export const itemInstances = pgTable(
  "item_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogItemId: uuid("catalog_item_id").references(() => itemCatalog.id, { onDelete: "set null" }),
    ownerHouseholdId: uuid("owner_household_id").references(() => households.id, { onDelete: "set null" }),
    merchantLocationId: uuid("merchant_location_id").references(() => merchantLocations.id, { onDelete: "set null" }),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    category: itemCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).default("1").notNull(),
    unit: text("unit").default("each").notNull(),
    itemState: itemStateEnum("item_state").default("private").notNull(),
    storageState: storageStateEnum("storage_state").default("cupboard").notNull(),
    safetyStatus: safetyStatusEnum("safety_status").default("unknown").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    useByDate: date("use_by_date"),
    bestBeforeDate: date("best_before_date"),
    location: geographyPoint("location", { srid: 4326 }),
    sourceType: text("source_type").default("manual").notNull(),
    sourceRef: text("source_ref"),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("item_instances_neighbourhood_state_idx").on(table.neighbourhoodId, table.itemState),
    index("item_instances_owner_household_idx").on(table.ownerHouseholdId),
    index("item_instances_merchant_location_idx").on(table.merchantLocationId),
    index("item_instances_expiry_idx").on(table.expiresAt),
    index("item_instances_location_gix").using("gist", table.location),
    check("item_instances_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const inventoryEvents = pgTable(
  "inventory_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemInstanceId: uuid("item_instance_id")
      .notNull()
      .references(() => itemInstances.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
    merchantLocationId: uuid("merchant_location_id").references(() => merchantLocations.id, { onDelete: "set null" }),
    eventType: inventoryEventTypeEnum("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    deltaQuantity: numeric("delta_quantity", { precision: 12, scale: 3 }),
    fromState: itemStateEnum("from_state"),
    toState: itemStateEnum("to_state"),
    auditEventId: uuid("audit_event_id"),
    metadata: metadata(),
    ...timestamps,
  },
  (table) => [
    index("inventory_events_item_idx").on(table.itemInstanceId, table.occurredAt),
    index("inventory_events_household_idx").on(table.householdId),
  ],
);

export const needs = pgTable(
  "needs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    category: itemCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).default("1").notNull(),
    unit: text("unit").default("each").notNull(),
    status: needStatusEnum("status").default("open").notNull(),
    neededBy: timestamp("needed_by", { withTimezone: true }),
    location: geographyPoint("location", { srid: 4326 }).notNull(),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...softDelete,
  },
  (table) => [
    index("needs_neighbourhood_status_idx").on(table.neighbourhoodId, table.status),
    index("needs_household_idx").on(table.householdId),
    index("needs_location_gix").using("gist", table.location),
    index("needs_title_trgm_idx").using("gin", sql`${table.title} gin_trgm_ops`),
    check("needs_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const receiptImports = pgTable(
  "receipt_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    merchantName: text("merchant_name"),
    purchaseDate: date("purchase_date"),
    source: text("source").default("manual").notNull(),
    status: receiptImportStatusEnum("status").default("started").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    rawText: text("raw_text"),
    subtotalCents: integer("subtotal_cents"),
    taxCents: integer("tax_cents"),
    totalCents: integer("total_cents"),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("receipt_imports_idempotency_key_idx").on(table.idempotencyKey),
    index("receipt_imports_household_created_idx").on(table.householdId, table.createdAt),
    index("receipt_imports_neighbourhood_idx").on(table.neighbourhoodId),
    check("receipt_imports_subtotal_non_negative", sql`${table.subtotalCents} is null or ${table.subtotalCents} >= 0`),
    check("receipt_imports_tax_non_negative", sql`${table.taxCents} is null or ${table.taxCents} >= 0`),
    check("receipt_imports_total_non_negative", sql`${table.totalCents} is null or ${table.totalCents} >= 0`),
  ],
);

export const receiptLineItems = pgTable(
  "receipt_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptImportId: uuid("receipt_import_id")
      .notNull()
      .references(() => receiptImports.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id").references(() => itemCatalog.id, { onDelete: "set null" }),
    itemInstanceId: uuid("item_instance_id").references(() => itemInstances.id, { onDelete: "set null" }),
    lineIndex: integer("line_index").notNull(),
    rawText: text("raw_text").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).default("1").notNull(),
    unit: text("unit").default("each").notNull(),
    priceCents: integer("price_cents"),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("receipt_line_items_import_line_idx").on(table.receiptImportId, table.lineIndex),
    index("receipt_line_items_item_instance_idx").on(table.itemInstanceId),
    index("receipt_line_items_catalog_item_idx").on(table.catalogItemId),
    check("receipt_line_items_line_index_non_negative", sql`${table.lineIndex} >= 0`),
    check("receipt_line_items_quantity_positive", sql`${table.quantity} > 0`),
    check("receipt_line_items_price_non_negative", sql`${table.priceCents} is null or ${table.priceCents} >= 0`),
  ],
);

export const expiryObservations = pgTable(
  "expiry_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemInstanceId: uuid("item_instance_id")
      .notNull()
      .references(() => itemInstances.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
    observedByUserId: uuid("observed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    receiptImportId: uuid("receipt_import_id").references(() => receiptImports.id, { onDelete: "set null" }),
    source: expiryObservationSourceEnum("source").default("manual").notNull(),
    confidence: expiryConfidenceEnum("confidence").default("medium").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    useByDate: date("use_by_date"),
    bestBeforeDate: date("best_before_date"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rawText: text("raw_text"),
    note: text("note"),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    index("expiry_observations_item_observed_idx").on(table.itemInstanceId, table.observedAt),
    index("expiry_observations_household_idx").on(table.householdId),
    index("expiry_observations_receipt_idx").on(table.receiptImportId),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    needId: uuid("need_id")
      .notNull()
      .references(() => needs.id, { onDelete: "cascade" }),
    itemInstanceId: uuid("item_instance_id")
      .notNull()
      .references(() => itemInstances.id, { onDelete: "cascade" }),
    requesterHouseholdId: uuid("requester_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    ownerHouseholdId: uuid("owner_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    status: matchStatusEnum("status").default("proposed").notNull(),
    score: numeric("score", { precision: 8, scale: 3 }).default("0").notNull(),
    distanceMeters: integer("distance_meters"),
    rationale: jsonb("rationale").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    recomputeKey: text("recompute_key").notNull(),
    source: text("source").default("recompute").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("matches_recompute_key_idx").on(table.recomputeKey),
    index("matches_neighbourhood_status_idx").on(table.neighbourhoodId, table.status),
    index("matches_need_status_idx").on(table.needId, table.status),
    index("matches_item_status_idx").on(table.itemInstanceId, table.status),
    index("matches_requester_household_idx").on(table.requesterHouseholdId),
    index("matches_owner_household_idx").on(table.ownerHouseholdId),
    check("matches_score_non_negative", sql`${table.score} >= 0`),
    check("matches_distance_non_negative", sql`${table.distanceMeters} is null or ${table.distanceMeters} >= 0`),
  ],
);

export const actionCards = pgTable(
  "action_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    itemInstanceId: uuid("item_instance_id").references(() => itemInstances.id, { onDelete: "cascade" }),
    needId: uuid("need_id").references(() => needs.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    cardType: text("card_type").notNull(),
    status: actionCardStatusEnum("status").default("active").notNull(),
    priority: integer("priority").default(0).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    rationale: jsonb("rationale").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    recomputeKey: text("recompute_key").notNull(),
    source: text("source").default("recompute").notNull(),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("action_cards_recompute_key_idx").on(table.recomputeKey),
    index("action_cards_household_status_idx").on(table.householdId, table.status),
    index("action_cards_neighbourhood_status_idx").on(table.neighbourhoodId, table.status),
    index("action_cards_item_idx").on(table.itemInstanceId),
    index("action_cards_match_idx").on(table.matchId),
    check("action_cards_priority_non_negative", sql`${table.priority} >= 0`),
  ],
);

export const safetyAcknowledgements = pgTable(
  "safety_acknowledgements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    acknowledgementType: text("acknowledgement_type").default("food_handoff").notNull(),
    version: text("version").default("cp3-food-safety-v1").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("safety_ack_household_type_version_idx").on(
      table.householdId,
      table.acknowledgementType,
      table.version,
    ),
    index("safety_ack_household_type_idx").on(table.householdId, table.acknowledgementType),
    index("safety_ack_neighbourhood_idx").on(table.neighbourhoodId),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemInstanceId: uuid("item_instance_id")
      .notNull()
      .references(() => itemInstances.id, { onDelete: "restrict" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    needId: uuid("need_id").references(() => needs.id, { onDelete: "set null" }),
    requesterHouseholdId: uuid("requester_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    ownerHouseholdId: uuid("owner_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerActorUserId: uuid("owner_actor_user_id").references(() => users.id, { onDelete: "set null" }),
    status: bookingStatusEnum("status").default("requested").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).default("1").notNull(),
    unit: text("unit").default("each").notNull(),
    requestNote: text("request_note"),
    declineReason: text("decline_reason"),
    cancelReason: text("cancel_reason"),
    disputeReason: text("dispute_reason"),
    safetyAcknowledgementId: uuid("safety_acknowledgement_id").references(() => safetyAcknowledgements.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    reservedAt: timestamp("reserved_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("bookings_item_status_idx").on(table.itemInstanceId, table.status),
    index("bookings_match_idx").on(table.matchId),
    index("bookings_requester_status_idx").on(table.requesterHouseholdId, table.status),
    index("bookings_owner_status_idx").on(table.ownerHouseholdId, table.status),
    index("bookings_neighbourhood_status_idx").on(table.neighbourhoodId, table.status),
    index("bookings_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("bookings_one_active_reservation_idx")
      .on(table.itemInstanceId)
      .where(sql`${table.status} in ('accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned', 'disputed')`),
    check("bookings_quantity_positive", sql`${table.quantity} > 0`),
    check("bookings_households_distinct", sql`${table.requesterHouseholdId} <> ${table.ownerHouseholdId}`),
  ],
);

export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    status: handoffStatusEnum("status").default("pending").notNull(),
    pickupWindowStart: timestamp("pickup_window_start", { withTimezone: true }),
    pickupWindowEnd: timestamp("pickup_window_end", { withTimezone: true }),
    coarsePickupHint: text("coarse_pickup_hint"),
    scheduledByUserId: uuid("scheduled_by_user_id").references(() => users.id, { onDelete: "set null" }),
    pickedUpByUserId: uuid("picked_up_by_user_id").references(() => users.id, { onDelete: "set null" }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionNote: text("completion_note"),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("handoffs_booking_idx").on(table.bookingId),
    index("handoffs_status_idx").on(table.status),
    check(
      "handoffs_pickup_window_order",
      sql`${table.pickupWindowStart} is null or ${table.pickupWindowEnd} is null or ${table.pickupWindowEnd} > ${table.pickupWindowStart}`,
    ),
  ],
);

export const trustEvents = pgTable(
  "trust_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorHouseholdId: uuid("actor_household_id").references(() => households.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: trustEventTypeEnum("event_type").notNull(),
    delta: integer("delta").default(0).notNull(),
    rationale: text("rationale").notNull(),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    index("trust_events_household_created_idx").on(table.householdId, table.createdAt),
    index("trust_events_booking_idx").on(table.bookingId),
    check("trust_events_delta_bounds", sql`${table.delta} between -100 and 100`),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    reviewerHouseholdId: uuid("reviewer_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    revieweeHouseholdId: uuid("reviewee_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    rating: reviewRatingEnum("rating").notNull(),
    note: text("note"),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("reviews_booking_reviewer_idx").on(table.bookingId, table.reviewerHouseholdId),
    index("reviews_reviewee_created_idx").on(table.revieweeHouseholdId, table.createdAt),
    check("reviews_households_distinct", sql`${table.reviewerHouseholdId} <> ${table.revieweeHouseholdId}`),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterHouseholdId: uuid("reporter_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    reportedHouseholdId: uuid("reported_household_id").references(() => households.id, { onDelete: "set null" }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    status: reportStatusEnum("status").default("open").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("reports_status_created_idx").on(table.status, table.createdAt),
    index("reports_reporter_idx").on(table.reporterHouseholdId),
    index("reports_reported_idx").on(table.reportedHouseholdId),
    index("reports_booking_idx").on(table.bookingId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerHouseholdId: uuid("blocker_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    blockedHouseholdId: uuid("blocked_household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    blockerUserId: uuid("blocker_user_id").references(() => users.id, { onDelete: "set null" }),
    status: blockStatusEnum("status").default("active").notNull(),
    reason: text("reason"),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("blocks_active_pair_idx")
      .on(table.blockerHouseholdId, table.blockedHouseholdId)
      .where(sql`${table.status} = 'active'`),
    index("blocks_blocked_household_idx").on(table.blockedHouseholdId),
    check("blocks_households_distinct", sql`${table.blockerHouseholdId} <> ${table.blockedHouseholdId}`),
  ],
);

export const demandPools = pgTable(
  "demand_pools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    neighbourhoodId: uuid("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.id, { onDelete: "restrict" }),
    createdByHouseholdId: uuid("created_by_household_id").references(() => households.id, { onDelete: "set null" }),
    catalogItemId: uuid("catalog_item_id").references(() => itemCatalog.id, { onDelete: "set null" }),
    awardedBidId: uuid("awarded_bid_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: poolStatusEnum("status").default("gathering").notNull(),
    targetLocation: geographyPoint("target_location", { srid: 4326 }).notNull(),
    thresholdQuantity: numeric("threshold_quantity", { precision: 12, scale: 3 }).notNull(),
    committedQuantity: numeric("committed_quantity", { precision: 12, scale: 3 }).default("0").notNull(),
    thresholdHouseholds: integer("threshold_households").default(3).notNull(),
    committedHouseholds: integer("committed_households").default(0).notNull(),
    unit: text("unit").default("each").notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true }).defaultNow().notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    biddingOpensAt: timestamp("bidding_opens_at", { withTimezone: true }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("demand_pools_neighbourhood_status_idx").on(table.neighbourhoodId, table.status),
    index("demand_pools_catalog_item_idx").on(table.catalogItemId),
    index("demand_pools_target_location_gix").using("gist", table.targetLocation),
    check("demand_pools_threshold_quantity_positive", sql`${table.thresholdQuantity} > 0`),
    check("demand_pools_committed_quantity_non_negative", sql`${table.committedQuantity} >= 0`),
    check("demand_pools_threshold_households_positive", sql`${table.thresholdHouseholds} > 0`),
  ],
);

export const demandPoolCommitments = pgTable(
  "demand_pool_commitments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    demandPoolId: uuid("demand_pool_id")
      .notNull()
      .references(() => demandPools.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit").default("each").notNull(),
    status: commitmentStatusEnum("status").default("active").notNull(),
    idempotencyKey: text("idempotency_key"),
    committedAt: timestamp("committed_at", { withTimezone: true }).defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("demand_pool_commitments_pool_household_idx").on(table.demandPoolId, table.householdId),
    index("demand_pool_commitments_household_idx").on(table.householdId),
    index("demand_pool_commitments_idempotency_idx").on(table.idempotencyKey),
    check("demand_pool_commitments_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const merchantBids = pgTable(
  "merchant_bids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    demandPoolId: uuid("demand_pool_id")
      .notNull()
      .references(() => demandPools.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    merchantLocationId: uuid("merchant_location_id").references(() => merchantLocations.id, { onDelete: "set null" }),
    status: bidStatusEnum("status").default("submitted").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),
    minQuantity: numeric("min_quantity", { precision: 12, scale: 3 }).default("0").notNull(),
    availableQuantity: numeric("available_quantity", { precision: 12, scale: 3 }).notNull(),
    pickupWindowStart: timestamp("pickup_window_start", { withTimezone: true }),
    pickupWindowEnd: timestamp("pickup_window_end", { withTimezone: true }),
    score: numeric("score", { precision: 8, scale: 3 }),
    terms: text("terms"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("merchant_bids_pool_status_idx").on(table.demandPoolId, table.status),
    index("merchant_bids_merchant_idx").on(table.merchantId),
    check("merchant_bids_price_non_negative", sql`${table.priceCents} >= 0`),
    check("merchant_bids_available_quantity_positive", sql`${table.availableQuantity} > 0`),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerHouseholdId: uuid("owner_household_id").references(() => households.id, { onDelete: "set null" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
    uploaderUserId: uuid("uploader_user_id").references(() => users.id, { onDelete: "set null" }),
    role: fileRoleEnum("role").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256"),
    metadata: metadata(),
    ...demoScope,
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("files_bucket_object_key_idx").on(table.bucket, table.objectKey),
    index("files_owner_household_idx").on(table.ownerHouseholdId),
    index("files_merchant_idx").on(table.merchantId),
    check("files_byte_size_non_negative", sql`${table.byteSize} >= 0`),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: text("job_type").notNull(),
    status: jobRunStatusEnum("status").default("started").notNull(),
    neighbourhoodId: uuid("neighbourhood_id").references(() => neighbourhoods.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    attempt: integer("attempt").default(1).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    errorMessage: text("error_message"),
    ...demoScope,
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("job_runs_idempotency_key_idx").on(table.idempotencyKey).where(sql`${table.idempotencyKey} is not null`),
    index("job_runs_type_started_idx").on(table.jobType, table.startedAt),
    index("job_runs_neighbourhood_idx").on(table.neighbourhoodId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorHouseholdId: uuid("actor_household_id").references(() => households.id, { onDelete: "set null" }),
    actorMerchantId: uuid("actor_merchant_id").references(() => merchants.id, { onDelete: "set null" }),
    jobRunId: uuid("job_run_id").references(() => jobRuns.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    source: text("source").notNull(),
    sourceRoute: text("source_route"),
    idempotencyKey: text("idempotency_key"),
    beforeState: jsonb("before_state").$type<JsonObject>(),
    afterState: jsonb("after_state").$type<JsonObject>(),
    metadata: metadata(),
    ...demoScope,
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_actor_user_idx").on(table.actorUserId),
    index("audit_events_created_idx").on(table.createdAt),
    index("audit_events_idempotency_idx").on(table.idempotencyKey),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    status: idempotencyStatusEnum("status").default("started").notNull(),
    responseJson: jsonb("response_json").$type<JsonObject>(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idempotency_keys_key_idx").on(table.key),
    index("idempotency_keys_scope_status_idx").on(table.scope, table.status),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
  ],
);

export const seedBatches = pgTable(
  "seed_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    demoScopeId: text("demo_scope_id").notNull(),
    seedVersion: text("seed_version").notNull(),
    status: seedBatchStatusEnum("status").default("started").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    appliedByUserId: uuid("applied_by_user_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("seed_batches_scope_version_idx").on(table.demoScopeId, table.seedVersion),
    index("seed_batches_status_idx").on(table.status),
  ],
);

export const checkpoint1Tables = {
  neighbourhoods,
  users,
  households,
  householdMembers,
  merchants,
  merchantUsers,
  merchantLocations,
  itemCatalog,
  itemInstances,
  inventoryEvents,
  needs,
  demandPools,
  demandPoolCommitments,
  merchantBids,
  files,
  auditEvents,
  jobRuns,
  idempotencyKeys,
  seedBatches,
};

export const checkpoint2GroceryTables = {
  receiptImports,
  receiptLineItems,
  expiryObservations,
  matches,
  actionCards,
};

export const checkpoint3BookingTables = {
  safetyAcknowledgements,
  bookings,
  handoffs,
  trustEvents,
  reviews,
  reports,
  blocks,
};
