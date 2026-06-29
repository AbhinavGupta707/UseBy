CREATE TYPE "public"."booking_status" AS ENUM('requested', 'accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned', 'completed', 'reviewed', 'cancelled', 'declined', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('pending', 'scheduled', 'picked_up', 'returned', 'completed', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."trust_event_type" AS ENUM('booking_completed', 'booking_reviewed', 'booking_cancelled', 'report_submitted', 'block_created');--> statement-breakpoint
CREATE TYPE "public"."review_rating" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'under_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."block_status" AS ENUM('active', 'lifted');--> statement-breakpoint
CREATE TABLE "safety_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"neighbourhood_id" uuid NOT NULL,
	"acknowledgement_type" text DEFAULT 'food_handoff' NOT NULL,
	"version" text DEFAULT 'cp3-food-safety-v1' NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"match_id" uuid,
	"need_id" uuid,
	"requester_household_id" uuid NOT NULL,
	"owner_household_id" uuid NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"owner_actor_user_id" uuid,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"request_note" text,
	"decline_reason" text,
	"cancel_reason" text,
	"dispute_reason" text,
	"safety_acknowledgement_id" uuid,
	"idempotency_key" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bookings_quantity_positive" CHECK ("bookings"."quantity" > 0),
	CONSTRAINT "bookings_households_distinct" CHECK ("bookings"."requester_household_id" <> "bookings"."owner_household_id")
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "handoff_status" DEFAULT 'pending' NOT NULL,
	"pickup_window_start" timestamp with time zone,
	"pickup_window_end" timestamp with time zone,
	"coarse_pickup_hint" text,
	"scheduled_by_user_id" uuid,
	"picked_up_by_user_id" uuid,
	"completed_by_user_id" uuid,
	"scheduled_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completion_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handoffs_pickup_window_order" CHECK ("handoffs"."pickup_window_start" is null or "handoffs"."pickup_window_end" is null or "handoffs"."pickup_window_end" > "handoffs"."pickup_window_start")
);
--> statement-breakpoint
CREATE TABLE "trust_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"household_id" uuid NOT NULL,
	"actor_household_id" uuid,
	"actor_user_id" uuid,
	"event_type" "trust_event_type" NOT NULL,
	"delta" integer DEFAULT 0 NOT NULL,
	"rationale" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_events_delta_bounds" CHECK ("trust_events"."delta" between -100 and 100)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"reviewer_household_id" uuid NOT NULL,
	"reviewee_household_id" uuid NOT NULL,
	"reviewer_user_id" uuid,
	"rating" "review_rating" NOT NULL,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reviews_households_distinct" CHECK ("reviews"."reviewer_household_id" <> "reviews"."reviewee_household_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_household_id" uuid NOT NULL,
	"reported_household_id" uuid,
	"reporter_user_id" uuid,
	"booking_id" uuid,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_household_id" uuid NOT NULL,
	"blocked_household_id" uuid NOT NULL,
	"blocker_user_id" uuid,
	"status" "block_status" DEFAULT 'active' NOT NULL,
	"reason" text,
	"lifted_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_households_distinct" CHECK ("blocks"."blocker_household_id" <> "blocks"."blocked_household_id")
);
--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_need_id_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."needs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requester_household_id_households_id_fk" FOREIGN KEY ("requester_household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_actor_user_id_users_id_fk" FOREIGN KEY ("owner_actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_safety_acknowledgement_id_safety_acknowledgements_id_fk" FOREIGN KEY ("safety_acknowledgement_id") REFERENCES "public"."safety_acknowledgements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_scheduled_by_user_id_users_id_fk" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_picked_up_by_user_id_users_id_fk" FOREIGN KEY ("picked_up_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_actor_household_id_households_id_fk" FOREIGN KEY ("actor_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_household_id_households_id_fk" FOREIGN KEY ("reviewer_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_household_id_households_id_fk" FOREIGN KEY ("reviewee_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_household_id_households_id_fk" FOREIGN KEY ("reporter_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_household_id_households_id_fk" FOREIGN KEY ("reported_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_household_id_households_id_fk" FOREIGN KEY ("blocker_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_household_id_households_id_fk" FOREIGN KEY ("blocked_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_ack_household_type_version_idx" ON "safety_acknowledgements" USING btree ("household_id","acknowledgement_type","version");--> statement-breakpoint
CREATE INDEX "safety_ack_household_type_idx" ON "safety_acknowledgements" USING btree ("household_id","acknowledgement_type");--> statement-breakpoint
CREATE INDEX "safety_ack_neighbourhood_idx" ON "safety_acknowledgements" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "bookings_item_status_idx" ON "bookings" USING btree ("item_instance_id","status");--> statement-breakpoint
CREATE INDEX "bookings_match_idx" ON "bookings" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "bookings_requester_status_idx" ON "bookings" USING btree ("requester_household_id","status");--> statement-breakpoint
CREATE INDEX "bookings_owner_status_idx" ON "bookings" USING btree ("owner_household_id","status");--> statement-breakpoint
CREATE INDEX "bookings_neighbourhood_status_idx" ON "bookings" USING btree ("neighbourhood_id","status");--> statement-breakpoint
CREATE INDEX "bookings_idempotency_idx" ON "bookings" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_active_reservation_idx" ON "bookings" USING btree ("item_instance_id") WHERE status in ('accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned', 'disputed');--> statement-breakpoint
CREATE UNIQUE INDEX "handoffs_booking_idx" ON "handoffs" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "handoffs_status_idx" ON "handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trust_events_household_created_idx" ON "trust_events" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "trust_events_booking_idx" ON "trust_events" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_reviewer_idx" ON "reviews" USING btree ("booking_id","reviewer_household_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewee_created_idx" ON "reviews" USING btree ("reviewee_household_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_household_id");--> statement-breakpoint
CREATE INDEX "reports_reported_idx" ON "reports" USING btree ("reported_household_id");--> statement-breakpoint
CREATE INDEX "reports_booking_idx" ON "reports" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_active_pair_idx" ON "blocks" USING btree ("blocker_household_id","blocked_household_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "blocks_blocked_household_idx" ON "blocks" USING btree ("blocked_household_id");
