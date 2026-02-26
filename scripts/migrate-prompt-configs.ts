import postgres from 'postgres';
import { config } from '../src/config/index.js';

async function run() {
  const sql = postgres(config.databaseUrl);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "prompt_configs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "key" text NOT NULL UNIQUE,
      "content" text NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log('prompt_configs table created');
  await sql.end();
}

run().catch(console.error);
