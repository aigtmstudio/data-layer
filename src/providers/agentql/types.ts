// ── AgentQL API types ──

export interface AgentQlRequest {
  url?: string;
  html?: string;
  query?: string;
  prompt?: string;
  params?: {
    mode?: 'fast' | 'standard';
    is_screenshot_enabled?: boolean;
    wait_for?: string;
  };
}

export interface AgentQlResponse {
  data: Record<string, unknown>;
  metadata?: {
    request_id?: string;
  };
}

// ── Extraction shapes (what our queries return) ──

export interface AgentQlCompanyExtraction {
  company_name?: string;
  company_description?: string;
  industry?: string;
  founded_year?: number;
  employee_count?: number;
  headquarters_city?: string;
  headquarters_state?: string;
  headquarters_country?: string;
  address?: string;
  phone?: string;
  email?: string;
  linkedin_url?: string;
  twitter_url?: string;
  logo_url?: string;
  products?: string[];
  tech_stack?: string[];
}
