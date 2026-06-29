CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."lending_availability_status" AS ENUM('available', 'blocked', 'paused');--> statement-breakpoint
CREATE TYPE "public"."lending_reservation_status" AS ENUM('requested', 'active', 'released', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lending_condition_event_type" AS ENUM('request_snapshot', 'pickup_evidence', 'return_evidence', 'completion_evidence', 'review_evidence');--> statement-breakpoint
CREATE TABLE "lending_availability_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"owner_household_id" uuid NOT NULL,
	"status" "lending_availability_status" DEFAULT 'available' NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "lending_availability_window_order" CHECK ("lending_availability_windows"."window_start" is null or "lending_availability_windows"."window_end" is null or "lending_availability_windows"."window_end" > "lending_availability_windows"."window_start")
);
--> statement-breakpoint
CREATE TABLE "lending_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"requester_household_id" uuid NOT NULL,
	"owner_household_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" "lending_reservation_status" DEFAULT 'requested' NOT NULL,
	"accepted_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "lending_reservations_window_order" CHECK ("lending_reservations"."window_end" > "lending_reservations"."window_start"),
	CONSTRAINT "lending_reservations_households_distinct" CHECK ("lending_reservations"."requester_household_id" <> "lending_reservations"."owner_household_id")
);
--> statement-breakpoint
CREATE TABLE "lending_condition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"actor_household_id" uuid,
	"actor_user_id" uuid,
	"event_type" "lending_condition_event_type" NOT NULL,
	"condition_label" text,
	"note" text,
	"photo_file_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lending_availability_windows" ADD CONSTRAINT "lending_availability_windows_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_availability_windows" ADD CONSTRAINT "lending_availability_windows_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_reservations" ADD CONSTRAINT "lending_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_reservations" ADD CONSTRAINT "lending_reservations_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_reservations" ADD CONSTRAINT "lending_reservations_requester_household_id_households_id_fk" FOREIGN KEY ("requester_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_reservations" ADD CONSTRAINT "lending_reservations_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_condition_events" ADD CONSTRAINT "lending_condition_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_condition_events" ADD CONSTRAINT "lending_condition_events_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_condition_events" ADD CONSTRAINT "lending_condition_events_actor_household_id_households_id_fk" FOREIGN KEY ("actor_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lending_condition_events" ADD CONSTRAINT "lending_condition_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_one_active_reservation_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_active_reservation_idx" ON "bookings" USING btree ("item_instance_id") WHERE status in ('accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned', 'disputed') and coalesce(metadata->>'flow', '') <> 'lending';--> statement-breakpoint
CREATE INDEX "lending_availability_item_status_idx" ON "lending_availability_windows" USING btree ("item_instance_id","status");--> statement-breakpoint
CREATE INDEX "lending_availability_owner_idx" ON "lending_availability_windows" USING btree ("owner_household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lending_reservations_booking_idx" ON "lending_reservations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "lending_reservations_item_status_idx" ON "lending_reservations" USING btree ("item_instance_id","status");--> statement-breakpoint
CREATE INDEX "lending_reservations_requester_idx" ON "lending_reservations" USING btree ("requester_household_id");--> statement-breakpoint
CREATE INDEX "lending_reservations_owner_idx" ON "lending_reservations" USING btree ("owner_household_id");--> statement-breakpoint
ALTER TABLE "lending_reservations" ADD CONSTRAINT "lending_reservation_no_active_overlap" EXCLUDE USING gist (
	"item_instance_id" WITH =,
	tstzrange("window_start", "window_end", '[)') WITH &&
) WHERE ("status" = 'active' and "deleted_at" is null);--> statement-breakpoint
CREATE INDEX "lending_condition_events_booking_idx" ON "lending_condition_events" USING btree ("booking_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lending_condition_events_item_idx" ON "lending_condition_events" USING btree ("item_instance_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lending_condition_events_actor_idx" ON "lending_condition_events" USING btree ("actor_household_id");
