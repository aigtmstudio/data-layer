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
  'signal_hypothesis_generation',
  'market_signal_processing',
  'company_signals',
  'persona_signal_detection',
  'contact_list_build',
  'deep_enrichment',
  'market_signal_search',
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

export const signalCategoryEnum = pgEnum('signal_category', [
  // Market-level
  'regulatory', 'economic', 'industry', 'competitive',
  // Company-level
  'funding', 'hiring', 'tech_adoption', 'expansion', 'leadership', 'product_launch',
  // Persona-level
  'job_change', 'title_match', 'seniority_match', 'tenure_signal',
]);

export const signalLevelEnum = pgEnum('signal_level', [
  'market', 'company', 'persona',
]);

export const hypothesisStatusEnum = pgEnum('hypothesis_status', [
  'active', 'paused', 'retired',
]);

export const hypothesisValidationEnum = pgEnum('hypothesis_validation', [
  'llm_generated', 'human_validated', 'human_created',
]);

export const pipelineStageEnum = pgEnum('pipeline_stage', [
  'tam', 'active_segment', 'qualified', 'ready_to_approach', 'in_sequence', 'converted',
]);
