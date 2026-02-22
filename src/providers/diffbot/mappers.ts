import type { UnifiedCompany, UnifiedContact } from '../types.js';
import type { DiffbotEntity, DiffbotLocation } from './types.js';

function extractDomain(uri?: string): string | undefined {
  if (!uri) return undefined;
  try {
    return new URL(uri.startsWith('http') ? uri : `https://${uri}`).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseFoundingYear(date?: { str: string }): number | undefined {
  if (!date?.str) return undefined;
  // Diffbot dates are prefixed with 'd', e.g. "d2015-01-01"
  const cleaned = date.str.replace(/^d/, '');
  const year = parseInt(cleaned, 10);
  return isNaN(year) ? undefined : year;
}

function parseDateStr(date?: { str: string }): string | undefined {
  if (!date?.str) return undefined;
  return date.str.replace(/^d/, '');
}

function getCurrentLocation(locations?: DiffbotLocation[]): DiffbotLocation | undefined {
  if (!locations?.length) return undefined;
  return locations.find(l => l.isCurrent) ?? locations[0];
}

function getLatestRevenue(yearlyRevenues?: { revenue: { value: number }; isCurrent?: boolean; year?: number }[]): number | undefined {
  if (!yearlyRevenues?.length) return undefined;
  const current = yearlyRevenues.find(r => r.isCurrent);
  if (current) return current.revenue.value;
  const sorted = [...yearlyRevenues].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return sorted[0]?.revenue.value;
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

function findSocialProfile(profiles?: { uri: string; typeName?: string }[], type?: string): string | undefined {
  if (!profiles?.length) return undefined;
  return profiles.find(p => p.typeName?.toLowerCase() === type?.toLowerCase())?.uri;
}

export function mapDiffbotCompany(entity: DiffbotEntity): UnifiedCompany {
  const location = getCurrentLocation(entity.locations);
  const latestInvestment = entity.investments?.length
    ? entity.investments[entity.investments.length - 1]
    : undefined;

  return {
    name: entity.name,
    domain: extractDomain(entity.homepageUri),
    linkedinUrl: entity.linkedInUri ?? findSocialProfile(entity.socialProfiles, 'linkedin'),
    websiteUrl: entity.homepageUri,
    industry: entity.industries?.[0]?.name ?? entity.categories?.[0]?.name,
    subIndustry: entity.industries?.[1]?.name ?? entity.categories?.[1]?.name,
    employeeCount: entity.nbEmployees,
    employeeRange: getEmployeeRange(entity.nbEmployees),
    annualRevenue: getLatestRevenue(entity.yearlyRevenues),
    foundedYear: parseFoundingYear(entity.foundingDate),
    totalFunding: entity.totalInvestment?.value,
    latestFundingStage: latestInvestment?.series,
    latestFundingDate: parseDateStr(latestInvestment?.date),
    city: location?.city?.name,
    state: location?.region?.name,
    country: location?.country?.name,
    address: location?.address,
    techStack: entity.technographics?.map(t => t.name),
    logoUrl: entity.logo,
    description: entity.summary ?? entity.description,
    externalIds: { diffbot: entity.id },
  };
}

export function mapDiffbotPerson(entity: DiffbotEntity): UnifiedContact {
  const currentJob = entity.employments?.find(e => e.isCurrent);
  const location = getCurrentLocation(entity.locations);
  const workEmail = entity.emailAddresses?.find(e => e.type === 'professional')?.address;
  const personalEmail = entity.emailAddresses?.find(e => e.type === 'personal')?.address;
  const anyEmail = entity.emailAddresses?.[0]?.address;

  return {
    firstName: entity.nameDetail?.firstName,
    lastName: entity.nameDetail?.lastName,
    fullName: entity.name,
    linkedinUrl: entity.linkedInUri ?? findSocialProfile(entity.socialProfiles, 'linkedin'),
    title: currentJob?.title,
    companyName: currentJob?.employer?.name,
    companyDomain: extractDomain(currentJob?.employer?.homepageUri),
    workEmail: workEmail ?? (!personalEmail ? anyEmail : undefined),
    personalEmail: personalEmail,
    phone: entity.phoneNumbers?.[0]?.string,
    city: location?.city?.name,
    state: location?.region?.name,
    country: location?.country?.name,
    employmentHistory: entity.employments?.map(e => ({
      company: e.employer?.name ?? 'Unknown',
      title: e.title ?? 'Unknown',
      startDate: parseDateStr(e.from),
      endDate: parseDateStr(e.to),
      isCurrent: e.isCurrent ?? false,
    })),
    externalIds: { diffbot: entity.id },
  };
}
