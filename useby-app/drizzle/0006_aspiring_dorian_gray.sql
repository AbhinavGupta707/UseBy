CREATE TYPE "public"."file_intake_kind" AS ENUM('receipt', 'expiry_label');--> statement-breakpoint
CREATE TYPE "public"."file_intake_status" AS ENUM('upload_unavailable', 'uploaded', 'parse_unavailable', 'parsed', 'applied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."provider_run_mode" AS ENUM('live', 'fixture', 'dry_run', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('unread', 'read', 'archived', 'queued', 'failed');--> statement-breakpoint
CREATE TABLE "file_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid,
	"owner_household_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"neighbourhood_id" uuid NOT NULL,
	"kind" "file_intake_kind" NOT NULL,
	"status" "file_intake_status" DEFAULT 'uploaded' NOT NULL,
	"storage_provider" text DEFAULT 's3' NOT NULL,
	"storage_status" "provider_run_mode" DEFAULT 'unavailable' NOT NULL,
	"parse_provider" text DEFAULT 'textract' NOT NULL,
	"parse_status" "provider_run_mode" DEFAULT 'unavailable' NOT NULL,
	"provider_request_id" text,
	"receipt_import_id" uuid,
	"target_item_instance_id" uuid,
	"raw_text" text,
	"raw_parse" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parsed_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"parsed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid,
	"recipient_household_id" uuid,
	"recipient_merchant_id" uuid,
	"neighbourhood_id" uuid,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'unread' NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"source" text DEFAULT 'system' NOT NULL,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_intakes" ADD CONSTRAINT "file_intakes_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_intakes" ADD CONSTRAINT "file_intakes_owner_household_id_households_id_fk" FOREIGN KEY ("owner_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_intakes" ADD CONSTRAINT "file_intakes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_intakes" ADD CONSTRAINT "file_intakes_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_intakes" ADD CONSTRAINT "file_intakes_receipt_import_id_receipt_imports_id_fk" FOREIGN KEY ("receipt_import_id") REFERENCES "public"."receipt_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_intakes" ADD CONSTRAINT "file_intakes_target_item_instance_id_item_instances_id_fk" FOREIGN KEY ("target_item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_household_id_households_id_fk" FOREIGN KEY ("recipient_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_merchant_id_merchants_id_fk" FOREIGN KEY ("recipient_merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_intakes_file_idx" ON "file_intakes" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_intakes_household_created_idx" ON "file_intakes" USING btree ("owner_household_id","created_at");--> statement-breakpoint
CREATE INDEX "file_intakes_neighbourhood_idx" ON "file_intakes" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "file_intakes_status_idx" ON "file_intakes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "file_intakes_idempotency_key_idx" ON "file_intakes" USING btree ("idempotency_key") WHERE "file_intakes"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "notifications_user_status_idx" ON "notifications" USING btree ("recipient_user_id","status");--> statement-breakpoint
CREATE INDEX "notifications_household_status_idx" ON "notifications" USING btree ("recipient_household_id","status");--> statement-breakpoint
CREATE INDEX "notifications_merchant_status_idx" ON "notifications" USING btree ("recipient_merchant_id","status");--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "notifications" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_idempotency_key_idx" ON "notifications" USING btree ("idempotency_key") WHERE "notifications"."idempotency_key" is not null;
