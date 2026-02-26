import { pgTable, uuid, text, timestamp, jsonb, numeric, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { contacts } from './contacts.js';
import type { SignalData } from './intelligence.js';

export const contactSignals = pgTable('contact_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  signalType: text('signal_type').notNull(),
  signalStrength: numeric('signal_strength', { precision: 3, scale: 2 }).notNull(),
  signalData: jsonb('signal_data').$type<SignalData>().notNull(),
  source: text('source').notNull(),

  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_contact_signals_contact').on(table.contactId),
  index('idx_contact_signals_client').on(table.clientId),
  index('idx_contact_signals_type').on(table.signalType),
]);
