export interface ProspeoEmailFinderResponse {
  response: {
    email: string;
    confidence: number;
    email_type: string;
  };
  error: boolean;
  message?: string;
}

export interface ProspeoEmailVerifierResponse {
  response: {
    email: string;
    result: 'valid' | 'invalid' | 'catch_all' | 'unknown';
    score: number;
  };
  error: boolean;
  message?: string;
}

export interface ProspeoPersonEnrichResponse {
  response: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    linkedin_url?: string;
    photo_url?: string;
    title?: string;
    seniority?: string;
    department?: string;
    company_name?: string;
    company_domain?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  error: boolean;
  message?: string;
}

export interface ProspeoSearchPersonResponse {
  results: Array<{
    person: {
      person_id?: string;
      first_name?: string;
      last_name?: string;
      full_name?: string;
      linkedin_url?: string;
      current_job_title?: string;
      headline?: string;
      email?: string;
      mobile?: string;
      location?: {
        country?: string;
        country_code?: string;
        state?: string;
        city?: string;
      };
      job_history?: Array<{
        title?: string;
        company_name?: string;
      }>;
    };
    company: {
      company_id?: string;
      name?: string;
      website?: string;
      domain?: string;
      industry?: string;
      employee_count?: number;
    };
  }>;
  error: boolean;
  error_code?: string;
  pagination?: {
    current_page: number;
    per_page: number;
    total_page: number;
    total_count: number;
  };
}
