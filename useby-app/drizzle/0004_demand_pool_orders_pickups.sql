CREATE TYPE "public"."pool_order_status" AS ENUM('pending', 'ready', 'collected', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pickup_task_status" AS ENUM('pending', 'ready', 'collected', 'cancelled');--> statement-breakpoint
CREATE TABLE "pool_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demand_pool_id" uuid NOT NULL,
	"commitment_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"merchant_bid_id" uuid,
	"merchant_id" uuid,
	"merchant_location_id" uuid,
	"status" "pool_order_status" DEFAULT 'pending' NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"price_cents" integer,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"pickup_window_start" timestamp with time zone,
	"pickup_window_end" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"status_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pool_orders_quantity_positive" CHECK ("pool_orders"."quantity" > 0),
	CONSTRAINT "pool_orders_price_non_negative" CHECK ("pool_orders"."price_cents" is null or "pool_orders"."price_cents" >= 0),
	CONSTRAINT "pool_orders_pickup_window_order" CHECK ("pool_orders"."pickup_window_start" is null or "pool_orders"."pickup_window_end" is null or "pool_orders"."pickup_window_end" > "pool_orders"."pickup_window_start")
);
--> statement-breakpoint
CREATE TABLE "pickup_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_order_id" uuid NOT NULL,
	"demand_pool_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"merchant_id" uuid,
	"merchant_location_id" uuid,
	"status" "pickup_task_status" DEFAULT 'pending' NOT NULL,
	"coarse_pickup_label" text,
	"pickup_window_start" timestamp with time zone,
	"pickup_window_end" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_tasks_window_order" CHECK ("pickup_tasks"."pickup_window_start" is null or "pickup_tasks"."pickup_window_end" is null or "pickup_tasks"."pickup_window_end" > "pickup_tasks"."pickup_window_start")
);
--> statement-breakpoint
ALTER TABLE "pool_orders" ADD CONSTRAINT "pool_orders_demand_pool_id_demand_pools_id_fk" FOREIGN KEY ("demand_pool_id") REFERENCES "public"."demand_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_orders" ADD CONSTRAINT "pool_orders_commitment_id_demand_pool_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."demand_pool_commitments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_orders" ADD CONSTRAINT "pool_orders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_orders" ADD CONSTRAINT "pool_orders_merchant_bid_id_merchant_bids_id_fk" FOREIGN KEY ("merchant_bid_id") REFERENCES "public"."merchant_bids"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_orders" ADD CONSTRAINT "pool_orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_orders" ADD CONSTRAINT "pool_orders_merchant_location_id_merchant_locations_id_fk" FOREIGN KEY ("merchant_location_id") REFERENCES "public"."merchant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_tasks" ADD CONSTRAINT "pickup_tasks_pool_order_id_pool_orders_id_fk" FOREIGN KEY ("pool_order_id") REFERENCES "public"."pool_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_tasks" ADD CONSTRAINT "pickup_tasks_demand_pool_id_demand_pools_id_fk" FOREIGN KEY ("demand_pool_id") REFERENCES "public"."demand_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_tasks" ADD CONSTRAINT "pickup_tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_tasks" ADD CONSTRAINT "pickup_tasks_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_tasks" ADD CONSTRAINT "pickup_tasks_merchant_location_id_merchant_locations_id_fk" FOREIGN KEY ("merchant_location_id") REFERENCES "public"."merchant_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_orders_commitment_idx" ON "pool_orders" USING btree ("commitment_id");--> statement-breakpoint
CREATE INDEX "pool_orders_pool_status_idx" ON "pool_orders" USING btree ("demand_pool_id","status");--> statement-breakpoint
CREATE INDEX "pool_orders_household_status_idx" ON "pool_orders" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "pool_orders_merchant_status_idx" ON "pool_orders" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_tasks_order_idx" ON "pickup_tasks" USING btree ("pool_order_id");--> statement-breakpoint
CREATE INDEX "pickup_tasks_pool_status_idx" ON "pickup_tasks" USING btree ("demand_pool_id","status");--> statement-breakpoint
CREATE INDEX "pickup_tasks_household_status_idx" ON "pickup_tasks" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "pickup_tasks_merchant_status_idx" ON "pickup_tasks" USING btree ("merchant_id","status");
