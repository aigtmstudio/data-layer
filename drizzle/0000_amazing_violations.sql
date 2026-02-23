CREATE TYPE "public"."credit_transaction_type" AS ENUM('purchase', 'usage', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."data_source_type" AS ENUM('search', 'enrichment', 'email_finding', 'email_verification', 'scraping');--> statement-breakpoint
CREATE TYPE "public"."email_verification_status" AS ENUM('unverified', 'valid', 'invalid', 'catch_all', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('csv', 'excel', 'google_sheets', 'salesforce', 'hubspot');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('company_enrichment', 'contact_discovery', 'email_verification', 'list_build', 'list_refresh', 'export', 'full_enrichment_pipeline');--> statement-breakpoint
CREATE TYPE "public"."list_type" AS ENUM('company', 'contact', 'mixed');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"industry" text,
	"website" text,
	"notes" text,
	"credit_balance" numeric(12, 4) DEFAULT '0' NOT NULL,
	"credit_margin_percent" numeric(5, 2) DEFAULT '30' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "icps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"natural_language_input" text,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"provider_hints" jsonb,
	"suggested_persona_id" uuid,
	"ai_parsing_confidence" numeric(3, 2),
	"last_parsed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"icp_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"title_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seniority_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"departments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"countries" jsonb DEFAULT '[]'::jsonb,
	"states" jsonb DEFAULT '[]'::jsonb,
	"years_experience_min" integer,
	"years_experience_max" integer,
	"exclude_title_patterns" jsonb DEFAULT '[]'::jsonb,
	"is_auto_generated" boolean DEFAULT false NOT NULL,
	"generated_from_icp_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"linkedin_url" text,
	"website_url" text,
	"industry" text,
	"sub_industry" text,
	"employee_count" integer,
	"employee_range" text,
	"annual_revenue" numeric(15, 2),
	"revenue_range" text,
	"founded_year" integer,
	"total_funding" numeric(15, 2),
	"latest_funding_stage" text,
	"latest_funding_date" timestamp with time zone,
	"city" text,
	"state" text,
	"country" text,
	"address" text,
	"tech_stack" jsonb DEFAULT '[]'::jsonb,
	"logo_url" text,
	"description" text,
	"phone" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_source" text,
	"enrichment_score" numeric(3, 2),
	"apollo_id" text,
	"leadmagic_id" text,
	"originality_score" numeric(3, 2),
	"source_rarity_scores" jsonb,
	"last_enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"company_id" uuid,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"linkedin_url" text,
	"photo_url" text,
	"title" text,
	"seniority" text,
	"department" text,
	"company_name" text,
	"company_domain" text,
	"work_email" text,
	"personal_email" text,
	"email_verification_status" "email_verification_status" DEFAULT 'unverified' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"mobile_phone" text,
	"city" text,
	"state" text,
	"country" text,
	"employment_history" jsonb DEFAULT '[]'::jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_source" text,
	"enrichment_score" numeric(3, 2),
	"apollo_id" text,
	"leadmagic_id" text,
	"prospeo_id" text,
	"last_enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"icp_fit_score" numeric(3, 2),
	"signal_score" numeric(3, 2),
	"originality_score" numeric(3, 2),
	"intelligence_score" numeric(3, 2),
	"added_reason" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"icp_id" uuid,
	"persona_id" uuid,
	"strategy_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"type" "list_type" DEFAULT 'contact' NOT NULL,
	"filter_snapshot" jsonb,
	"refresh_enabled" boolean DEFAULT false NOT NULL,
	"refresh_cron" text,
	"last_refreshed_at" timestamp with time zone,
	"next_refresh_at" timestamp with time zone,
	"member_count" integer DEFAULT 0 NOT NULL,
	"company_count" integer DEFAULT 0 NOT NULL,
	"contact_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "credit_transaction_type" NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"base_cost" numeric(12, 4),
	"margin_amount" numeric(12, 4),
	"balance_after" numeric(12, 4) NOT NULL,
	"description" text NOT NULL,
	"data_source" text,
	"operation_type" text,
	"job_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0,
	"processed_items" integer DEFAULT 0,
	"failed_items" integer DEFAULT 0,
	"input" jsonb DEFAULT '{}'::jsonb,
	"output" jsonb DEFAULT '{}'::jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"type" "data_source_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"cost_per_operation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limit_per_second" integer,
	"rate_limit_per_minute" integer,
	"rate_limit_per_day" integer,
	"daily_usage_count" integer DEFAULT 0,
	"daily_usage_reset_at" timestamp with time zone,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"api_base_url" text,
	"config_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"industry" text,
	"products" jsonb DEFAULT '[]'::jsonb,
	"target_market" text,
	"competitors" jsonb DEFAULT '[]'::jsonb,
	"value_proposition" text,
	"website_data" jsonb,
	"last_scraped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_profiles_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "company_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"signal_strength" numeric(3, 2) NOT NULL,
	"signal_data" jsonb NOT NULL,
	"source" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"quality_score" numeric(3, 2),
	"response_time_ms" integer,
	"fields_populated" integer,
	"cost_credits" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"icp_id" uuid NOT NULL,
	"persona_id" uuid,
	"context_hash" text NOT NULL,
	"strategy" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "icps" ADD CONSTRAINT "icps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_signals" ADD CONSTRAINT "company_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_signals" ADD CONSTRAINT "company_signals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_performance" ADD CONSTRAINT "provider_performance_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_companies_client_domain" ON "companies" USING btree ("client_id","domain");--> statement-breakpoint
CREATE INDEX "idx_companies_client_industry" ON "companies" USING btree ("client_id","industry");--> statement-breakpoint
CREATE INDEX "idx_companies_client_country" ON "companies" USING btree ("client_id","country");--> statement-breakpoint
CREATE INDEX "idx_companies_employee_count" ON "companies" USING btree ("client_id","employee_count");--> statement-breakpoint
CREATE INDEX "idx_contacts_client_email" ON "contacts" USING btree ("client_id","work_email");--> statement-breakpoint
CREATE INDEX "idx_contacts_client_company" ON "contacts" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_client_title" ON "contacts" USING btree ("client_id","title");--> statement-breakpoint
CREATE INDEX "idx_contacts_client_seniority" ON "contacts" USING btree ("client_id","seniority");--> statement-breakpoint
CREATE INDEX "idx_contacts_linkedin" ON "contacts" USING btree ("client_id","linkedin_url");--> statement-breakpoint
CREATE INDEX "idx_list_members_list" ON "list_members" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_list_members_company" ON "list_members" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_list_members_contact" ON "list_members" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_client" ON "credit_transactions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_client_created" ON "credit_transactions" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_client_status" ON "jobs" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "idx_jobs_type_status" ON "jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "idx_client_profiles_client" ON "client_profiles" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_company_signals_company" ON "company_signals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_company_signals_client" ON "company_signals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_company_signals_type" ON "company_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "idx_provider_perf_provider" ON "provider_performance" USING btree ("provider_name");--> statement-breakpoint
CREATE INDEX "idx_provider_perf_client" ON "provider_performance" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_provider_perf_created" ON "provider_performance" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_strategies_client" ON "strategies" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_strategies_context_hash" ON "strategies" USING btree ("client_id","context_hash");