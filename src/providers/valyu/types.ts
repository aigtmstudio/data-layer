export interface ValyuSearchResult {
  id: string;
  title: string;
  url: string;
  content: string;
  description: string | null;
  source: string;
  relevance_score: number;
  data_type: 'unstructured' | 'structured';
  publication_date: string;
  metadata?: Record<string, unknown>;
}

export interface ValyuSearchResponse {
  success: boolean;
  error: string | null;
  tx_id: string;
  query: string;
  results: ValyuSearchResult[];
  total_deduction_dollars: number;
}

export interface ValyuContentResult {
  url: string;
  status: 'success' | 'failed';
  title: string;
  content: string | object;
  description: string;
  data_type: 'unstructured' | 'structured';
  summary?: ValyuCompanySummary;
  summary_success?: boolean;
  error?: string;
}

export interface ValyuContentsResponse {
  success: boolean;
  error: string | null;
  tx_id: string;
  results: ValyuContentResult[];
  total_cost_dollars: number;
}

export interface ValyuCompanySummary {
  company_name?: string;
  description?: string;
  industry?: string;
  employee_count?: number;
  employee_range?: string;
  founded_year?: number;
  headquarters?: string;
  tech_stack?: string[];
  annual_revenue?: number;
  total_funding?: number;
  latest_funding_stage?: string;
}

export const COMPANY_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    company_name: { type: 'string' },
    description: { type: 'string' },
    industry: { type: 'string' },
    employee_count: { type: 'number' },
    employee_range: { type: 'string' },
    founded_year: { type: 'number' },
    headquarters: { type: 'string' },
    tech_stack: { type: 'array', items: { type: 'string' } },
    annual_revenue: { type: 'number' },
    total_funding: { type: 'number' },
    latest_funding_stage: { type: 'string' },
  },
};
