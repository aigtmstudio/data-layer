import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { companies } from './companies.js';
import { icps } from './icps.js';
import { personas } from './personas.js';

// ── Types ──

export interface ClientProfileWebsiteData {
  scrapedUrl: string;
  title?: string;
  description?: string;
  products?: string[];
  services?: string[];
  industries?: string[];
  targetAudience?: string;
  competitors?: string[];
  valueProposition?: string;
  techStack?: string[];
  rawText?: string;
}

export interface StrategyData {
  providerPlan: { provider: string; priority: number; reason: string }[];
  signalPriorities: { signalType: string; weight: number }[];
  originalityWeight: number;
  scoringWeights: {
    icpFit: number;
    signals: number;
    originality: number;
    costEfficiency: number;
  };
  maxBudgetPerCompany: number;
  reasoning: string;
}

export interface SignalData {
  evidence: string;
  details?: Record<string, unknown>;
}

// ── Tables ──

export const clientProfiles = pgTable('client_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),

  industry: text('industry'),
  products: jsonb('products').$type<string[]>().default([]),
  targetMarket: text('target_market'),
  competitors: jsonb('competitors').$type<string[]>().default([]),
  valueProposition: text('value_proposition'),

  websiteData: jsonb('website_data').$type<ClientProfileWebsiteData>(),
  lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_client_profiles_client').on(table.clientId),
]);

export const strategies = pgTable('strategies', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  icpId: uuid('icp_id').notNull().references(() => icps.id, { onDelete: 'cascade' }),
  personaId: uuid('persona_id').references(() => personas.id, { onDelete: 'set null' }),

  contextHash: text('context_hash').notNull(),
  strategy: jsonb('strategy').$type<StrategyData>().notNull(),

  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_strategies_client').on(table.clientId),
  uniqueIndex('idx_strategies_context_hash').on(table.clientId, table.contextHash),
]);

export const companySignals = pgTable('company_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  signalType: text('signal_type').notNull(),
  signalStrength: numeric('signal_strength', { precision: 3, scale: 2 }).notNull(),
  signalData: jsonb('signal_data').$type<SignalData>().notNull(),
  source: text('source').notNull(),

  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_company_signals_company').on(table.companyId),
  index('idx_company_signals_client').on(table.clientId),
  index('idx_company_signals_type').on(table.signalType),
]);

export const providerPerformance = pgTable('provider_performance', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerName: text('provider_name').notNull(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  operation: text('operation').notNull(),
  qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
  responseTimeMs: integer('response_time_ms'),
  fieldsPopulated: integer('fields_populated'),
  costCredits: numeric('cost_credits', { precision: 12, scale: 4 }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_provider_perf_provider').on(table.providerName),
  index('idx_provider_perf_client').on(table.clientId),
  index('idx_provider_perf_created').on(table.createdAt),
]);
