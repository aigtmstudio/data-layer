import type { UnifiedCompany, UnifiedContact } from '../types.js';
import type { LeadMagicCompanyResponse, LeadMagicPersonResponse } from './types.js';

export function mapLeadMagicCompany(raw: NonNullable<LeadMagicCompanyResponse['data']>): UnifiedCompany {
  return {
    name: raw.company_name ?? '',
    domain: raw.domain,
    linkedinUrl: raw.linkedin_url,
    websiteUrl: raw.website,
    industry: raw.industry,
    employeeCount: raw.employee_count,
    employeeRange: raw.employee_range,
    annualRevenue: raw.revenue,
    revenueRange: raw.revenue_range,
    foundedYear: raw.founded_year,
    totalFunding: raw.total_funding,
    latestFundingStage: raw.funding_stage,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    address: raw.address,
    description: raw.description,
    phone: raw.phone,
    logoUrl: raw.logo_url,
    techStack: raw.technologies ?? [],
    externalIds: {},
  };
}

export function mapLeadMagicPerson(raw: NonNullable<LeadMagicPersonResponse['data']>): UnifiedContact {
  return {
    firstName: raw.first_name,
    lastName: raw.last_name,
    fullName: raw.full_name,
    linkedinUrl: raw.linkedin_url,
    photoUrl: raw.photo_url,
    title: raw.title,
    seniority: raw.seniority,
    department: raw.department,
    companyName: raw.company_name,
    companyDomain: raw.company_domain,
    workEmail: raw.work_email,
    personalEmail: raw.personal_email,
    phone: raw.phone,
    mobilePhone: raw.mobile_phone,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    externalIds: {},
  };
}
