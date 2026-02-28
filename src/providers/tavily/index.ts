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
import { mapTavilyResultToCompany } from './mappers.js';
import type { TavilySearchResponse, TavilyExtractResponse } from './types.js';

export class TavilyProvider extends BaseProvider implements DataProvider {
  readonly name = 'tavily';
  readonly displayName = 'Tavily';
  readonly capabilities: ProviderCapability[] = [
    'company_search', 'company_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.tavily.com',
      rateLimit: { perSecond: 15, perMinute: 900 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async searchCompanies(params: CompanySearchParams): Promise<PaginatedResponse<UnifiedCompany>> {
    try {
      const query = buildSearchQuery(params);

      const body: Record<string, unknown> = {
        query,
        max_results: Math.min(params.limit ?? 10, 20),
        search_depth: 'basic',
        topic: 'general',
        include_raw_content: false,
      };

      const raw = await this.request<TavilySearchResponse>('post', '/search', { body });

      const companies = raw.results.map(mapTavilyResultToCompany);
      return {
        success: true,
        data: companies,
        totalResults: companies.length,
        hasMore: false,
        creditsConsumed: raw.usage?.credits ?? 1,
        fieldsPopulated: ['name', 'domain', 'description'],
        qualityScore: 0.35,
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
      // Phase 1: search for company info
      const query = params.domain
        ? `${params.domain} company overview industry employees headquarters`
        : `${params.name} company overview industry employees headquarters`;

      const searchBody: Record<string, unknown> = {
        query,
        max_results: 5,
        search_depth: 'advanced',
        include_raw_content: 'markdown',
      };

      if (params.domain) {
        searchBody.include_domains = [
          params.domain,
          'crunchbase.com',
          'wikipedia.org',
        ];
      }

      const searchRaw = await this.request<TavilySearchResponse>('post', '/search', { body: searchBody });
      let totalCredits = searchRaw.usage?.credits ?? 1;

      if (!searchRaw.results.length) {
        return {
          success: false, data: null, error: 'No results found',
          creditsConsumed: totalCredits, fieldsPopulated: [], qualityScore: 0,
        };
      }

      // Phase 2: extract from company website if domain known
      let extractDescription = '';
      if (params.domain) {
        try {
          const extractBody: Record<string, unknown> = {
            urls: [`https://${params.domain}`],
            extract_depth: 'basic',
            format: 'markdown',
          };

          const extractRaw = await this.request<TavilyExtractResponse>('post', '/extract', { body: extractBody });
          totalCredits += extractRaw.usage?.credits ?? 1;
          if (extractRaw.results.length) {
            extractDescription = extractRaw.results[0].raw_content?.slice(0, 2000) ?? '';
          }
        } catch {
          // Extract is supplementary — don't fail the whole enrichment
        }
      }

      const topResult = searchRaw.results[0];
      const unified = mapTavilyResultToCompany(topResult);

      // Merge in richer description from extract if available
      if (extractDescription) {
        unified.description = extractDescription.slice(0, 1000);
      } else if (topResult.raw_content) {
        unified.description = topResult.raw_content.slice(0, 1000);
      }

      // Override domain with the requested one if we searched by domain
      if (params.domain) {
        unified.domain = params.domain;
        unified.websiteUrl = `https://${params.domain}`;
      }

      const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

      return {
        success: true,
        data: unified,
        creditsConsumed: totalCredits,
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

  /**
   * Search for news articles. Separate from searchCompanies() to avoid
   * breaking the DataProvider interface.
   */
  async searchNews(params: {
    query: string;
    maxResults?: number;
  }): Promise<TavilySearchResponse> {
    const body: Record<string, unknown> = {
      query: params.query,
      max_results: params.maxResults ?? 5,
      search_depth: 'basic',
      topic: 'news',
      include_raw_content: false,
    };
    return this.request<TavilySearchResponse>('post', '/search', { body });
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
