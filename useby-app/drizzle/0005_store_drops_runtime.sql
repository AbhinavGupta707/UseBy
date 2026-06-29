CREATE TYPE "public"."store_drop_status" AS ENUM('draft', 'published', 'paused', 'closed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."store_drop_reservation_status" AS ENUM('active', 'cancelled', 'expired', 'picked_up');--> statement-breakpoint
CREATE TABLE "store_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"merchant_location_id" uuid,
	"neighbourhood_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "store_drop_status" DEFAULT 'draft' NOT NULL,
	"quantity_total" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'box' NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"pickup_window_start" timestamp with time zone NOT NULL,
	"pickup_window_end" timestamp with time zone NOT NULL,
	"safety_notes" text,
	"pickup_location" geography(Point, 4326) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "store_drops_quantity_total_positive" CHECK ("store_drops"."quantity_total" > 0),
	CONSTRAINT "store_drops_price_non_negative" CHECK ("store_drops"."price_cents" >= 0),
	CONSTRAINT "store_drops_pickup_window_order" CHECK ("store_drops"."pickup_window_end" > "store_drops"."pickup_window_start")
);
--> statement-breakpoint
CREATE TABLE "store_drop_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_drop_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"status" "store_drop_reservation_status" DEFAULT 'active' NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'box' NOT NULL,
	"idempotency_key" text,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_drop_reservations_quantity_positive" CHECK ("store_drop_reservations"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "store_drops" ADD CONSTRAINT "store_drops_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_drops" ADD CONSTRAINT "store_drops_merchant_location_id_merchant_locations_id_fk" FOREIGN KEY ("merchant_location_id") REFERENCES "public"."merchant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_drops" ADD CONSTRAINT "store_drops_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_drops" ADD CONSTRAINT "store_drops_catalog_item_id_item_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."item_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_drop_reservations" ADD CONSTRAINT "store_drop_reservations_store_drop_id_store_drops_id_fk" FOREIGN KEY ("store_drop_id") REFERENCES "public"."store_drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_drop_reservations" ADD CONSTRAINT "store_drop_reservations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_drops_neighbourhood_status_idx" ON "store_drops" USING btree ("neighbourhood_id","status");--> statement-breakpoint
CREATE INDEX "store_drops_merchant_status_idx" ON "store_drops" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "store_drops_location_gix" ON "store_drops" USING gist ("pickup_location");--> statement-breakpoint
CREATE UNIQUE INDEX "store_drop_reservations_active_drop_household_idx" ON "store_drop_reservations" USING btree ("store_drop_id","household_id") WHERE "store_drop_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "store_drop_reservations_drop_status_idx" ON "store_drop_reservations" USING btree ("store_drop_id","status");--> statement-breakpoint
CREATE INDEX "store_drop_reservations_household_status_idx" ON "store_drop_reservations" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "store_drop_reservations_idempotency_idx" ON "store_drop_reservations" USING btree ("idempotency_key");
