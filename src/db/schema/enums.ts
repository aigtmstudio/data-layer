import { pgEnum } from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', [
  'pending', 'running', 'completed', 'failed', 'cancelled',
]);

export const jobTypeEnum = pgEnum('job_type', [
  'company_enrichment',
  'contact_discovery',
  'email_verification',
  'list_build',
  'list_refresh',
  'export',
  'full_enrichment_pipeline',
]);

export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'purchase', 'usage', 'adjustment', 'refund',
]);

export const emailVerificationStatusEnum = pgEnum('email_verification_status', [
  'unverified', 'valid', 'invalid', 'catch_all', 'unknown',
]);

export const dataSourceTypeEnum = pgEnum('data_source_type', [
  'search', 'enrichment', 'email_finding', 'email_verification', 'scraping',
]);

export const listTypeEnum = pgEnum('list_type', ['company', 'contact', 'mixed']);

export const exportFormatEnum = pgEnum('export_format', [
  'csv', 'excel', 'google_sheets', 'salesforce', 'hubspot',
]);
