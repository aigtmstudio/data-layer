import type { UnifiedCompany } from '../types.js';
import type { ValyuSearchResult, ValyuCompanySummary } from './types.js';

export function mapValyuSearchResultToCompany(result: ValyuSearchResult): UnifiedCompany {
  const domain = extractDomain(result.url);
  const name = result.title?.replace(/ [-|–—].*/,  '').trim() ?? domain ?? 'Unknown';

  return {
    name,
    domain,
    websiteUrl: result.url,
    description: (result.description ?? result.content)?.slice(0, 1000),
    externalIds: { valyu: result.id },
  };
}

export function mapValyuSummaryToCompany(summary: ValyuCompanySummary, domain?: string): UnifiedCompany {
  const location = parseHeadquarters(summary.headquarters);

  return {
    name: summary.company_name ?? 'Unknown',
    domain,
    industry: summary.industry,
    employeeCount: summary.employee_count,
    employeeRange: summary.employee_range,
    annualRevenue: summary.annual_revenue,
    foundedYear: summary.founded_year,
    totalFunding: summary.total_funding,
    latestFundingStage: summary.latest_funding_stage,
    description: summary.description?.slice(0, 1000),
    techStack: summary.tech_stack ?? [],
    city: location?.city,
    state: location?.state,
    country: location?.country,
    externalIds: { valyu: domain ?? '' },
  };
}

function extractDomain(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseHeadquarters(hq?: string): { city?: string; state?: string; country?: string } | undefined {
  if (!hq) return undefined;
  const parts = hq.split(',').map(p => p.trim());
  if (parts.length >= 3) return { city: parts[0], state: parts[1], country: parts[2] };
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  return { city: parts[0] };
}
