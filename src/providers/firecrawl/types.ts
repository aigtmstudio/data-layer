// ── Firecrawl API types ──

export interface FirecrawlExtractRequest {
  urls: string[];
  prompt?: string;
  schema?: Record<string, unknown>;
  enableWebSearch?: boolean;
}

export interface FirecrawlExtractResponse {
  success: boolean;
  data: FirecrawlExtractedData[];
}

export interface FirecrawlExtractedData {
  url?: string;
  company_name?: string;
  company_description?: string;
  industry?: string;
  founded_year?: number;
  employee_count?: number;
  employee_range?: string;
  annual_revenue?: string;
  headquarters_city?: string;
  headquarters_state?: string;
  headquarters_country?: string;
  address?: string;
  phone?: string;
  email?: string;
  linkedin_url?: string;
  twitter_url?: string;
  logo_url?: string;
  tech_stack?: string[];
  funding_total?: string;
  latest_funding_stage?: string;
  result?: string;
}

export interface FirecrawlSearchRequest {
  query: string;
  limit?: number;
}

export interface FirecrawlSearchResponse {
  success: boolean;
  data: FirecrawlSearchResult[];
}

export interface FirecrawlSearchResult {
  url: string;
  markdown?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceUrl?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}

export const COMPANY_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    company_name: { type: 'string', description: 'Official company name' },
    company_description: { type: 'string', description: 'Company description or mission' },
    industry: { type: 'string', description: 'Primary industry' },
    founded_year: { type: 'number', description: 'Year founded' },
    employee_count: { type: 'number', description: 'Number of employees' },
    employee_range: { type: 'string', description: 'Employee range (e.g. 51-200)' },
    annual_revenue: { type: 'string', description: 'Annual revenue' },
    headquarters_city: { type: 'string', description: 'HQ city' },
    headquarters_state: { type: 'string', description: 'HQ state/region' },
    headquarters_country: { type: 'string', description: 'HQ country' },
    address: { type: 'string', description: 'Full address' },
    phone: { type: 'string', description: 'Main phone number' },
    email: { type: 'string', description: 'Contact email' },
    linkedin_url: { type: 'string', description: 'LinkedIn company URL' },
    twitter_url: { type: 'string', description: 'Twitter/X URL' },
    logo_url: { type: 'string', description: 'Company logo URL' },
    tech_stack: { type: 'array', items: { type: 'string' }, description: 'Technologies used' },
    funding_total: { type: 'string', description: 'Total funding amount' },
    latest_funding_stage: { type: 'string', description: 'Latest funding round (Seed, Series A, etc.)' },
  },
} as const;
