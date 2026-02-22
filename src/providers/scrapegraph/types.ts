// ── ScrapeGraphAI API types ──

export interface ScrapeGraphSmartScraperRequest {
  website_url: string;
  user_prompt: string;
}

export interface ScrapeGraphSmartScraperResponse {
  result: Record<string, unknown>;
  request_id?: string;
}

export interface ScrapeGraphSearchRequest {
  user_prompt: string;
}

export interface ScrapeGraphSearchResponse {
  result: Record<string, unknown>;
  reference_urls?: string[];
  request_id?: string;
}

// ── Extraction shapes ──

export interface ScrapeGraphCompanyExtraction {
  company_name?: string;
  description?: string;
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
  total_funding?: string;
  latest_funding_stage?: string;
}
