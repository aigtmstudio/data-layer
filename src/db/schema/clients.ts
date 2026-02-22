import { pgTable, uuid, text, timestamp, jsonb, numeric, boolean } from 'drizzle-orm/pg-core';

export interface ClientSettings {
  defaultExportFormat?: string;
  crmConfig?: {
    salesforce?: { instanceUrl: string; accessToken: string };
    hubspot?: { apiKey: string };
  };
  googleSheetsConfig?: {
    spreadsheetId?: string;
  };
  maxMonthlyCredits?: number;
}

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  industry: text('industry'),
  website: text('website'),
  notes: text('notes'),

  creditBalance: numeric('credit_balance', { precision: 12, scale: 4 })
    .notNull()
    .default('0'),
  creditMarginPercent: numeric('credit_margin_percent', { precision: 5, scale: 2 })
    .notNull()
    .default('30'),

  settings: jsonb('settings').$type<ClientSettings>().default({}),
  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
