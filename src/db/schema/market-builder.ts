import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { icps } from './icps.js';

export type ProviderSlug =
  | 'google_places'
  | 'listings_opentable'
  | 'listings_ubereats'
  | 'listings_justeat'
  | 'news'
  | 'reviews'
  | 'apollo'
  | 'social_instagram'
  | 'social_linkedin';

export interface ProviderTask {
  provider: ProviderSlug;
  priority: 'primary' | 'supplemental';
  rationale: string;
  params: {
    queries?: string[];
    query?: string;
    location?: string;
    category?: string;
    platform?: string;
    limit?: number;
  };
}

export interface MarketBuilderPlan {
  reasoning: string;
  vertical: string;
  providers: ProviderTask[];
  expectedOutcome: string;
  version: number;
}

export interface FeedbackEntry {
  feedback: string;
  respondedAt: string;
}

export interface ProviderExecutionResult {
  found: number;
  added: number;
  error?: string;
}

export interface ExecutionRecord {
  executedAt: string;
  listId?: string;
  byProvider: Record<string, ProviderExecutionResult>;
  totalFound: number;
  totalAdded: number;
}

export const icpBuildPlans = pgTable('icp_build_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  icpId: uuid('icp_id').references(() => icps.id, { onDelete: 'set null' }),
  plan: jsonb('plan').$type<MarketBuilderPlan>().notNull(),
  status: text('status').notNull().default('draft'), // 'draft' | 'approved' | 'archived'
  feedbackHistory: jsonb('feedback_history').$type<FeedbackEntry[]>().notNull().default([]),
  executionHistory: jsonb('execution_history').$type<ExecutionRecord[]>().notNull().default([]),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_icp_build_plans_client').on(t.clientId),
  index('idx_icp_build_plans_icp').on(t.icpId),
  index('idx_icp_build_plans_status').on(t.status),
]);
