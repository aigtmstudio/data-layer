CREATE TYPE "public"."signal_level" AS ENUM('market', 'company', 'persona');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'persona_signal_detection';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'contact_list_build';--> statement-breakpoint
CREATE TABLE "contact_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"signal_strength" numeric(3, 2) NOT NULL,
	"signal_data" jsonb NOT NULL,
	"source" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- Safely migrate signal_category enum: cast to text, remap 'technology' → 'competitive', recreate enum
ALTER TABLE "signal_hypotheses" ALTER COLUMN "signal_category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "market_signals" ALTER COLUMN "signal_category" SET DATA TYPE text;--> statement-breakpoint
-- Remap legacy 'technology' values before dropping the old enum
UPDATE "signal_hypotheses" SET "signal_category" = 'competitive' WHERE "signal_category" = 'technology';--> statement-breakpoint
UPDATE "market_signals" SET "signal_category" = 'competitive' WHERE "signal_category" = 'technology';--> statement-breakpoint
DROP TYPE "public"."signal_category";--> statement-breakpoint
CREATE TYPE "public"."signal_category" AS ENUM('regulatory', 'economic', 'industry', 'competitive', 'funding', 'hiring', 'tech_adoption', 'expansion', 'leadership', 'product_launch', 'job_change', 'title_match', 'seniority_match', 'tenure_signal');--> statement-breakpoint
ALTER TABLE "signal_hypotheses" ALTER COLUMN "signal_category" SET DATA TYPE "public"."signal_category" USING "signal_category"::"public"."signal_category";--> statement-breakpoint
ALTER TABLE "market_signals" ALTER COLUMN "signal_category" SET DATA TYPE "public"."signal_category" USING "signal_category"::"public"."signal_category";--> statement-breakpoint
ALTER TABLE "lists" ALTER COLUMN "type" SET DEFAULT 'company';--> statement-breakpoint
-- Add client_id to personas: nullable first, backfill from icps, then set NOT NULL
ALTER TABLE "personas" ADD COLUMN "client_id" uuid;--> statement-breakpoint
UPDATE "personas" SET "client_id" = (SELECT "client_id" FROM "icps" WHERE "icps"."id" = "personas"."icp_id") WHERE "client_id" IS NULL;--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "list_members" ADD COLUMN "persona_score" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "source_company_list_id" uuid;--> statement-breakpoint
ALTER TABLE "signal_hypotheses" ADD COLUMN "signal_level" "signal_level" DEFAULT 'market' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_signals" ADD CONSTRAINT "contact_signals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_signals" ADD CONSTRAINT "contact_signals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contact_signals_contact" ON "contact_signals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_contact_signals_client" ON "contact_signals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_contact_signals_type" ON "contact_signals" USING btree ("signal_type");--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_personas_client" ON "personas" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_personas_icp" ON "personas" USING btree ("icp_id");--> statement-breakpoint
CREATE INDEX "idx_hypotheses_client_level" ON "signal_hypotheses" USING btree ("client_id","signal_level");
