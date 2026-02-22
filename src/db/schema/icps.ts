import { pgTable, uuid, text, timestamp, jsonb, numeric, boolean } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';

export interface IcpFilters {
  industries?: string[];
  employeeCountMin?: number;
  employeeCountMax?: number;
  revenueMin?: number;
  revenueMax?: number;
  fundingStages?: string[];
  fundingMin?: number;
  fundingMax?: number;
  foundedAfter?: number;
  foundedBefore?: number;
  countries?: string[];
  states?: string[];
  cities?: string[];
  excludeCountries?: string[];
  techStack?: string[];
  techCategories?: string[];
  signals?: string[];
  keywords?: string[];
  excludeCompanyIds?: string[];
  excludeDomains?: string[];
}

export const icps = pgTable('icps', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  description: text('description'),

  naturalLanguageInput: text('natural_language_input'),
  filters: jsonb('filters').$type<IcpFilters>().notNull().default({}),

  aiParsingConfidence: numeric('ai_parsing_confidence', { precision: 3, scale: 2 }),
  lastParsedAt: timestamp('last_parsed_at', { withTimezone: true }),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
