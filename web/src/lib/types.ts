// Types mirroring the backend Drizzle schemas

export interface Client {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website: string | null;
  notes: string | null;
  creditBalance: string;
  creditMarginPercent: string;
  settings: ClientSettings | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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

export interface IcpFilters {
  industries?: string[];
  employeeCountMin?: number;
  employeeCountMax?: number;
  revenueMin?: number;
  revenueMax?: number;
  fundingStages?: string[];
  fundingMin?: number;
  fundingMax?: number;
  foundedAfter?: number;
  foundedBefore?: number;
  countries?: string[];
  states?: string[];
  cities?: string[];
  excludeCountries?: string[];
  techStack?: string[];
  techCategories?: string[];
  signals?: string[];
  keywords?: string[];
  excludeCompanyIds?: string[];
  excludeDomains?: string[];
}

export interface IcpSourceRecord {
  sourceType: 'document' | 'transcript' | 'classic' | 'crm_csv';
  fileName?: string;
  addedAt: string;
  contribution: string[];
}

export interface ProviderSearchHints {
  semanticSearchQuery?: string;
  keywordSearchTerms?: string[];
  industryNaicsMapping?: string[];
  naturalLanguageDescription?: string;
}

export interface Icp {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  naturalLanguageInput: string | null;
  filters: IcpFilters;
  sources: IcpSourceRecord[] | null;
  providerHints: ProviderSearchHints | null;
  suggestedPersonaId: string | null;
  aiParsingConfidence: string | null;
  lastParsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SourceUploadResponse {
  sourceType: string;
  fileName?: string;
  textPreview?: string;
  metadata: Record<string, unknown>;
  pendingSources: number;
  insights?: unknown;
}

export interface PendingSource {
  sourceType: string;
  textPreview?: string;
  hasStructuredData: boolean;
  hasCrmInsights: boolean;
  metadata: Record<string, unknown>;
}

export interface ParseSourcesResponse {
  icp: Icp;
  providerHints: ProviderSearchHints;
  suggestedPersona?: {
    name: string;
    reasoning: string;
    titlePatterns: string[];
    seniorityLevels: string[];
    departments: string[];
  };
  sourceContributions: Record<string, string[]>;
  confidence: number;
}

export interface Persona {
  id: string;
  icpId: string;
  name: string;
  description: string | null;
  titlePatterns: string[];
  seniorityLevels: string[];
  departments: string[];
  countries: string[] | null;
  states: string[] | null;
  yearsExperienceMin: number | null;
  yearsExperienceMax: number | null;
  excludeTitlePatterns: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PipelineStage = 'tam' | 'active_segment' | 'qualified' | 'ready_to_approach' | 'in_sequence' | 'converted';

export interface Company {
  id: string;
  clientId: string;
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  website: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: string | null;
  foundedYear: number | null;
  fundingTotal: string | null;
  fundingStage: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  techStack: string[] | null;
  enrichmentScore: string | null;
  pipelineStage: PipelineStage;
  signalScore: string | null;
  lastEnrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  clientId: string;
  companyId: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  phone: string | null;
  emailVerificationStatus: EmailVerificationStatus;
  country: string | null;
  state: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EmailVerificationStatus = 'unverified' | 'valid' | 'invalid' | 'catch_all' | 'unknown';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type JobType =
  | 'company_enrichment'
  | 'contact_discovery'
  | 'email_verification'
  | 'list_build'
  | 'list_refresh'
  | 'export'
  | 'full_enrichment_pipeline'
  | 'signal_hypothesis_generation'
  | 'market_signal_processing';

export interface Job {
  id: string;
  clientId: string;
  type: JobType;
  status: JobStatus;
  totalItems: number | null;
  processedItems: number | null;
  failedItems: number | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  errors: JobError[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobError {
  item: string;
  error: string;
  timestamp: string;
}

export type CreditTransactionType = 'purchase' | 'usage' | 'adjustment' | 'refund';

export interface CreditTransaction {
  id: string;
  clientId: string;
  type: CreditTransactionType;
  amount: string;
  baseCost: string | null;
  marginAmount: string | null;
  balanceAfter: string;
  description: string;
  dataSource: string | null;
  operationType: string | null;
  jobId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ListType = 'company' | 'contact' | 'mixed';

export interface List {
  id: string;
  clientId: string;
  icpId: string | null;
  personaId: string | null;
  name: string;
  description: string | null;
  type: ListType;
  filterSnapshot: ListFilterSnapshot | null;
  refreshEnabled: boolean;
  refreshCron: string | null;
  lastRefreshedAt: string | null;
  nextRefreshAt: string | null;
  memberCount: number;
  companyCount: number;
  contactCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListFilterSnapshot {
  icpFilters: Record<string, unknown>;
  personaFilters?: Record<string, unknown>;
  appliedAt: string;
}

export interface ListMember {
  id: string;
  listId: string;
  companyId: string | null;
  contactId: string | null;
  icpFitScore: string | null;
  addedReason: string | null;
  addedAt: string;
  removedAt: string | null;
  company?: Company;
  contact?: Contact;
}

export type ExportFormat = 'csv' | 'excel' | 'google_sheets' | 'salesforce' | 'hubspot';

export interface ExportRequest {
  clientId: string;
  listId: string;
  format: ExportFormat;
  destination?: Record<string, unknown>;
}

// Signal Pipeline types

export type SignalCategory = 'regulatory' | 'economic' | 'technology' | 'competitive';
export type HypothesisStatus = 'active' | 'paused' | 'retired';
export type HypothesisValidation = 'llm_generated' | 'human_validated' | 'human_created';

export interface SignalHypothesis {
  id: string;
  clientId: string;
  icpId: string | null;
  hypothesis: string;
  signalCategory: SignalCategory;
  monitoringSources: string[];
  affectedSegments: string[];
  priority: number;
  status: HypothesisStatus;
  validatedBy: HypothesisValidation;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MarketSignal {
  id: string;
  clientId: string;
  hypothesisId: string | null;
  signalCategory: SignalCategory | null;
  headline: string;
  summary: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  relevanceScore: string | null;
  affectedSegments: string[];
  rawData: Record<string, unknown>;
  processed: boolean;
  detectedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
}
