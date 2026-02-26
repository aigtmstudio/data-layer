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
import { mapValyuSearchResultToCompany, mapValyuSummaryToCompany } from './mappers.js';
import type { ValyuSearchResponse, ValyuContentsResponse, ValyuCompanySummary } from './types.js';
import { COMPANY_SUMMARY_SCHEMA } from './types.js';

export class ValyuProvider extends BaseProvider implements DataProvider {
  readonly name = 'valyu';
  readonly displayName = 'Valyu';
  readonly capabilities: ProviderCapability[] = [
    'company_search', 'company_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.valyu.ai/v1',
      rateLimit: { perSecond: 5, perMinute: 300 },
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
        max_num_results: Math.min(params.limit ?? 10, 20),
        search_type: 'web',
        response_length: 'short',
        is_tool_call: true,
      };

      const raw = await this.request<ValyuSearchResponse>('post', '/search', { body });

      if (!raw.success) {
        throw new Error(raw.error ?? 'Search failed');
      }

      const companies = raw.results.map(mapValyuSearchResultToCompany);
      return {
        success: true,
        data: companies,
        totalResults: companies.length,
        hasMore: false,
        creditsConsumed: 1,
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
      if (!params.domain) {
        return {
          success: false, data: null, error: 'Domain required for Valyu enrichment',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      // Use Contents API with structured JSON schema extraction
      const body: Record<string, unknown> = {
        urls: [`https://${params.domain}`],
        extract_effort: 'auto',
        response_length: 'medium',
        summary: COMPANY_SUMMARY_SCHEMA,
      };

      const raw = await this.request<ValyuContentsResponse>('post', '/contents', { body });

      if (!raw.success || !raw.results.length) {
        throw new Error(raw.error ?? 'No content extracted');
      }

      const result = raw.results[0];
      if (result.status === 'failed') {
        throw new Error(result.error ?? 'Content extraction failed');
      }

      // Use the structured summary if available, fall back to basic mapping
      if (result.summary && result.summary_success) {
        const summary = result.summary as ValyuCompanySummary;
        const unified = mapValyuSummaryToCompany(summary, params.domain);
        unified.websiteUrl = `https://${params.domain}`;
        const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

        return {
          success: true,
          data: unified,
          creditsConsumed: 1,
          fieldsPopulated,
          qualityScore: Math.min(fieldsPopulated.length / 15, 1),
        };
      }

      // Fallback: basic content extraction without structured summary
      const unified: UnifiedCompany = {
        name: result.title?.replace(/ [-|–—].*/,  '').trim() ?? params.domain,
        domain: params.domain,
        websiteUrl: `https://${params.domain}`,
        description: (typeof result.content === 'string' ? result.content : result.description)?.slice(0, 1000),
        externalIds: { valyu: params.domain },
      };

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
