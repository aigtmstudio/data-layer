import type { UnifiedContact } from '../types.js';
import type { ProspeoPersonEnrichResponse, ProspeoSearchResponse } from './types.js';

export function mapProspeoPersonEnrich(raw: ProspeoPersonEnrichResponse['response']): UnifiedContact {
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
    workEmail: raw.email,
    phone: raw.phone,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    externalIds: {},
  };
}

export function mapProspeoSearchResult(raw: ProspeoSearchResponse['response'][number]): UnifiedContact {
  return {
    firstName: raw.first_name,
    lastName: raw.last_name,
    fullName: raw.full_name,
    linkedinUrl: raw.linkedin_url,
    title: raw.title,
    seniority: raw.seniority,
    companyName: raw.company_name,
    companyDomain: raw.company_domain,
    workEmail: raw.email,
    city: raw.city,
    country: raw.country,
    externalIds: {},
  };
}
