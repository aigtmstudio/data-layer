import type { UnifiedCompany } from '../types.js';
import type { AgentQlCompanyExtraction } from './types.js';

function getEmployeeRange(count?: number): string | undefined {
  if (!count) return undefined;
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  if (count <= 500) return '201-500';
  if (count <= 1000) return '501-1000';
  if (count <= 5000) return '1001-5000';
  if (count <= 10000) return '5001-10000';
  return '10001+';
}

export function mapAgentQlCompany(
  data: AgentQlCompanyExtraction,
  domain: string,
): UnifiedCompany {
  return {
    name: data.company_name ?? domain,
    domain,
    linkedinUrl: data.linkedin_url,
    websiteUrl: `https://${domain}`,
    industry: data.industry,
    description: data.company_description,
    foundedYear: data.founded_year,
    employeeCount: data.employee_count,
    employeeRange: getEmployeeRange(data.employee_count),
    city: data.headquarters_city,
    state: data.headquarters_state,
    country: data.headquarters_country,
    address: data.address,
    phone: data.phone ?? data.email,
    logoUrl: data.logo_url,
    techStack: data.tech_stack,
    externalIds: { agentql: domain },
  };
}
