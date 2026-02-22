export interface LeadMagicCompanyResponse {
  success: boolean;
  data?: {
    company_name?: string;
    domain?: string;
    linkedin_url?: string;
    website?: string;
    industry?: string;
    employee_count?: number;
    employee_range?: string;
    revenue?: number;
    revenue_range?: string;
    founded_year?: number;
    total_funding?: number;
    funding_stage?: string;
    city?: string;
    state?: string;
    country?: string;
    address?: string;
    description?: string;
    phone?: string;
    logo_url?: string;
    technologies?: string[];
  };
  error?: string;
}

export interface LeadMagicPersonResponse {
  success: boolean;
  data?: {
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
    work_email?: string;
    personal_email?: string;
    phone?: string;
    mobile_phone?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  error?: string;
}

export interface LeadMagicEmailFindResponse {
  success: boolean;
  data?: {
    email: string;
    confidence: number;
    type: string;
  };
  error?: string;
}
