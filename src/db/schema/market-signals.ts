import { pgTable, uuid, text, timestamp, jsonb, numeric, boolean, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { signalHypotheses } from './signal-hypotheses.js';
import { signalCategoryEnum } from './enums.js';

export const marketSignals = pgTable('market_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  hypothesisId: uuid('hypothesis_id').references(() => signalHypotheses.id, { onDelete: 'set null' }),

  signalCategory: signalCategoryEnum('signal_category'),
  headline: text('headline').notNull(),
  summary: text('summary'),
  sourceUrl: text('source_url'),
  sourceName: text('source_name'),
  relevanceScore: numeric('relevance_score', { precision: 3, scale: 2 }),
  affectedSegments: jsonb('affected_segments').$type<string[]>().default([]),
  rawData: jsonb('raw_data').$type<Record<string, unknown>>().default({}),

  processed: boolean('processed').notNull().default(false),
  detectedAt: timestamp('detected_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_market_signals_client').on(table.clientId),
  index('idx_market_signals_processed').on(table.clientId, table.processed),
  index('idx_market_signals_category').on(table.clientId, table.signalCategory),
  index('idx_market_signals_hypothesis').on(table.hypothesisId),
]);
