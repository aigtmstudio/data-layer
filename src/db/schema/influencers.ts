import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';

export type InfluencerPlatform = 'instagram' | 'twitter' | 'youtube' | 'linkedin' | 'reddit';
export type InfluencerCategory = 'industry_expert' | 'journalist' | 'competitor_exec' | 'customer' | 'other';

export const influencers = pgTable('influencers', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  platform: text('platform').notNull().$type<InfluencerPlatform>(),
  handle: text('handle').notNull(),
  profileUrl: text('profile_url'),
  category: text('category').$type<InfluencerCategory>(),
  notes: text('notes'),

  isActive: boolean('is_active').notNull().default(true),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_influencers_client').on(t.clientId),
  index('idx_influencers_client_active').on(t.clientId, t.isActive),
]);
