import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanyEnrichParams,
  PeopleEnrichParams,
  EmailFindParams,
  UnifiedCompany,
  UnifiedContact,
  ProviderResponse,
} from '../types.js';
import { mapLeadMagicCompany, mapLeadMagicPerson } from './mappers.js';
import type {
  LeadMagicCompanyResponse,
  LeadMagicPersonResponse,
  LeadMagicEmailFindResponse,
} from './types.js';

export class LeadMagicProvider extends BaseProvider implements DataProvider {
  readonly name = 'leadmagic';
  readonly displayName = 'LeadMagic';
  readonly capabilities: ProviderCapability[] = [
    'company_enrich', 'people_enrich', 'email_find',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.leadmagic.io',
      rateLimit: { perMinute: 60 },
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
    try {
      const body: Record<string, string> = {};
      if (params.domain) body.domain = params.domain;
      if (params.name) body.company_name = params.name;

      const raw = await this.request<LeadMagicCompanyResponse>(
        'post', '/company/enrich', { body },
      );

      if (!raw.success || !raw.data) {
        return {
          success: false, data: null, error: raw.error ?? 'No data returned',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapLeadMagicCompany(raw.data);
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

  async enrichPerson(params: PeopleEnrichParams): Promise<ProviderResponse<UnifiedContact>> {
    try {
      const body: Record<string, unknown> = {};
      if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;
      if (params.email) body.email = params.email;
      if (params.firstName) body.first_name = params.firstName;
      if (params.lastName) body.last_name = params.lastName;
      if (params.companyDomain) body.company_domain = params.companyDomain;

      const raw = await this.request<LeadMagicPersonResponse>(
        'post', '/people/enrich', { body },
      );

      if (!raw.success || !raw.data) {
        return {
          success: false, data: null, error: raw.error ?? 'No data returned',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapLeadMagicPerson(raw.data);
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
      const raw = await this.request<LeadMagicEmailFindResponse>(
        'post', '/email/find', {
          body: {
            first_name: params.firstName,
            last_name: params.lastName,
            domain: params.companyDomain,
          },
        },
      );

      if (!raw.success || !raw.data) {
        return {
          success: false, data: null, error: raw.error ?? 'Email not found',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      return {
        success: true,
        data: { email: raw.data.email, confidence: raw.data.confidence },
        creditsConsumed: 1,
        fieldsPopulated: ['email'],
        qualityScore: raw.data.confidence / 100,
      };
    } catch (error) {
      this.log.error({ error, params }, 'Email find failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }
}
