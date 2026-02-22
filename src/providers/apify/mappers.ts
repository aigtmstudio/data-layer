import type { UnifiedCompany, UnifiedContact } from '../types.js';
import type { LinkedInCompanyResult, LinkedInProfileResult } from './types.js';

export function mapLinkedInCompany(raw: LinkedInCompanyResult): UnifiedCompany {
  const domain = extractDomain(raw.website);

  return {
    name: raw.name ?? 'Unknown',
    domain,
    websiteUrl: raw.website,
    linkedinUrl: raw.linkedinUrl,
    industry: raw.industry,
    employeeRange: raw.companySize,
    employeeCount: parseEmployeeCount(raw.companySize),
    description: raw.description?.slice(0, 1000),
    foundedYear: raw.foundedYear,
    logoUrl: raw.logo,
    techStack: raw.specialties ?? [],
    externalIds: { apify: raw.linkedinUrl ?? '' },
  };
}

export function mapLinkedInProfile(raw: LinkedInProfileResult): UnifiedContact {
  return {
    firstName: raw.firstName,
    lastName: raw.lastName,
    fullName: raw.fullName ?? [raw.firstName, raw.lastName].filter(Boolean).join(' '),
    linkedinUrl: raw.linkedinUrl,
    photoUrl: raw.profilePicture,
    title: raw.jobTitle ?? raw.headline,
    companyName: raw.companyName,
    companyDomain: extractDomain(raw.companyWebsite),
    workEmail: raw.email,
    city: parseLocation(raw.location)?.city,
    state: parseLocation(raw.location)?.state,
    country: parseLocation(raw.location)?.country,
    employmentHistory: raw.experience?.map(exp => ({
      company: exp.company ?? '',
      title: exp.title ?? '',
      startDate: exp.startDate,
      endDate: exp.endDate,
      isCurrent: exp.current ?? false,
    })),
    externalIds: { apify: raw.linkedinUrl ?? '' },
  };
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseEmployeeCount(range?: string): number | undefined {
  if (!range) return undefined;
  // Formats like "1001-5000", "51-200", "10001+"
  const match = range.match(/(\d[\d,]*)/);
  if (!match) return undefined;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

function parseLocation(location?: string): { city?: string; state?: string; country?: string } | undefined {
  if (!location) return undefined;
  const parts = location.split(',').map(p => p.trim());
  if (parts.length >= 3) return { city: parts[0], state: parts[1], country: parts[2] };
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  return { city: parts[0] };
}
