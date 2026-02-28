import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { jobs } from './jobs.js';

// ── Types ──

export interface TrendingTopic {
  topic: string;
  description: string;
  category: string;
  signalCount: number;
  avgRelevance: number;
  affectedSegments: string[];
  /** 0-100 composite score: recency × multi-source coverage × relevance */
  buzzScore: number;
  /** How many distinct source domains/outlets are covering this topic */
  sourceCount: number;
  /** Average age in days of the supporting signals */
  recencyDays: number;
  /** Key sources driving this topic */
  sources: {
    domain: string;
    url: string;
    title: string;
    /** estimated reach/authority: 'major' | 'niche' | 'unknown' */
    authority: 'major' | 'niche' | 'unknown';
  }[];
  clientRelevance: {
    matchingProducts: string[];
    matchingCapabilities: string[];
    reasoning: string;
    overlapScore: number;
  };
  supportingSignals: {
    headline: string;
    sourceUrl: string | null;
    sourceDomain: string | null;
    relevanceScore: number;
    detectedAt: string;
  }[];
}

export interface WebinarAngle {
  title: string;
  description: string;
  targetSegments: string[];
  trendConnection: string;
  clientAngle: string;
  talkingPoints: string[];
  estimatedAppeal: 'high' | 'medium' | 'low';
}

export interface SeedCopy {
  type: 'email_subject' | 'email_body' | 'linkedin_post' | 'linkedin_inmessage';
  topic: string;
  targetSegment: string;
  content: string;
  tone: string;
  cta: string;
}

export interface BuzzReport {
  version: 1;
  generatedAt: string;
  timeWindow: { days: number; from: string; to: string };
  inputSummary: {
    signalsAnalyzed: number;
    hypothesesConsidered: number;
    icpSegments: string[];
    clientProducts: string[];
  };
  trendingTopics: TrendingTopic[];
  webinarAngles: WebinarAngle[];
  seedCopy: SeedCopy[];
}

// ── Table ──

export const buzzReports = pgTable('buzz_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  timeWindowDays: integer('time_window_days').notNull().default(30),
  icpIds: jsonb('icp_ids').$type<string[]>(),
  report: jsonb('report').$type<BuzzReport>(),

  signalsAnalyzed: integer('signals_analyzed'),
  topicsCount: integer('topics_count'),
  webinarAnglesCount: integer('webinar_angles_count'),
  copySnippetsCount: integer('copy_snippets_count'),

  inputHash: text('input_hash'),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('generating'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_buzz_reports_client').on(table.clientId),
  index('idx_buzz_reports_client_status').on(table.clientId, table.status),
]);
