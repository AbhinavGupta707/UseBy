CREATE TYPE "public"."agent_run_status" AS ENUM('started', 'succeeded', 'failed', 'fallback', 'unavailable');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'started' NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"provider_status" text NOT NULL,
	"actor_user_id" uuid,
	"actor_household_id" uuid,
	"actor_merchant_id" uuid,
	"neighbourhood_id" uuid,
	"source" text DEFAULT 'agent-api' NOT NULL,
	"source_route" text,
	"trace_id" text,
	"trace_provider" text,
	"request_fingerprint" text NOT NULL,
	"idempotency_key" text,
	"deterministic_authority" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"redaction_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo_scope_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"tool_name" text NOT NULL,
	"tool_type" text DEFAULT 'deterministic' NOT NULL,
	"status" text NOT NULL,
	"input_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"redaction_level" text DEFAULT 'safe_metadata' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_actor_household_id_households_id_fk" FOREIGN KEY ("actor_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_actor_merchant_id_merchants_id_fk" FOREIGN KEY ("actor_merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_workflow_created_idx" ON "agent_runs" USING btree ("workflow","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_household_created_idx" ON "agent_runs" USING btree ("actor_household_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_trace_idx" ON "agent_runs" USING btree ("trace_provider","trace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_idempotency_key_idx" ON "agent_runs" USING btree ("idempotency_key") WHERE "agent_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "agent_tool_calls_run_sequence_idx" ON "agent_tool_calls" USING btree ("agent_run_id","sequence");--> statement-breakpoint
CREATE INDEX "agent_artifacts_run_kind_idx" ON "agent_artifacts" USING btree ("agent_run_id","kind");
