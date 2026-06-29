CREATE TYPE "public"."action_card_status" AS ENUM('active', 'dismissed', 'snoozed', 'completed', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."expiry_confidence" AS ENUM('low', 'medium', 'high', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."expiry_observation_source" AS ENUM('receipt', 'label', 'manual', 'gs1', 'system');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('active', 'proposed', 'accepted', 'rejected', 'expired', 'converted', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."receipt_import_status" AS ENUM('started', 'parsed', 'applied', 'failed');--> statement-breakpoint
CREATE TABLE "action_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"item_instance_id" uuid,
	"need_id" uuid,
	"match_id" uuid,
	"card_type" text NOT NULL,
	"status" "action_card_status" DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"rationale" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recompute_key" text NOT NULL,
	"source" text DEFAULT 'recompute' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "action_cards_priority_non_negative" CHECK ("action_cards"."priority" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expiry_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"household_id" uuid,
	"observed_by_user_id" uuid,
	"receipt_import_id" uuid,
	"source" "expiry_observation_source" DEFAULT 'manual' NOT NULL,
	"confidence" "expiry_confidence" DEFAULT 'medium' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"use_by_date" date,
	"best_before_date" date,
	"expires_at" timestamp with time zone,
	"raw_text" text,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"need_id" uuid NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"requester_household_id" uuid NOT NULL,
	"owner_household_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'proposed' NOT NULL,
	"score" numeric(8, 3) DEFAULT '0' NOT NULL,
	"distance_meters" integer,
	"rationale" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recompute_key" text NOT NULL,
	"source" text DEFAULT 'recompute' NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "matches_score_non_negative" CHECK ("matches"."score" >= 0),
	CONSTRAINT "matches_distance_non_negative" CHECK ("matches"."distance_meters" is null or "matches"."distance_meters" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receipt_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"neighbourhood_id" uuid NOT NULL,
	"merchant_name" text,
	"purchase_date" date,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" "receipt_import_status" DEFAULT 'started' NOT NULL,
	"idempotency_key" text NOT NULL,
	"raw_text" text,
	"subtotal_cents" integer,
	"tax_cents" integer,
	"total_cents" integer,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "receipt_imports_subtotal_non_negative" CHECK ("receipt_imports"."subtotal_cents" is null or "receipt_imports"."subtotal_cents" >= 0),
	CONSTRAINT "receipt_imports_tax_non_negative" CHECK ("receipt_imports"."tax_cents" is null or "receipt_imports"."tax_cents" >= 0),
	CONSTRAINT "receipt_imports_total_non_negative" CHECK ("receipt_imports"."total_cents" is null or "receipt_imports"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receipt_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_import_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"item_instance_id" uuid,
	"line_index" integer NOT NULL,
	"raw_text" text NOT NULL,
	"normalized_title" text NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"price_cents" integer,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_line_items_line_index_non_negative" CHECK ("receipt_line_items"."line_index" >= 0),
	CONSTRAINT "receipt_line_items_quantity_positive" CHECK ("receipt_line_items"."quantity" > 0),
	CONSTRAINT "receipt_line_items_price_non_negative" CHECK ("receipt_line_items"."price_cents" is null or "receipt_line_items"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "action_cards" ADD CONSTRAINT "action_cards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_cards" ADD CONSTRAINT "action_cards_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_cards" ADD CONSTRAINT "action_cards_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_cards" ADD CONSTRAINT "action_cards_need_id_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."needs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_cards" ADD CONSTRAINT "action_cards_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_observations" ADD CONSTRAINT "expiry_observations_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_observations" ADD CONSTRAINT "expiry_observations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_observations" ADD CONSTRAINT "expiry_observations_observed_by_user_id_users_id_fk" FOREIGN KEY ("observed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_observations" ADD CONSTRAINT "expiry_observations_receipt_import_id_receipt_imports_id_fk" FOREIGN KEY ("receipt_import_id") REFERENCES "public"."receipt_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_need_id_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."needs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_requester_household_id_households_id_fk" FOREIGN KEY ("requester_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD CONSTRAINT "receipt_imports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD CONSTRAINT "receipt_imports_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD CONSTRAINT "receipt_imports_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_receipt_import_id_receipt_imports_id_fk" FOREIGN KEY ("receipt_import_id") REFERENCES "public"."receipt_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_catalog_item_id_item_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."item_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_line_items" ADD CONSTRAINT "receipt_line_items_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_cards_recompute_key_idx" ON "action_cards" USING btree ("recompute_key");--> statement-breakpoint
CREATE INDEX "action_cards_household_status_idx" ON "action_cards" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "action_cards_neighbourhood_status_idx" ON "action_cards" USING btree ("neighbourhood_id","status");--> statement-breakpoint
CREATE INDEX "action_cards_item_idx" ON "action_cards" USING btree ("item_instance_id");--> statement-breakpoint
CREATE INDEX "action_cards_match_idx" ON "action_cards" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "expiry_observations_item_observed_idx" ON "expiry_observations" USING btree ("item_instance_id","observed_at");--> statement-breakpoint
CREATE INDEX "expiry_observations_household_idx" ON "expiry_observations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "expiry_observations_receipt_idx" ON "expiry_observations" USING btree ("receipt_import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_recompute_key_idx" ON "matches" USING btree ("recompute_key");--> statement-breakpoint
CREATE INDEX "matches_neighbourhood_status_idx" ON "matches" USING btree ("neighbourhood_id","status");--> statement-breakpoint
CREATE INDEX "matches_need_status_idx" ON "matches" USING btree ("need_id","status");--> statement-breakpoint
CREATE INDEX "matches_item_status_idx" ON "matches" USING btree ("item_instance_id","status");--> statement-breakpoint
CREATE INDEX "matches_requester_household_idx" ON "matches" USING btree ("requester_household_id");--> statement-breakpoint
CREATE INDEX "matches_owner_household_idx" ON "matches" USING btree ("owner_household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_imports_idempotency_key_idx" ON "receipt_imports" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "receipt_imports_household_created_idx" ON "receipt_imports" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "receipt_imports_neighbourhood_idx" ON "receipt_imports" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_line_items_import_line_idx" ON "receipt_line_items" USING btree ("receipt_import_id","line_index");--> statement-breakpoint
CREATE INDEX "receipt_line_items_item_instance_idx" ON "receipt_line_items" USING btree ("item_instance_id");--> statement-breakpoint
CREATE INDEX "receipt_line_items_catalog_item_idx" ON "receipt_line_items" USING btree ("catalog_item_id");