import { pgTable, uuid, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
import { icps } from './icps.js';

export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  icpId: uuid('icp_id').notNull().references(() => icps.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  description: text('description'),

  titlePatterns: jsonb('title_patterns').$type<string[]>().notNull().default([]),
  seniorityLevels: jsonb('seniority_levels').$type<string[]>().notNull().default([]),
  departments: jsonb('departments').$type<string[]>().notNull().default([]),

  countries: jsonb('countries').$type<string[]>().default([]),
  states: jsonb('states').$type<string[]>().default([]),

  yearsExperienceMin: integer('years_experience_min'),
  yearsExperienceMax: integer('years_experience_max'),
  excludeTitlePatterns: jsonb('exclude_title_patterns').$type<string[]>().default([]),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
