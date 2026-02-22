import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { jobStatusEnum, jobTypeEnum } from './enums.js';

export interface JobError {
  item: string;
  error: string;
  timestamp: string;
}

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  type: jobTypeEnum('type').notNull(),
  status: jobStatusEnum('status').notNull().default('pending'),

  totalItems: integer('total_items').default(0),
  processedItems: integer('processed_items').default(0),
  failedItems: integer('failed_items').default(0),

  input: jsonb('input').$type<Record<string, unknown>>().default({}),
  output: jsonb('output').$type<Record<string, unknown>>().default({}),
  errors: jsonb('errors').$type<JobError[]>().default([]),

  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_jobs_client_status').on(table.clientId, table.status),
  index('idx_jobs_type_status').on(table.type, table.status),
]);
