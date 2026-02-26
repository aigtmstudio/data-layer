import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const promptConfigs = pgTable('prompt_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  content: text('content').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
