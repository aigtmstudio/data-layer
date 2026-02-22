import type { UnifiedCompany } from '../types.js';
import type { FirecrawlExtractedData, FirecrawlSearchResult } from './types.js';

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseRevenue(str?: string): number | undefined {
  if (!str) return undefined;
  const match = str.replace(/,/g, '').match(/([\d.]+)\s*(million|billion|M|B|K|thousand)?/i);
  if (!match) return undefined;
  let value = parseFloat(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === 'billion' || unit === 'b') value *= 1_000_000_000;
  else if (unit === 'million' || unit === 'm') value *= 1_000_000;
  else if (unit === 'thousand' || unit === 'k') value *= 1_000;
  return value;
}

function parseFunding(str?: string): number | undefined {
  return parseRevenue(str);
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

export function mapFirecrawlExtractToCompany(
  data: FirecrawlExtractedData,
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
    employeeRange: data.employee_range ?? getEmployeeRange(data.employee_count),
    annualRevenue: parseRevenue(data.annual_revenue),
    totalFunding: parseFunding(data.funding_total),
    latestFundingStage: data.latest_funding_stage,
    city: data.headquarters_city,
    state: data.headquarters_state,
    country: data.headquarters_country,
    address: data.address,
    phone: data.phone,
    logoUrl: data.logo_url,
    techStack: data.tech_stack,
    externalIds: { firecrawl: domain },
  };
}

export function mapFirecrawlSearchToCompany(result: FirecrawlSearchResult): UnifiedCompany {
  const domain = extractDomain(result.url);
  return {
    name: result.metadata?.ogTitle ?? result.metadata?.title ?? domain ?? 'Unknown',
    domain,
    websiteUrl: result.url,
    description: result.metadata?.ogDescription ?? result.metadata?.description,
    logoUrl: result.metadata?.ogImage,
    externalIds: { firecrawl: domain ?? result.url },
  };
}
