import { pgTable, uuid, text, timestamp, integer, numeric, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { jobs } from './jobs.js';

export const llmUsage = pgTable('llm_usage', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Context: who and what triggered this call
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  service: text('service').notNull(),
  operation: text('operation').notNull(),

  // Token usage (from API response — 100% accurate)
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),

  // Computed cost in USD
  inputCostUsd: numeric('input_cost_usd', { precision: 10, scale: 6 }).notNull(),
  outputCostUsd: numeric('output_cost_usd', { precision: 10, scale: 6 }).notNull(),
  totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 6 }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_llm_usage_client').on(table.clientId),
  index('idx_llm_usage_job').on(table.jobId),
  index('idx_llm_usage_service').on(table.service),
  index('idx_llm_usage_created').on(table.createdAt),
]);
