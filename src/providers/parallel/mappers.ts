import type { UnifiedCompany, UnifiedContact } from '../types.js';
import type { ParallelCompanyOutput, ParallelPersonOutput } from './types.js';

export function mapParallelCompany(raw: ParallelCompanyOutput): UnifiedCompany {
  return {
    name: raw.name ?? 'Unknown',
    domain: raw.domain,
    linkedinUrl: raw.linkedin_url,
    websiteUrl: raw.website_url,
    industry: raw.industry,
    subIndustry: raw.sub_industry,
    employeeCount: raw.employee_count,
    employeeRange: raw.employee_range,
    annualRevenue: raw.annual_revenue,
    foundedYear: raw.founded_year,
    totalFunding: raw.total_funding,
    latestFundingStage: raw.latest_funding_stage,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    description: raw.description?.slice(0, 1000),
    techStack: raw.tech_stack ?? [],
    phone: raw.phone,
    externalIds: { parallel: raw.domain ?? '' },
  };
}

export function mapParallelPerson(raw: ParallelPersonOutput): UnifiedContact {
  return {
    firstName: raw.first_name,
    lastName: raw.last_name,
    fullName: raw.full_name ?? [raw.first_name, raw.last_name].filter(Boolean).join(' '),
    linkedinUrl: raw.linkedin_url,
    title: raw.title,
    seniority: raw.seniority,
    department: raw.department,
    companyName: raw.company_name,
    companyDomain: raw.company_domain,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    employmentHistory: raw.employment_history?.map(eh => ({
      company: eh.company,
      title: eh.title,
      startDate: eh.start_date,
      endDate: eh.end_date,
      isCurrent: eh.is_current,
    })),
    externalIds: { parallel: raw.linkedin_url ?? '' },
  };
}
