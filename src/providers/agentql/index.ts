import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanyEnrichParams,
  UnifiedCompany,
  ProviderResponse,
} from '../types.js';
import { mapAgentQlCompany } from './mappers.js';
import type { AgentQlResponse, AgentQlCompanyExtraction } from './types.js';

// AgentQL semantic query for company data extraction
const COMPANY_QUERY = `{
  company_name
  company_description
  industry
  founded_year(integer)
  employee_count(integer)
  headquarters_city
  headquarters_state
  headquarters_country
  address
  phone
  email
  linkedin_url
  twitter_url
  logo_url
  products[]
  tech_stack[]
}`;

export class AgentQlProvider extends BaseProvider implements DataProvider {
  readonly name = 'agentql';
  readonly displayName = 'AgentQL';
  readonly capabilities: ProviderCapability[] = ['company_enrich'];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.agentql.com/v1',
      rateLimit: { perSecond: 5, perMinute: 50 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    if (!params.domain) {
      return {
        success: false, data: null, error: 'Domain required for AgentQL enrichment',
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }

    try {
      const response = await this.request<AgentQlResponse>('post', '/query-data', {
        body: {
          url: `https://${params.domain}`,
          query: COMPANY_QUERY,
          params: {
            mode: 'standard',
            is_screenshot_enabled: false,
          },
        },
        timeout: 60_000,
      });

      const extraction = response.data as unknown as AgentQlCompanyExtraction;
      const unified = mapAgentQlCompany(extraction, params.domain);
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
