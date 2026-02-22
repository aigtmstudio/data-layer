import { pgTable, uuid, text, timestamp, numeric, jsonb, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { creditTransactionTypeEnum } from './enums.js';

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  type: creditTransactionTypeEnum('type').notNull(),

  amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
  baseCost: numeric('base_cost', { precision: 12, scale: 4 }),
  marginAmount: numeric('margin_amount', { precision: 12, scale: 4 }),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),

  description: text('description').notNull(),
  dataSource: text('data_source'),
  operationType: text('operation_type'),
  jobId: uuid('job_id'),

  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_credit_tx_client').on(table.clientId),
  index('idx_credit_tx_client_created').on(table.clientId, table.createdAt),
]);
