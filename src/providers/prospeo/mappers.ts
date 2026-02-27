import type { UnifiedContact } from '../types.js';
import type { ProspeoPersonEnrichResponse, ProspeoSearchPersonResponse } from './types.js';

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

export function mapProspeoSearchPersonResult(
  raw: ProspeoSearchPersonResponse['results'][number],
): UnifiedContact {
  return {
    firstName: raw.person.first_name,
    lastName: raw.person.last_name,
    fullName: raw.person.full_name,
    linkedinUrl: raw.person.linkedin_url,
    title: raw.person.current_job_title,
    workEmail: raw.person.email ?? undefined,
    phone: raw.person.mobile ?? undefined,
    companyName: raw.company?.name,
    companyDomain: raw.company?.domain,
    city: raw.person.location?.city,
    state: raw.person.location?.state,
    country: raw.person.location?.country,
    externalIds: raw.person.person_id ? { prospeo: raw.person.person_id } : {},
  };
}
