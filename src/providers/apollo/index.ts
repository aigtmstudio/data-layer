import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanySearchParams,
  CompanyEnrichParams,
  PeopleSearchParams,
  PeopleEnrichParams,
  UnifiedCompany,
  UnifiedContact,
  ProviderResponse,
  PaginatedResponse,
} from '../types.js';
import { mapApolloOrganization, mapApolloPerson } from './mappers.js';
import type {
  ApolloOrgEnrichResponse,
  ApolloPeopleSearchResponse,
  ApolloCompanySearchResponse,
  ApolloPersonEnrichResponse,
} from './types.js';

export class ApolloProvider extends BaseProvider implements DataProvider {
  readonly name = 'apollo';
  readonly displayName = 'Apollo.io';
  readonly capabilities: ProviderCapability[] = [
    'company_search', 'company_enrich', 'people_search', 'people_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.apollo.io/api/v1',
      rateLimit: { perSecond: 5, perMinute: 100 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async searchCompanies(params: CompanySearchParams): Promise<PaginatedResponse<UnifiedCompany>> {
    try {
      const body: Record<string, unknown> = {
        per_page: Math.min(params.limit ?? 25, 100),
        page: params.offset ? Math.floor(params.offset / 100) + 1 : 1,
      };

      if (params.industries?.length) body.organization_industries = params.industries;
      if (params.employeeCountMin != null || params.employeeCountMax != null) {
        body.organization_num_employees_ranges = buildEmployeeRanges(
          params.employeeCountMin, params.employeeCountMax,
        );
      }
      if (params.revenueMin != null || params.revenueMax != null) {
        body.organization_revenue_ranges = buildRevenueRanges(
          params.revenueMin, params.revenueMax,
        );
      }
      if (params.fundingStages?.length) {
        body.organization_latest_funding_stage_cd = params.fundingStages.map(normalizeFundingStage);
      }

      // Build location filters: countries + states + cities
      // Apollo expects full country names (e.g. "United Kingdom"), not ISO codes (e.g. "GB")
      const locations: string[] = [];
      if (params.countries?.length) locations.push(...params.countries.map(expandCountryCode));
      if (params.states?.length) locations.push(...params.states);
      if (params.cities?.length) locations.push(...params.cities);
      if (locations.length) body.organization_locations = locations;

      // Note: q_organization_keyword_tags expects Apollo's specific taxonomy tags,
      // not freeform ICP keywords. Skipping — scoring handles keyword matching.
      // Note: currently_using_any_of_technology_uids requires Apollo UIDs, not human-readable
      // tech names like "React" or "PoS". Skipping — scoring handles tech stack matching.

      const raw = await this.request<ApolloCompanySearchResponse>(
        'post', '/mixed_companies/search', { body },
      );

      const companies = raw.organizations.map(mapApolloOrganization);
      return {
        success: true,
        data: companies,
        totalResults: raw.pagination.total_entries,
        hasMore: raw.pagination.page < raw.pagination.total_pages,
        nextPageToken: raw.pagination.page + 1,
        creditsConsumed: 0,
        fieldsPopulated: ['name', 'domain', 'industry'],
        qualityScore: 0.5,
      };
    } catch (error) {
      if (this.isPlanRestriction(error)) {
        this.log.warn('Company search requires a paid Apollo plan — skipping');
      } else {
        this.log.error({ error }, 'Company search failed');
      }
      return {
        success: false, data: [], totalResults: 0, hasMore: false,
        error: String(error), creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    try {
      const queryParams: Record<string, string> = {};
      if (params.domain) queryParams.domain = params.domain;

      const raw = await this.request<ApolloOrgEnrichResponse>(
        'get', '/organizations/enrich', { params: queryParams },
      );

      if (!raw.organization) {
        return {
          success: false, data: null, error: 'No organization found',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapApolloOrganization(raw.organization);
      const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

      return {
        success: true,
        data: unified,
        creditsConsumed: 1,
        fieldsPopulated,
        qualityScore: Math.min(fieldsPopulated.length / 15, 1),
      };
    } catch (error) {
      this.log.error({ error, params }, 'Company enrichment failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async searchPeople(params: PeopleSearchParams): Promise<PaginatedResponse<UnifiedContact>> {
    try {
      const body: Record<string, unknown> = {
        per_page: Math.min(params.limit ?? 25, 100),
        page: params.offset ? Math.floor(params.offset / 100) + 1 : 1,
      };

      if (params.titlePatterns?.length) body.person_titles = params.titlePatterns;
      if (params.seniorityLevels?.length) body.person_seniorities = params.seniorityLevels;
      if (params.departments?.length) body.person_departments = params.departments;
      if (params.companyDomains?.length) body.organization_domains = params.companyDomains;
      if (params.countries?.length) body.person_locations = params.countries;

      const raw = await this.request<ApolloPeopleSearchResponse>(
        'post', '/mixed_people/search', { body },
      );

      const contacts = raw.people.map(mapApolloPerson);
      return {
        success: true,
        data: contacts,
        totalResults: raw.pagination.total_entries,
        hasMore: raw.pagination.page < raw.pagination.total_pages,
        nextPageToken: raw.pagination.page + 1,
        creditsConsumed: 0,
        fieldsPopulated: ['name', 'title', 'company', 'linkedin'],
        qualityScore: 0.6,
      };
    } catch (error) {
      if (this.isPlanRestriction(error)) {
        this.log.warn('People search requires a paid Apollo plan — skipping');
      } else {
        this.log.error({ error }, 'People search failed');
      }
      return {
        success: false, data: [], totalResults: 0, hasMore: false,
        error: String(error), creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async enrichPerson(params: PeopleEnrichParams): Promise<ProviderResponse<UnifiedContact>> {
    try {
      const body: Record<string, unknown> = {};
      if (params.firstName) body.first_name = params.firstName;
      if (params.lastName) body.last_name = params.lastName;
      if (params.email) body.email = params.email;
      if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;
      if (params.companyDomain) body.organization_domain = params.companyDomain;

      const raw = await this.request<ApolloPersonEnrichResponse>(
        'post', '/people/match', { body },
      );

      if (!raw.person) {
        return {
          success: false, data: null, error: 'No person found',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapApolloPerson(raw.person);
      const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

      return {
        success: true,
        data: unified,
        creditsConsumed: 1,
        fieldsPopulated,
        qualityScore: Math.min(fieldsPopulated.length / 12, 1),
      };
    } catch (error) {
      this.log.error({ error, params }, 'Person enrichment failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  private isPlanRestriction(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes('403') || msg.includes('API_INACCESSIBLE') || msg.includes('free plan');
  }
}

/** Map common ISO country codes to full names for Apollo's location filter */
const COUNTRY_CODE_MAP: Record<string, string> = {
  us: 'United States',
  gb: 'United Kingdom',
  uk: 'United Kingdom',
  ca: 'Canada',
  au: 'Australia',
  de: 'Germany',
  fr: 'France',
  nl: 'Netherlands',
  ie: 'Ireland',
  se: 'Sweden',
  es: 'Spain',
  it: 'Italy',
  in: 'India',
  sg: 'Singapore',
  jp: 'Japan',
  kr: 'South Korea',
  br: 'Brazil',
  il: 'Israel',
  uae: 'United Arab Emirates',
  cn: 'China',
  nz: 'New Zealand',
};

function expandCountryCode(code: string): string {
  return COUNTRY_CODE_MAP[code.toLowerCase()] ?? code;
}

/**
 * Apollo expects employee count as predefined range buckets, not arbitrary min/max.
 * We select all buckets that overlap with the requested range.
 */
const EMPLOYEE_RANGE_BUCKETS = [
  [1, 10], [11, 20], [21, 50], [51, 100], [101, 200],
  [201, 500], [501, 1000], [1001, 2000], [2001, 5000],
  [5001, 10000],
] as const;

function buildEmployeeRanges(min?: number, max?: number): string[] {
  const lo = min ?? 1;
  const hi = max ?? Infinity;
  const ranges: string[] = [];
  for (const [bucketMin, bucketMax] of EMPLOYEE_RANGE_BUCKETS) {
    // Include bucket if it overlaps with the requested range
    if (bucketMax >= lo && bucketMin <= hi) {
      ranges.push(`${bucketMin},${bucketMax}`);
    }
  }
  // Handle 10001+ if the requested max is above 10000 or unbounded
  if (hi > 10000) {
    ranges.push('10001,1000000');
  }
  return ranges.length > 0 ? ranges : ['1,1000000'];
}

/**
 * Apollo expects revenue as predefined range buckets.
 */
const REVENUE_RANGE_BUCKETS = [
  [0, 1_000_000],           // $0–$1M
  [1_000_000, 10_000_000],  // $1M–$10M
  [10_000_000, 50_000_000], // $10M–$50M
  [50_000_000, 100_000_000],
  [100_000_000, 500_000_000],
  [500_000_000, 1_000_000_000],
  [1_000_000_000, 10_000_000_000],
] as const;

function buildRevenueRanges(min?: number, max?: number): string[] {
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  const ranges: string[] = [];
  for (const [bucketMin, bucketMax] of REVENUE_RANGE_BUCKETS) {
    if (bucketMax >= lo && bucketMin <= hi) {
      ranges.push(`${bucketMin},${bucketMax}`);
    }
  }
  return ranges.length > 0 ? ranges : [`${lo},${max ?? 10000000000}`];
}

/**
 * Normalize freeform funding stage strings to Apollo's expected codes.
 * Apollo uses lowercase_underscore codes: seed, series_a, series_b, etc.
 */
const FUNDING_STAGE_MAP: Record<string, string> = {
  // Direct matches
  seed: 'seed', angel: 'angel', venture: 'venture',
  series_a: 'series_a', series_b: 'series_b', series_c: 'series_c',
  series_d: 'series_d', series_e: 'series_e', series_f: 'series_f',
  series_unknown: 'series_unknown',
  pre_ipo: 'pre_ipo', ipo: 'ipo',
  private_equity: 'private_equity', debt_financing: 'debt_financing',
  grant: 'grant', other: 'other',
  // Common freeform variations
  'series a': 'series_a', 'series b': 'series_b', 'series c': 'series_c',
  'series d': 'series_d', 'series e': 'series_e', 'series f': 'series_f',
  'pre-seed': 'seed', preseed: 'seed', 'pre seed': 'seed',
  'pre-ipo': 'pre_ipo', 'pre ipo': 'pre_ipo',
  'private equity': 'private_equity', pe: 'private_equity',
  'debt financing': 'debt_financing', debt: 'debt_financing',
  'early stage': 'seed', 'early-stage': 'seed',
  'growth': 'series_unknown', 'late stage': 'series_unknown',
};

function normalizeFundingStage(stage: string): string {
  return FUNDING_STAGE_MAP[stage.toLowerCase()] ?? stage.toLowerCase().replace(/\s+/g, '_');
}
