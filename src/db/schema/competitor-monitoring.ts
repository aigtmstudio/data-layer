import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';

export const monitoredCompetitors = pgTable('monitored_competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  url: text('url').notNull(),
  uptimerobotMonitorId: text('uptimerobot_monitor_id'),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_monitored_competitors_client').on(t.clientId),
]);

export const competitorDowntimeAlerts = pgTable('competitor_downtime_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  competitorId: uuid('competitor_id').notNull().references(() => monitoredCompetitors.id, { onDelete: 'cascade' }),

  competitorName: text('competitor_name').notNull(),
  downtimeStartedAt: timestamp('downtime_started_at', { withTimezone: true }).notNull(),
  downtimeResolvedAt: timestamp('downtime_resolved_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),

  /** 'ongoing' | 'resolved' */
  status: text('status').notNull().default('ongoing'),
  alertData: jsonb('alert_data'),
  dismissed: boolean('dismissed').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_competitor_alerts_client').on(t.clientId),
  index('idx_competitor_alerts_client_status').on(t.clientId, t.status),
]);
