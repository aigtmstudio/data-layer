CREATE TYPE "public"."hypothesis_status" AS ENUM('active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."hypothesis_validation" AS ENUM('llm_generated', 'human_validated', 'human_created');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('tam', 'active_segment', 'qualified', 'ready_to_approach', 'in_sequence', 'converted');--> statement-breakpoint
CREATE TYPE "public"."signal_category" AS ENUM('regulatory', 'economic', 'technology', 'competitive');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'signal_hypothesis_generation';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'market_signal_processing';--> statement-breakpoint
CREATE TABLE "signal_hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"icp_id" uuid,
	"hypothesis" text NOT NULL,
	"signal_category" "signal_category" NOT NULL,
	"monitoring_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" "hypothesis_status" DEFAULT 'active' NOT NULL,
	"validated_by" "hypothesis_validation" DEFAULT 'llm_generated' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"hypothesis_id" uuid,
	"signal_category" "signal_category",
	"headline" text NOT NULL,
	"summary" text,
	"source_url" text,
	"source_name" text,
	"relevance_score" numeric(3, 2),
	"affected_segments" jsonb DEFAULT '[]'::jsonb,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "credit_balance" SET DEFAULT '1000';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "pipeline_stage" "pipeline_stage" DEFAULT 'tam' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "signal_score" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "signal_hypotheses" ADD CONSTRAINT "signal_hypotheses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_hypotheses" ADD CONSTRAINT "signal_hypotheses_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_hypothesis_id_signal_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."signal_hypotheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hypotheses_client" ON "signal_hypotheses" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_hypotheses_client_status" ON "signal_hypotheses" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "idx_hypotheses_category" ON "signal_hypotheses" USING btree ("client_id","signal_category");--> statement-breakpoint
CREATE INDEX "idx_market_signals_client" ON "market_signals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_market_signals_processed" ON "market_signals" USING btree ("client_id","processed");--> statement-breakpoint
CREATE INDEX "idx_market_signals_category" ON "market_signals" USING btree ("client_id","signal_category");--> statement-breakpoint
CREATE INDEX "idx_market_signals_hypothesis" ON "market_signals" USING btree ("hypothesis_id");