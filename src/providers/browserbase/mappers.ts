import type { UnifiedCompany } from '../types.js';
import type { PageExtraction } from './types.js';

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseYear(str?: string): number | undefined {
  if (!str) return undefined;
  const match = str.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : undefined;
}

function extractEmployeeCount(
  value?: { value?: number } | number,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  return value.value;
}

export function mapPageExtractionToCompany(
  extraction: PageExtraction,
  domain: string,
): UnifiedCompany {
  // Prefer JSON-LD data if available
  const org = extraction.jsonLd.find(
    j => j['@type'] === 'Organization' || j['@type'] === 'Corporation' || j['@type'] === 'LocalBusiness',
  );

  const name =
    org?.name ??
    extraction.ogData['og:site_name'] ??
    extraction.title ??
    domain;

  const description =
    org?.description ??
    extraction.ogData['og:description'] ??
    extraction.description;

  const logoRaw = org?.logo;
  const logoUrl = typeof logoRaw === 'string'
    ? logoRaw
    : logoRaw?.url ?? extraction.ogData['og:image'];

  const address = org?.address;

  return {
    name,
    domain,
    linkedinUrl: extraction.socialLinks.linkedin,
    websiteUrl: `https://${domain}`,
    industry: org?.industry ?? extraction.ogData['article:section'],
    description,
    foundedYear: parseYear(org?.foundingDate),
    employeeCount: extractEmployeeCount(org?.numberOfEmployees),
    city: address?.addressLocality,
    state: address?.addressRegion,
    country: address?.addressCountry,
    address: address?.streetAddress,
    phone: org?.telephone ?? extraction.phones[0],
    logoUrl,
    externalIds: { browserbase: domain },
  };
}
