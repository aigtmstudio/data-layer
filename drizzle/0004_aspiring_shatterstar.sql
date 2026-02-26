ALTER TYPE "public"."job_type" ADD VALUE 'deep_enrichment';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'market_signal_search';--> statement-breakpoint
CREATE TABLE "prompt_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "website_profile" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "website_profiled_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_members_list_company_unique" ON "list_members" USING btree ("list_id","company_id") WHERE removed_at IS NULL AND company_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_members_list_contact_unique" ON "list_members" USING btree ("list_id","contact_id") WHERE removed_at IS NULL AND contact_id IS NOT NULL;