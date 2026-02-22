import { pgTable, uuid, text, timestamp, jsonb, numeric, index } from 'drizzle-orm/pg-core';
import { clients } from './clients.js';
import { companies } from './companies.js';
import { emailVerificationStatusEnum } from './enums.js';

export interface EmploymentRecord {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
}

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),

  firstName: text('first_name'),
  lastName: text('last_name'),
  fullName: text('full_name'),
  linkedinUrl: text('linkedin_url'),
  photoUrl: text('photo_url'),

  title: text('title'),
  seniority: text('seniority'),
  department: text('department'),
  companyName: text('company_name'),
  companyDomain: text('company_domain'),

  workEmail: text('work_email'),
  personalEmail: text('personal_email'),
  emailVerificationStatus: emailVerificationStatusEnum('email_verification_status')
    .notNull()
    .default('unverified'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  phone: text('phone'),
  mobilePhone: text('mobile_phone'),

  city: text('city'),
  state: text('state'),
  country: text('country'),

  employmentHistory: jsonb('employment_history').$type<EmploymentRecord[]>().default([]),

  sources: jsonb('sources').$type<import('./companies.js').SourceRecord[]>().notNull().default([]),
  primarySource: text('primary_source'),
  enrichmentScore: numeric('enrichment_score', { precision: 3, scale: 2 }),

  apolloId: text('apollo_id'),
  leadmagicId: text('leadmagic_id'),
  prospeoId: text('prospeo_id'),

  lastEnrichedAt: timestamp('last_enriched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_contacts_client_email').on(table.clientId, table.workEmail),
  index('idx_contacts_client_company').on(table.clientId, table.companyId),
  index('idx_contacts_client_title').on(table.clientId, table.title),
  index('idx_contacts_client_seniority').on(table.clientId, table.seniority),
  index('idx_contacts_linkedin').on(table.clientId, table.linkedinUrl),
]);
