import { config } from '../src/config/index.js';
import pg from 'pg';

async function main() {
  const client = new pg.Client(config.databaseUrl);
  await client.connect();

  const statements = [
    `CREATE TYPE "public"."hypothesis_status" AS ENUM('active', 'paused', 'retired')`,
    `CREATE TYPE "public"."hypothesis_validation" AS ENUM('llm_generated', 'human_validated', 'human_created')`,
    `CREATE TYPE "public"."pipeline_stage" AS ENUM('tam', 'active_segment', 'qualified', 'ready_to_approach', 'in_sequence', 'converted')`,
    `CREATE TYPE "public"."signal_category" AS ENUM('regulatory', 'economic', 'technology', 'competitive')`,
    `ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'signal_hypothesis_generation'`,
    `ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'market_signal_processing'`,
    `CREATE TABLE IF NOT EXISTS "signal_hypotheses" (
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
    )`,
    `CREATE TABLE IF NOT EXISTS "market_signals" (
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
    )`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "pipeline_stage" "pipeline_stage" DEFAULT 'tam' NOT NULL`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "signal_score" numeric(3, 2)`,
    `DO $$ BEGIN ALTER TABLE "signal_hypotheses" ADD CONSTRAINT "signal_hypotheses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "signal_hypotheses" ADD CONSTRAINT "signal_hypotheses_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_hypothesis_id_signal_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."signal_hypotheses"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "idx_hypotheses_client" ON "signal_hypotheses" USING btree ("client_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_hypotheses_client_status" ON "signal_hypotheses" USING btree ("client_id","status")`,
    `CREATE INDEX IF NOT EXISTS "idx_hypotheses_category" ON "signal_hypotheses" USING btree ("client_id","signal_category")`,
    `CREATE INDEX IF NOT EXISTS "idx_market_signals_client" ON "market_signals" USING btree ("client_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_market_signals_processed" ON "market_signals" USING btree ("client_id","processed")`,
    `CREATE INDEX IF NOT EXISTS "idx_market_signals_category" ON "market_signals" USING btree ("client_id","signal_category")`,
    `CREATE INDEX IF NOT EXISTS "idx_market_signals_hypothesis" ON "market_signals" USING btree ("hypothesis_id")`,
  ];

  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log('OK:', sql.substring(0, 70) + '...');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.includes('already exists')) {
        console.log('SKIP (exists):', sql.substring(0, 70) + '...');
      } else {
        console.error('ERR:', msg, '→', sql.substring(0, 70) + '...');
      }
    }
  }

  await client.end();
  console.log('\nMigration complete.');
}

main();
