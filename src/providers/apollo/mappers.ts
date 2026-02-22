import type { UnifiedCompany, UnifiedContact } from '../types.js';
import type { ApolloOrganization, ApolloPerson } from './types.js';

export function mapApolloOrganization(raw: ApolloOrganization): UnifiedCompany {
  return {
    name: raw.name,
    domain: raw.primary_domain ?? raw.website_url?.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    linkedinUrl: raw.linkedin_url,
    websiteUrl: raw.website_url,
    industry: raw.industry,
    subIndustry: raw.sub_industry,
    employeeCount: raw.estimated_num_employees,
    employeeRange: raw.employee_range,
    annualRevenue: raw.annual_revenue,
    foundedYear: raw.founded_year,
    totalFunding: raw.total_funding,
    latestFundingStage: raw.latest_funding_stage,
    latestFundingDate: raw.latest_funding_round_date,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    address: raw.street_address,
    techStack: raw.technology_names ?? [],
    logoUrl: raw.logo_url,
    description: raw.short_description,
    phone: raw.phone,
    externalIds: { apollo: raw.id },
  };
}

export function mapApolloPerson(raw: ApolloPerson): UnifiedContact {
  return {
    firstName: raw.first_name,
    lastName: raw.last_name,
    fullName: raw.name,
    linkedinUrl: raw.linkedin_url,
    photoUrl: raw.photo_url,
    title: raw.title,
    seniority: normalizeSeniority(raw.seniority),
    department: raw.departments?.[0],
    companyName: raw.organization?.name,
    companyDomain: raw.organization?.primary_domain,
    workEmail: raw.email_status === 'verified' ? raw.email : undefined,
    phone: raw.phone_numbers?.find(p => p.type === 'work')?.raw_number,
    mobilePhone: raw.phone_numbers?.find(p => p.type === 'mobile')?.raw_number,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    employmentHistory: raw.employment_history?.map(eh => ({
      company: eh.organization_name ?? '',
      title: eh.title ?? '',
      startDate: eh.start_date,
      endDate: eh.end_date,
      isCurrent: eh.current,
    })),
    externalIds: { apollo: raw.id },
  };
}

function normalizeSeniority(raw?: string): string | undefined {
  if (!raw) return undefined;
  const map: Record<string, string> = {
    c_suite: 'c_suite',
    owner: 'c_suite',
    founder: 'c_suite',
    partner: 'c_suite',
    vp: 'vp',
    vice_president: 'vp',
    director: 'director',
    manager: 'manager',
    senior: 'senior',
    entry: 'entry',
    intern: 'entry',
  };
  return map[raw.toLowerCase()] ?? raw.toLowerCase();
}
