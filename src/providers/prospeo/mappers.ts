import type { UnifiedContact } from '../types.js';
import type { ProspeoPersonEnrichResponse, ProspeoSearchPersonResponse } from './types.js';

/** Prospeo sometimes returns email/phone as objects instead of strings. Extract safely. */
function asString(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    // Handle shapes like { email: "...", type: "work" } or { number: "..." }
    const obj = val as Record<string, unknown>;
    for (const key of ['email', 'number', 'value', 'raw_number']) {
      if (typeof obj[key] === 'string') return obj[key];
    }
  }
  return undefined;
}

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
    workEmail: asString(raw.email),
    phone: asString(raw.phone),
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
    workEmail: asString(raw.person.email),
    phone: asString(raw.person.mobile),
    companyName: raw.company?.name,
    companyDomain: raw.company?.domain,
    city: raw.person.location?.city,
    state: raw.person.location?.state,
    country: raw.person.location?.country,
    externalIds: raw.person.person_id ? { prospeo: raw.person.person_id } : {},
  };
}
