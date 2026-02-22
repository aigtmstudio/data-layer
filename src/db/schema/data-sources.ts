import { pgTable, uuid, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
import { dataSourceTypeEnum } from './enums.js';

export interface CostConfig {
  [operationType: string]: {
    baseCostCredits: number;
    description: string;
  };
}

export const dataSources = pgTable('data_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  type: dataSourceTypeEnum('type').notNull(),
  isActive: boolean('is_active').notNull().default(true),

  priority: integer('priority').notNull().default(100),

  costPerOperation: jsonb('cost_per_operation').$type<CostConfig>().notNull().default({}),

  rateLimitPerSecond: integer('rate_limit_per_second'),
  rateLimitPerMinute: integer('rate_limit_per_minute'),
  rateLimitPerDay: integer('rate_limit_per_day'),
  dailyUsageCount: integer('daily_usage_count').default(0),
  dailyUsageResetAt: timestamp('daily_usage_reset_at', { withTimezone: true }),

  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),

  apiBaseUrl: text('api_base_url'),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
