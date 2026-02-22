import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanySearchParams,
  CompanyEnrichParams,
  UnifiedCompany,
  ProviderResponse,
  PaginatedResponse,
} from '../types.js';
import { mapFirecrawlExtractToCompany, mapFirecrawlSearchToCompany } from './mappers.js';
import type { FirecrawlExtractResponse, FirecrawlSearchResponse } from './types.js';
import { COMPANY_EXTRACT_SCHEMA } from './types.js';

export class FirecrawlProvider extends BaseProvider implements DataProvider {
  readonly name = 'firecrawl';
  readonly displayName = 'Firecrawl';
  readonly capabilities: ProviderCapability[] = ['company_search', 'company_enrich'];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.firecrawl.dev/v2',
      rateLimit: { perSecond: 5, perMinute: 100 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async searchCompanies(params: CompanySearchParams): Promise<PaginatedResponse<UnifiedCompany>> {
    try {
      const queryParts: string[] = [];
      if (params.keywords?.length) queryParts.push(params.keywords.join(' '));
      if (params.industries?.length) queryParts.push(params.industries.join(' '));
      if (params.countries?.length) queryParts.push(`companies in ${params.countries.join(', ')}`);
      if (params.employeeCountMin || params.employeeCountMax) {
        const range = [params.employeeCountMin ?? '', params.employeeCountMax ?? ''].filter(Boolean).join('-');
        queryParts.push(`${range} employees`);
      }

      const query = queryParts.join(' ') || 'companies';
      const limit = Math.min(params.limit ?? 10, 20);

      const response = await this.request<FirecrawlSearchResponse>('post', '/search', {
        body: { query, limit },
        timeout: 60_000,
      });

      if (!response.success || !response.data?.length) {
        return {
          success: true, data: [], totalResults: 0, hasMore: false,
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const companies = response.data.map(r => mapFirecrawlSearchToCompany(r));

      return {
        success: true,
        data: companies,
        totalResults: companies.length,
        hasMore: false,
        creditsConsumed: 1,
        fieldsPopulated: [],
        qualityScore: 0.5,
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
    if (!params.domain) {
      return {
        success: false, data: null, error: 'Domain required for Firecrawl enrichment',
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }

    try {
      const response = await this.request<FirecrawlExtractResponse>('post', '/extract', {
        body: {
          urls: [`https://${params.domain}/*`],
          prompt: 'Extract all available company information from this website.',
          schema: COMPANY_EXTRACT_SCHEMA,
        },
        timeout: 60_000,
      });

      if (!response.success || !response.data?.length) {
        return {
          success: false, data: null, error: 'No data extracted by Firecrawl',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapFirecrawlExtractToCompany(response.data[0], params.domain);
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
}
