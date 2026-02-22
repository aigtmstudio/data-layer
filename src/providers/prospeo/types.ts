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

export interface ProspeoSearchResponse {
  response: Array<{
    first_name?: string;
    last_name?: string;
    full_name?: string;
    linkedin_url?: string;
    title?: string;
    seniority?: string;
    company_name?: string;
    company_domain?: string;
    email?: string;
    city?: string;
    country?: string;
  }>;
  error: boolean;
  pagination?: {
    total: number;
    page: number;
    per_page: number;
  };
  message?: string;
}
