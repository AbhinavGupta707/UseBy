CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN undefined_file THEN
    RAISE NOTICE 'pgvector extension is not available on this Aurora engine; continuing without vector';
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'insufficient privilege to create pgvector extension; continuing without vector';
END
$$;--> statement-breakpoint
CREATE TYPE "public"."bid_status" AS ENUM('submitted', 'winning', 'rejected', 'withdrawn', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('active', 'cancelled', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."file_role" AS ENUM('receipt', 'expiry_label', 'item_photo', 'profile_photo', 'merchant_asset');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."inventory_event_type" AS ENUM('created', 'observed', 'state_changed', 'quantity_adjusted', 'location_changed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('grocery', 'fashion', 'household');--> statement-breakpoint
CREATE TYPE "public"."item_state" AS ENUM('private', 'use_soon', 'listed', 'offered', 'reserved', 'picked_up', 'handed_off', 'returned', 'completed', 'consumed', 'expired', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."job_run_status" AS ENUM('started', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'adult', 'child', 'guest');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'invited', 'removed');--> statement-breakpoint
CREATE TYPE "public"."merchant_user_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."need_status" AS ENUM('open', 'matched', 'fulfilled', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('draft', 'gathering', 'threshold_met', 'bidding', 'awarded', 'ready_for_pickup', 'fulfilled', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."safety_status" AS ENUM('eligible', 'restricted', 'blocked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."seed_batch_status" AS ENUM('started', 'applied', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."storage_state" AS ENUM('sealed', 'opened', 'fridge', 'freezer', 'cupboard', 'cooked');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_household_id" uuid,
	"actor_merchant_id" uuid,
	"job_run_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"source_route" text,
	"idempotency_key" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_pool_commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demand_pool_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"status" "commitment_status" DEFAULT 'active' NOT NULL,
	"idempotency_key" text,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demand_pool_commitments_quantity_positive" CHECK ("demand_pool_commitments"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "demand_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"created_by_household_id" uuid,
	"catalog_item_id" uuid,
	"awarded_bid_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "pool_status" DEFAULT 'gathering' NOT NULL,
	"target_location" geography(Point, 4326) NOT NULL,
	"threshold_quantity" numeric(12, 3) NOT NULL,
	"committed_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"threshold_households" integer DEFAULT 3 NOT NULL,
	"committed_households" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"opens_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"bidding_opens_at" timestamp with time zone,
	"awarded_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "demand_pools_threshold_quantity_positive" CHECK ("demand_pools"."threshold_quantity" > 0),
	CONSTRAINT "demand_pools_committed_quantity_non_negative" CHECK ("demand_pools"."committed_quantity" >= 0),
	CONSTRAINT "demand_pools_threshold_households_positive" CHECK ("demand_pools"."threshold_households" > 0)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_household_id" uuid,
	"merchant_id" uuid,
	"uploader_user_id" uuid,
	"role" "file_role" NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_byte_size_non_negative" CHECK ("files"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'adult' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"public_label" text NOT NULL,
	"home_location" geography(Point, 4326) NOT NULL,
	"coarse_location_label" text NOT NULL,
	"trust_score" integer DEFAULT 0 NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "households_trust_score_non_negative" CHECK ("households"."trust_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'started' NOT NULL,
	"response_json" jsonb,
	"locked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"household_id" uuid,
	"merchant_location_id" uuid,
	"event_type" "inventory_event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delta_quantity" numeric(12, 3),
	"from_state" "item_state",
	"to_state" "item_state",
	"audit_event_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"external_ref" text,
	"category" "item_category" NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"description" text,
	"default_storage_state" "storage_state" DEFAULT 'cupboard' NOT NULL,
	"default_safety_status" "safety_status" DEFAULT 'unknown' NOT NULL,
	"allergens" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid,
	"owner_household_id" uuid,
	"merchant_location_id" uuid,
	"neighbourhood_id" uuid NOT NULL,
	"category" "item_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"item_state" "item_state" DEFAULT 'private' NOT NULL,
	"storage_state" "storage_state" DEFAULT 'cupboard' NOT NULL,
	"safety_status" "safety_status" DEFAULT 'unknown' NOT NULL,
	"expires_at" timestamp with time zone,
	"use_by_date" date,
	"best_before_date" date,
	"location" geography(Point, 4326),
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "item_instances_quantity_positive" CHECK ("item_instances"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"status" "job_run_status" DEFAULT 'started' NOT NULL,
	"neighbourhood_id" uuid,
	"idempotency_key" text,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demand_pool_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"merchant_location_id" uuid,
	"status" "bid_status" DEFAULT 'submitted' NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"min_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"available_quantity" numeric(12, 3) NOT NULL,
	"pickup_window_start" timestamp with time zone,
	"pickup_window_end" timestamp with time zone,
	"score" numeric(8, 3),
	"terms" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "merchant_bids_price_non_negative" CHECK ("merchant_bids"."price_cents" >= 0),
	CONSTRAINT "merchant_bids_available_quantity_positive" CHECK ("merchant_bids"."available_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "merchant_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"neighbourhood_id" uuid,
	"name" text NOT NULL,
	"public_address" text NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"pickup_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merchant_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "merchant_user_role" DEFAULT 'staff' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"website_url" text,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"category" "item_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"status" "need_status" DEFAULT 'open' NOT NULL,
	"needed_by" timestamp with time zone,
	"location" geography(Point, 4326) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "needs_quantity_positive" CHECK ("needs"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "neighbourhoods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country_code" varchar(2) DEFAULT 'GB' NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"center_location" geography(Point, 4326) NOT NULL,
	"service_radius_meters" integer DEFAULT 1500 NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seed_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demo_scope_id" text NOT NULL,
	"seed_version" text NOT NULL,
	"status" "seed_batch_status" DEFAULT 'started' NOT NULL,
	"input_fingerprint" text NOT NULL,
	"applied_by_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"auth_subject" text,
	"avatar_file_id" uuid,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_household_id_households_id_fk" FOREIGN KEY ("actor_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_merchant_id_merchants_id_fk" FOREIGN KEY ("actor_merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pool_commitments" ADD CONSTRAINT "demand_pool_commitments_demand_pool_id_demand_pools_id_fk" FOREIGN KEY ("demand_pool_id") REFERENCES "public"."demand_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pool_commitments" ADD CONSTRAINT "demand_pool_commitments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pools" ADD CONSTRAINT "demand_pools_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pools" ADD CONSTRAINT "demand_pools_created_by_household_id_households_id_fk" FOREIGN KEY ("created_by_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pools" ADD CONSTRAINT "demand_pools_catalog_item_id_item_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."item_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_merchant_location_id_merchant_locations_id_fk" FOREIGN KEY ("merchant_location_id") REFERENCES "public"."merchant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_catalog" ADD CONSTRAINT "item_catalog_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_catalog_item_id_item_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."item_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_merchant_location_id_merchant_locations_id_fk" FOREIGN KEY ("merchant_location_id") REFERENCES "public"."merchant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bids" ADD CONSTRAINT "merchant_bids_demand_pool_id_demand_pools_id_fk" FOREIGN KEY ("demand_pool_id") REFERENCES "public"."demand_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bids" ADD CONSTRAINT "merchant_bids_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bids" ADD CONSTRAINT "merchant_bids_merchant_location_id_merchant_locations_id_fk" FOREIGN KEY ("merchant_location_id") REFERENCES "public"."merchant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD CONSTRAINT "merchant_locations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD CONSTRAINT "merchant_locations_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "needs" ADD CONSTRAINT "needs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "needs" ADD CONSTRAINT "needs_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_batches" ADD CONSTRAINT "seed_batches_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_idempotency_idx" ON "audit_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "demand_pool_commitments_pool_household_idx" ON "demand_pool_commitments" USING btree ("demand_pool_id","household_id");--> statement-breakpoint
CREATE INDEX "demand_pool_commitments_household_idx" ON "demand_pool_commitments" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "demand_pool_commitments_idempotency_idx" ON "demand_pool_commitments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "demand_pools_neighbourhood_status_idx" ON "demand_pools" USING btree ("neighbourhood_id","status");--> statement-breakpoint
CREATE INDEX "demand_pools_catalog_item_idx" ON "demand_pools" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "demand_pools_target_location_gix" ON "demand_pools" USING gist ("target_location");--> statement-breakpoint
CREATE UNIQUE INDEX "files_bucket_object_key_idx" ON "files" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "files_owner_household_idx" ON "files" USING btree ("owner_household_id");--> statement-breakpoint
CREATE INDEX "files_merchant_idx" ON "files" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_user_idx" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "household_members_user_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "household_members_status_idx" ON "household_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "households_neighbourhood_idx" ON "households" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "households_home_location_gix" ON "households" USING gist ("home_location");--> statement-breakpoint
CREATE INDEX "households_demo_scope_idx" ON "households" USING btree ("demo_scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_key_idx" ON "idempotency_keys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_scope_status_idx" ON "idempotency_keys" USING btree ("scope","status");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inventory_events_item_idx" ON "inventory_events" USING btree ("item_instance_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_events_household_idx" ON "inventory_events" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_catalog_merchant_external_ref_idx" ON "item_catalog" USING btree ("merchant_id","external_ref") WHERE "item_catalog"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "item_catalog_category_idx" ON "item_catalog" USING btree ("category");--> statement-breakpoint
CREATE INDEX "item_catalog_name_trgm_idx" ON "item_catalog" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "item_instances_neighbourhood_state_idx" ON "item_instances" USING btree ("neighbourhood_id","item_state");--> statement-breakpoint
CREATE INDEX "item_instances_owner_household_idx" ON "item_instances" USING btree ("owner_household_id");--> statement-breakpoint
CREATE INDEX "item_instances_merchant_location_idx" ON "item_instances" USING btree ("merchant_location_id");--> statement-breakpoint
CREATE INDEX "item_instances_expiry_idx" ON "item_instances" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "item_instances_location_gix" ON "item_instances" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_idempotency_key_idx" ON "job_runs" USING btree ("idempotency_key") WHERE "job_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "job_runs_type_started_idx" ON "job_runs" USING btree ("job_type","started_at");--> statement-breakpoint
CREATE INDEX "job_runs_neighbourhood_idx" ON "job_runs" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "merchant_bids_pool_status_idx" ON "merchant_bids" USING btree ("demand_pool_id","status");--> statement-breakpoint
CREATE INDEX "merchant_bids_merchant_idx" ON "merchant_bids" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_locations_merchant_idx" ON "merchant_locations" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_locations_neighbourhood_idx" ON "merchant_locations" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "merchant_locations_location_gix" ON "merchant_locations" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_users_merchant_user_idx" ON "merchant_users" USING btree ("merchant_id","user_id");--> statement-breakpoint
CREATE INDEX "merchant_users_user_idx" ON "merchant_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_slug_idx" ON "merchants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "merchants_demo_scope_idx" ON "merchants" USING btree ("demo_scope_id");--> statement-breakpoint
CREATE INDEX "needs_neighbourhood_status_idx" ON "needs" USING btree ("neighbourhood_id","status");--> statement-breakpoint
CREATE INDEX "needs_household_idx" ON "needs" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "needs_location_gix" ON "needs" USING gist ("location");--> statement-breakpoint
CREATE INDEX "needs_title_trgm_idx" ON "needs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "neighbourhoods_slug_idx" ON "neighbourhoods" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "neighbourhoods_center_location_gix" ON "neighbourhoods" USING gist ("center_location");--> statement-breakpoint
CREATE INDEX "neighbourhoods_demo_scope_idx" ON "neighbourhoods" USING btree ("demo_scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seed_batches_scope_version_idx" ON "seed_batches" USING btree ("demo_scope_id","seed_version");--> statement-breakpoint
CREATE INDEX "seed_batches_status_idx" ON "seed_batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_idx" ON "users" USING btree ("auth_subject") WHERE "users"."auth_subject" is not null;--> statement-breakpoint
CREATE INDEX "users_demo_scope_idx" ON "users" USING btree ("demo_scope_id");
