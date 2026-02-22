export interface ParallelTaskRun {
  run_id: string;
  interaction_id?: string;
  status: 'queued' | 'action_required' | 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
  is_active: boolean;
  processor: string;
  created_at: string;
  modified_at: string;
  error?: { message: string } | null;
}

export interface ParallelTaskResult<T> {
  run: ParallelTaskRun;
  output: { content: T };
}

export interface ParallelCompanyOutput {
  name?: string;
  domain?: string;
  linkedin_url?: string;
  website_url?: string;
  industry?: string;
  sub_industry?: string;
  employee_count?: number;
  employee_range?: string;
  annual_revenue?: number;
  founded_year?: number;
  total_funding?: number;
  latest_funding_stage?: string;
  city?: string;
  state?: string;
  country?: string;
  description?: string;
  tech_stack?: string[];
  phone?: string;
}

export interface ParallelPersonOutput {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  linkedin_url?: string;
  title?: string;
  seniority?: string;
  department?: string;
  company_name?: string;
  company_domain?: string;
  city?: string;
  state?: string;
  country?: string;
  employment_history?: Array<{
    company: string;
    title: string;
    start_date?: string;
    end_date?: string;
    is_current: boolean;
  }>;
}

export const COMPANY_OUTPUT_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      domain: { type: 'string' },
      linkedin_url: { type: 'string' },
      website_url: { type: 'string' },
      industry: { type: 'string' },
      sub_industry: { type: 'string' },
      employee_count: { type: 'integer' },
      employee_range: { type: 'string' },
      annual_revenue: { type: 'number' },
      founded_year: { type: 'integer' },
      total_funding: { type: 'number' },
      latest_funding_stage: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      country: { type: 'string' },
      description: { type: 'string' },
      tech_stack: { type: 'array', items: { type: 'string' } },
      phone: { type: 'string' },
    },
  },
};

export const PERSON_OUTPUT_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    type: 'object',
    properties: {
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      full_name: { type: 'string' },
      linkedin_url: { type: 'string' },
      title: { type: 'string' },
      seniority: { type: 'string' },
      department: { type: 'string' },
      company_name: { type: 'string' },
      company_domain: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      country: { type: 'string' },
      employment_history: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            company: { type: 'string' },
            title: { type: 'string' },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            is_current: { type: 'boolean' },
          },
        },
      },
    },
  },
};
