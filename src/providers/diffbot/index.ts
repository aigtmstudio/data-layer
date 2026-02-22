import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanySearchParams,
  CompanyEnrichParams,
  PeopleSearchParams,
  PeopleEnrichParams,
  EmailFindParams,
  UnifiedCompany,
  UnifiedContact,
  ProviderResponse,
  PaginatedResponse,
} from '../types.js';
import { mapDiffbotCompany, mapDiffbotPerson } from './mappers.js';
import type { DiffbotEnhanceResponse, DiffbotDqlResponse } from './types.js';

export class DiffbotProvider extends BaseProvider implements DataProvider {
  readonly name = 'diffbot';
  readonly displayName = 'Diffbot';
  readonly capabilities: ProviderCapability[] = [
    'company_search', 'company_enrich',
    'people_search', 'people_enrich',
    'email_find',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://kg.diffbot.com/kg/v3',
      rateLimit: { perSecond: 5, perMinute: 300 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  // Diffbot uses query-param auth (?token=), not headers
  protected getAuthHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private authParams(extra?: Record<string, string>): Record<string, string> {
    return { token: this.apiKey, ...extra };
  }

  async searchCompanies(params: CompanySearchParams): Promise<PaginatedResponse<UnifiedCompany>> {
    try {
      const dql = this.buildCompanyDql(params);
      const size = Math.min(params.limit ?? 25, 50);

      const response = await this.request<DiffbotDqlResponse>('get', '/dql', {
        params: this.authParams({
          type: 'query',
          query: dql,
          size: String(size),
          from: String(params.offset ?? 0),
        }),
      });

      const companies = response.data.map(entity => {
        const unified = mapDiffbotCompany(entity);
        return unified;
      });

      return {
        success: true,
        data: companies,
        totalResults: response.hits,
        hasMore: (params.offset ?? 0) + companies.length < response.hits,
        nextPageToken: companies.length === size ? (params.offset ?? 0) + size : undefined,
        creditsConsumed: companies.length * 0.5,
        fieldsPopulated: [],
        qualityScore: 0.8,
      };
    } catch (error) {
      this.log.error({ error, params }, 'Company search failed');
      return {
        success: false, data: [], totalResults: 0, hasMore: false,
        error: String(error), creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    try {
      const enhanceParams: Record<string, string> = {};
      if (params.domain) enhanceParams.url = params.domain;
      if (params.name) enhanceParams.name = params.name;
      enhanceParams.type = 'Organization';

      const response = await this.request<DiffbotEnhanceResponse>('get', '/enhance', {
        params: this.authParams(enhanceParams),
      });

      if (!response.data?.length) {
        return {
          success: false, data: null, error: 'No results from Diffbot Enhance',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const best = response.data[0];
      const unified = mapDiffbotCompany(best.entity);

      if (params.domain) {
        unified.domain = params.domain;
      }

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
      const dql = this.buildPeopleDql(params);
      const size = Math.min(params.limit ?? 25, 50);

      const response = await this.request<DiffbotDqlResponse>('get', '/dql', {
        params: this.authParams({
          type: 'query',
          query: dql,
          size: String(size),
          from: String(params.offset ?? 0),
        }),
      });

      const people = response.data.map(entity => mapDiffbotPerson(entity));

      return {
        success: true,
        data: people,
        totalResults: response.hits,
        hasMore: (params.offset ?? 0) + people.length < response.hits,
        nextPageToken: people.length === size ? (params.offset ?? 0) + size : undefined,
        creditsConsumed: people.length * 0.5,
        fieldsPopulated: [],
        qualityScore: 0.8,
      };
    } catch (error) {
      this.log.error({ error, params }, 'People search failed');
      return {
        success: false, data: [], totalResults: 0, hasMore: false,
        error: String(error), creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async enrichPerson(params: PeopleEnrichParams): Promise<ProviderResponse<UnifiedContact>> {
    try {
      const enhanceParams: Record<string, string> = {};
      if (params.linkedinUrl) enhanceParams.url = params.linkedinUrl;
      if (params.firstName && params.lastName) enhanceParams.name = `${params.firstName} ${params.lastName}`;
      if (params.email) enhanceParams.email = params.email;
      enhanceParams.type = 'Person';

      const response = await this.request<DiffbotEnhanceResponse>('get', '/enhance', {
        params: this.authParams(enhanceParams),
      });

      if (!response.data?.length) {
        return {
          success: false, data: null, error: 'No results from Diffbot Enhance',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const best = response.data[0];
      const unified = mapDiffbotPerson(best.entity);
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

  async findEmail(params: EmailFindParams): Promise<ProviderResponse<{ email: string; confidence: number }>> {
    try {
      // Use Enhance to find the person, then extract email
      const response = await this.request<DiffbotEnhanceResponse>('get', '/enhance', {
        params: this.authParams({
          type: 'Person',
          name: `${params.firstName} ${params.lastName}`,
          url: params.companyDomain,
        }),
      });

      if (!response.data?.length) {
        return {
          success: false, data: null, error: 'Person not found',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const entity = response.data[0].entity;
      const email = entity.emailAddresses?.[0]?.address;

      if (!email) {
        return {
          success: false, data: null, error: 'No email found for person',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      return {
        success: true,
        data: { email, confidence: response.data[0].score },
        creditsConsumed: 1,
        fieldsPopulated: ['email'],
        qualityScore: response.data[0].score,
      };
    } catch (error) {
      this.log.error({ error, params }, 'Email find failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  private buildCompanyDql(params: CompanySearchParams): string {
    const parts: string[] = ['type:Organization'];

    if (params.industries?.length) {
      parts.push(`industries:"${params.industries.join('" OR industries:"')}"`);
    }
    if (params.employeeCountMin != null) {
      parts.push(`nbEmployees>=${params.employeeCountMin}`);
    }
    if (params.employeeCountMax != null) {
      parts.push(`nbEmployees<=${params.employeeCountMax}`);
    }
    if (params.countries?.length) {
      parts.push(`location.country.name:"${params.countries.join('" OR location.country.name:"')}"`);
    }
    if (params.keywords?.length) {
      parts.push(params.keywords.map(k => `"${k}"`).join(' OR '));
    }

    return parts.join(' ');
  }

  private buildPeopleDql(params: PeopleSearchParams): string {
    const parts: string[] = ['type:Person'];

    if (params.titlePatterns?.length) {
      parts.push(`employments.title:"${params.titlePatterns.join('" OR employments.title:"')}"`);
    }
    if (params.companyNames?.length) {
      parts.push(`employments.employer.name:"${params.companyNames.join('" OR employments.employer.name:"')}"`);
    }
    if (params.companyDomains?.length) {
      parts.push(`employments.employer.homepageUri:"${params.companyDomains.join('" OR employments.employer.homepageUri:"')}"`);
    }
    if (params.countries?.length) {
      parts.push(`location.country.name:"${params.countries.join('" OR location.country.name:"')}"`);
    }

    return parts.join(' ');
  }
}
