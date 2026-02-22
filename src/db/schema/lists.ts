import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, numeric, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { icps } from './icps.js';
import { personas } from './personas.js';
import { companies } from './companies.js';
import { contacts } from './contacts.js';
import { strategies } from './intelligence.js';
import { listTypeEnum } from './enums.js';

export interface ListFilterSnapshot {
  icpFilters: Record<string, unknown>;
  personaFilters?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  appliedAt: string;
}

export const lists = pgTable('lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  icpId: uuid('icp_id').references(() => icps.id, { onDelete: 'set null' }),
  personaId: uuid('persona_id').references(() => personas.id, { onDelete: 'set null' }),
  strategyId: uuid('strategy_id').references(() => strategies.id, { onDelete: 'set null' }),

  name: text('name').notNull(),
  description: text('description'),
  type: listTypeEnum('type').notNull().default('contact'),

  filterSnapshot: jsonb('filter_snapshot').$type<ListFilterSnapshot>(),

  refreshEnabled: boolean('refresh_enabled').notNull().default(false),
  refreshCron: text('refresh_cron'),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  nextRefreshAt: timestamp('next_refresh_at', { withTimezone: true }),

  memberCount: integer('member_count').notNull().default(0),
  companyCount: integer('company_count').notNull().default(0),
  contactCount: integer('contact_count').notNull().default(0),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const listMembers = pgTable('list_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),

  icpFitScore: numeric('icp_fit_score', { precision: 3, scale: 2 }),
  signalScore: numeric('signal_score', { precision: 3, scale: 2 }),
  originalityScore: numeric('originality_score', { precision: 3, scale: 2 }),
  intelligenceScore: numeric('intelligence_score', { precision: 3, scale: 2 }),
  addedReason: text('added_reason'),

  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, (table) => [
  index('idx_list_members_list').on(table.listId),
  index('idx_list_members_company').on(table.companyId),
  index('idx_list_members_contact').on(table.contactId),
]);
