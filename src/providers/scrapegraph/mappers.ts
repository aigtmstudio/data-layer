import type { UnifiedCompany } from '../types.js';
import type { ScrapeGraphCompanyExtraction } from './types.js';

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseMoneyString(str?: string): number | undefined {
  if (!str) return undefined;
  const match = str.replace(/,/g, '').match(/([\d.]+)\s*(billion|million|B|M|K|thousand)?/i);
  if (!match) return undefined;
  let value = parseFloat(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === 'billion' || unit === 'b') value *= 1_000_000_000;
  else if (unit === 'million' || unit === 'm') value *= 1_000_000;
  else if (unit === 'thousand' || unit === 'k') value *= 1_000;
  return value;
}

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

export function mapScrapeGraphCompany(
  data: ScrapeGraphCompanyExtraction,
  domain: string,
): UnifiedCompany {
  return {
    name: data.company_name ?? domain,
    domain,
    linkedinUrl: data.linkedin_url,
    websiteUrl: `https://${domain}`,
    industry: data.industry,
    description: data.description,
    foundedYear: data.founded_year,
    employeeCount: data.employee_count,
    employeeRange: data.employee_range ?? getEmployeeRange(data.employee_count),
    annualRevenue: parseMoneyString(data.annual_revenue),
    totalFunding: parseMoneyString(data.total_funding),
    latestFundingStage: data.latest_funding_stage,
    city: data.headquarters_city,
    state: data.headquarters_state,
    country: data.headquarters_country,
    address: data.address,
    phone: data.phone,
    logoUrl: data.logo_url,
    techStack: data.tech_stack,
    externalIds: { scrapegraph: domain },
  };
}

export function mapScrapeGraphSearchToCompany(
  data: Record<string, unknown>,
  referenceUrl?: string,
): UnifiedCompany {
  const domain = extractDomain(referenceUrl);
  return {
    name: (data.company_name as string) ?? (data.name as string) ?? domain ?? 'Unknown',
    domain,
    websiteUrl: referenceUrl,
    description: (data.description as string) ?? (data.summary as string),
    industry: data.industry as string | undefined,
    externalIds: { scrapegraph: domain ?? referenceUrl ?? 'unknown' },
  };
}
