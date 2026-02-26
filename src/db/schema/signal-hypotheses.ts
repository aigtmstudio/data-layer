import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { icps } from './icps.js';
import { signalCategoryEnum, signalLevelEnum, hypothesisStatusEnum, hypothesisValidationEnum } from './enums.js';

export const signalHypotheses = pgTable('signal_hypotheses', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  icpId: uuid('icp_id').references(() => icps.id, { onDelete: 'set null' }),

  hypothesis: text('hypothesis').notNull(),
  signalLevel: signalLevelEnum('signal_level').notNull().default('market'),
  signalCategory: signalCategoryEnum('signal_category').notNull(),
  monitoringSources: jsonb('monitoring_sources').$type<string[]>().notNull().default([]),
  affectedSegments: jsonb('affected_segments').$type<string[]>().notNull().default([]),
  priority: integer('priority').notNull().default(5),
  status: hypothesisStatusEnum('status').notNull().default('active'),
  validatedBy: hypothesisValidationEnum('validated_by').notNull().default('llm_generated'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_hypotheses_client').on(table.clientId),
  index('idx_hypotheses_client_status').on(table.clientId, table.status),
  index('idx_hypotheses_category').on(table.clientId, table.signalCategory),
  index('idx_hypotheses_client_level').on(table.clientId, table.signalLevel),
]);
