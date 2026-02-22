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
      if (params.employeeCountMin || params.employeeCountMax) {
        body.organization_num_employees_ranges = [
          `${params.employeeCountMin ?? 1},${params.employeeCountMax ?? 1000000}`,
        ];
      }
      if (params.countries?.length) body.organization_locations = params.countries;
      if (params.keywords?.length) body.q_organization_keyword_tags = params.keywords;

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
      this.log.error({ error }, 'Company search failed');
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
      this.log.error({ error }, 'People search failed');
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
}
