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
import { mapScrapeGraphCompany, mapScrapeGraphSearchToCompany } from './mappers.js';
import type {
  ScrapeGraphSmartScraperResponse,
  ScrapeGraphSearchResponse,
  ScrapeGraphCompanyExtraction,
} from './types.js';

const ENRICH_PROMPT = `Extract all company information from this website. Return JSON with these fields:
company_name, description, industry, founded_year (number), employee_count (number),
employee_range, annual_revenue, headquarters_city, headquarters_state, headquarters_country,
address, phone, email, linkedin_url, twitter_url, logo_url, tech_stack (array of strings),
total_funding, latest_funding_stage. Use null for unknown fields.`;

export class ScrapeGraphProvider extends BaseProvider implements DataProvider {
  readonly name = 'scrapegraph';
  readonly displayName = 'ScrapeGraphAI';
  readonly capabilities: ProviderCapability[] = ['company_search', 'company_enrich'];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.scrapegraphai.com/v1',
      rateLimit: { perSecond: 5, perMinute: 60 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'SGAI-APIKEY': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async searchCompanies(params: CompanySearchParams): Promise<PaginatedResponse<UnifiedCompany>> {
    try {
      const queryParts: string[] = [];
      if (params.keywords?.length) queryParts.push(params.keywords.join(' '));
      if (params.industries?.length) queryParts.push(`in ${params.industries.join(', ')} industry`);
      if (params.countries?.length) queryParts.push(`based in ${params.countries.join(', ')}`);
      if (params.employeeCountMin || params.employeeCountMax) {
        const min = params.employeeCountMin ?? 1;
        const max = params.employeeCountMax ?? '10000+';
        queryParts.push(`with ${min}-${max} employees`);
      }

      const limit = Math.min(params.limit ?? 10, 20);
      const prompt = `Find ${limit} companies ${queryParts.join(' ')}. For each company return: company_name, description, industry, website_url.`;

      const response = await this.request<ScrapeGraphSearchResponse>('post', '/searchscraper', {
        body: { user_prompt: prompt },
        timeout: 60_000,
      });

      const urls = response.reference_urls ?? [];
      const resultData = response.result;

      // The result may contain an array of companies or a single object
      const companies: UnifiedCompany[] = [];
      if (Array.isArray(resultData)) {
        for (let i = 0; i < resultData.length; i++) {
          companies.push(mapScrapeGraphSearchToCompany(
            resultData[i] as Record<string, unknown>,
            urls[i],
          ));
        }
      } else if (resultData && typeof resultData === 'object') {
        companies.push(mapScrapeGraphSearchToCompany(resultData, urls[0]));
      }

      return {
        success: true,
        data: companies,
        totalResults: companies.length,
        hasMore: false,
        creditsConsumed: 3,
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
        success: false, data: null, error: 'Domain required for ScrapeGraphAI enrichment',
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }

    try {
      const response = await this.request<ScrapeGraphSmartScraperResponse>('post', '/smartscraper', {
        body: {
          website_url: `https://${params.domain}`,
          user_prompt: ENRICH_PROMPT,
        },
        timeout: 60_000,
      });

      const extraction = response.result as unknown as ScrapeGraphCompanyExtraction;
      const unified = mapScrapeGraphCompany(extraction, params.domain);
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
