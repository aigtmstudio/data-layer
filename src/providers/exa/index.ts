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
import { mapExaResultToCompany } from './mappers.js';
import type { ExaSearchResponse } from './types.js';

export class ExaProvider extends BaseProvider implements DataProvider {
  readonly name = 'exa';
  readonly displayName = 'Exa.ai';
  readonly capabilities: ProviderCapability[] = [
    'company_search', 'company_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.exa.ai',
      rateLimit: { perSecond: 10, perMinute: 600 },
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
      const query = buildSearchQuery(params);

      const body: Record<string, unknown> = {
        query,
        numResults: Math.min(params.limit ?? 25, 100),
        type: 'auto',
        category: 'company',
        contents: {
          text: { maxCharacters: 1000 },
        },
      };

      const raw = await this.request<ExaSearchResponse>('post', '/search', { body });

      const companies = raw.results.map(mapExaResultToCompany);
      return {
        success: true,
        data: companies,
        totalResults: companies.length,
        hasMore: false,
        creditsConsumed: 1,
        fieldsPopulated: ['name', 'domain', 'description'],
        qualityScore: 0.4,
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
      const query = params.domain
        ? `Company website: ${params.domain}`
        : `Company: ${params.name}`;

      const body: Record<string, unknown> = {
        query,
        numResults: 1,
        type: 'auto',
        category: 'company',
        contents: {
          text: { maxCharacters: 2000 },
          highlights: { numSentences: 3, highlightsPerUrl: 3 },
        },
      };

      if (params.domain) {
        body.includeDomains = [params.domain];
      }

      const raw = await this.request<ExaSearchResponse>('post', '/search', { body });

      if (!raw.results.length) {
        return {
          success: false, data: null, error: 'No results found',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapExaResultToCompany(raw.results[0]);
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

function buildSearchQuery(params: CompanySearchParams): string {
  // Prefer the pre-built semantic query when available
  if (params.query) return params.query;

  const parts: string[] = [];

  if (params.keywords?.length) {
    parts.push(params.keywords.join(' '));
  }
  if (params.industries?.length) {
    parts.push(`in ${params.industries.join(', ')} industry`);
  }
  if (params.employeeCountMin || params.employeeCountMax) {
    const min = params.employeeCountMin ?? 1;
    const max = params.employeeCountMax ?? 100000;
    parts.push(`with ${min}-${max} employees`);
  }
  if (params.countries?.length) {
    parts.push(`based in ${params.countries.join(', ')}`);
  }

  return parts.length > 0
    ? `Companies ${parts.join(' ')}`
    : 'Companies';
}
