import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { pipelineStageEnum } from './enums.js';

export interface SourceRecord {
  source: string;
  fetchedAt: string;
  fieldsProvided: string[];
  qualityScore?: number;
}

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  domain: text('domain'),
  linkedinUrl: text('linkedin_url'),
  websiteUrl: text('website_url'),

  industry: text('industry'),
  subIndustry: text('sub_industry'),
  employeeCount: integer('employee_count'),
  employeeRange: text('employee_range'),
  annualRevenue: numeric('annual_revenue', { precision: 15, scale: 2 }),
  revenueRange: text('revenue_range'),
  foundedYear: integer('founded_year'),

  totalFunding: numeric('total_funding', { precision: 15, scale: 2 }),
  latestFundingStage: text('latest_funding_stage'),
  latestFundingDate: timestamp('latest_funding_date', { withTimezone: true }),

  city: text('city'),
  state: text('state'),
  country: text('country'),
  address: text('address'),

  techStack: jsonb('tech_stack').$type<string[]>().default([]),

  logoUrl: text('logo_url'),
  description: text('description'),
  phone: text('phone'),

  sources: jsonb('sources').$type<SourceRecord[]>().notNull().default([]),
  primarySource: text('primary_source'),
  enrichmentScore: numeric('enrichment_score', { precision: 3, scale: 2 }),

  apolloId: text('apollo_id'),
  leadmagicId: text('leadmagic_id'),

  originalityScore: numeric('originality_score', { precision: 3, scale: 2 }),
  sourceRarityScores: jsonb('source_rarity_scores').$type<Record<string, number>>(),

  pipelineStage: pipelineStageEnum('pipeline_stage').notNull().default('tam'),
  signalScore: numeric('signal_score', { precision: 3, scale: 2 }),

  lastEnrichedAt: timestamp('last_enriched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_companies_client_domain').on(table.clientId, table.domain),
  index('idx_companies_client_industry').on(table.clientId, table.industry),
  index('idx_companies_client_country').on(table.clientId, table.country),
  index('idx_companies_employee_count').on(table.clientId, table.employeeCount),
]);
