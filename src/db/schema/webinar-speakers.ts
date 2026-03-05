import { pgTable, uuid, text, timestamp, jsonb, integer, index, numeric } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { buzzReports } from './market-buzz.js';
import { jobs } from './jobs.js';

export interface SocialProfile {
  platform: 'linkedin' | 'twitter' | 'instagram' | 'youtube' | 'reddit' | 'other';
  handle: string;
  url: string;
}

export interface SpeakerEvidence {
  text: string;
  url: string;
}

export const webinarSpeakers = pgTable('webinar_speakers', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  buzzReportId: uuid('buzz_report_id').notNull().references(() => buzzReports.id, { onDelete: 'cascade' }),
  angleIndex: integer('angle_index').notNull(),
  angleTitle: text('angle_title').notNull(),

  // Identity
  name: text('name').notNull(),
  currentTitle: text('current_title'),
  company: text('company'),
  bio: text('bio'),

  // Social presence
  socialProfiles: jsonb('social_profiles').$type<SocialProfile[]>().notNull().default([]),
  primaryPlatform: text('primary_platform'),
  primaryProfileUrl: text('primary_profile_url'),

  // Scores
  relevanceScore: numeric('relevance_score', { precision: 3, scale: 2 }),
  reachScore: numeric('reach_score', { precision: 3, scale: 2 }),
  overallRank: integer('overall_rank'),

  // AI content
  speakerReasoning: text('speaker_reasoning'),
  evidence: jsonb('evidence').$type<SpeakerEvidence[]>().notNull().default([]),
  outreachMessage: text('outreach_message'),

  // Provenance
  discoverySource: text('discovery_source'),
  sourceUrl: text('source_url'),

  // Job linkage
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_webinar_speakers_report').on(table.buzzReportId, table.angleIndex),
  index('idx_webinar_speakers_client').on(table.clientId),
]);

export type WebinarSpeaker = typeof webinarSpeakers.$inferSelect;
export type NewWebinarSpeaker = typeof webinarSpeakers.$inferInsert;
