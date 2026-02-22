import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  PeopleSearchParams,
  PeopleEnrichParams,
  EmailFindParams,
  EmailVerifyParams,
  UnifiedContact,
  EmailVerificationResult,
  ProviderResponse,
  PaginatedResponse,
} from '../types.js';
import { mapProspeoPersonEnrich, mapProspeoSearchResult } from './mappers.js';
import type {
  ProspeoEmailFinderResponse,
  ProspeoEmailVerifierResponse,
  ProspeoPersonEnrichResponse,
  ProspeoSearchResponse,
} from './types.js';

export class ProspeoProvider extends BaseProvider implements DataProvider {
  readonly name = 'prospeo';
  readonly displayName = 'Prospeo';
  readonly capabilities: ProviderCapability[] = [
    'email_find', 'email_verify', 'people_enrich', 'people_search',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.prospeo.io',
      rateLimit: { perMinute: 60 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async findEmail(params: EmailFindParams): Promise<ProviderResponse<{ email: string; confidence: number }>> {
    try {
      const raw = await this.request<ProspeoEmailFinderResponse>(
        'post', '/email-finder', {
          body: {
            first_name: params.firstName,
            last_name: params.lastName,
            company: params.companyDomain,
          },
        },
      );

      if (raw.error || !raw.response?.email) {
        return {
          success: false, data: null, error: raw.message ?? 'Email not found',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      return {
        success: true,
        data: { email: raw.response.email, confidence: raw.response.confidence },
        creditsConsumed: 1,
        fieldsPopulated: ['email'],
        qualityScore: raw.response.confidence / 100,
      };
    } catch (error) {
      this.log.error({ error, params }, 'Email find failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async verifyEmail(params: EmailVerifyParams): Promise<ProviderResponse<EmailVerificationResult>> {
    try {
      const raw = await this.request<ProspeoEmailVerifierResponse>(
        'post', '/email-verifier', {
          body: { email: params.email },
        },
      );

      if (raw.error) {
        return {
          success: false, data: null, error: raw.message ?? 'Verification failed',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      return {
        success: true,
        data: {
          email: raw.response.email,
          status: raw.response.result,
          provider: 'prospeo',
          confidence: raw.response.score,
          verifiedAt: new Date().toISOString(),
        },
        creditsConsumed: 0.05,
        fieldsPopulated: ['emailVerificationStatus'],
        qualityScore: raw.response.result === 'valid' ? 1 : 0.5,
      };
    } catch (error) {
      this.log.error({ error, params }, 'Email verification failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async enrichPerson(params: PeopleEnrichParams): Promise<ProviderResponse<UnifiedContact>> {
    try {
      const body: Record<string, unknown> = {};
      if (params.email) body.email = params.email;
      if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;
      if (params.firstName) body.first_name = params.firstName;
      if (params.lastName) body.last_name = params.lastName;

      const raw = await this.request<ProspeoPersonEnrichResponse>(
        'post', '/person-search', { body },
      );

      if (raw.error || !raw.response) {
        return {
          success: false, data: null, error: raw.message ?? 'No data found',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapProspeoPersonEnrich(raw.response);
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

  async searchPeople(params: PeopleSearchParams): Promise<PaginatedResponse<UnifiedContact>> {
    try {
      const body: Record<string, unknown> = {
        limit: Math.min(params.limit ?? 25, 100),
        page: params.offset ? Math.floor(params.offset / 100) + 1 : 1,
      };

      if (params.titlePatterns?.length) body.titles = params.titlePatterns;
      if (params.companyDomains?.length) body.domains = params.companyDomains;
      if (params.countries?.length) body.locations = params.countries;

      const raw = await this.request<ProspeoSearchResponse>(
        'post', '/people-search', { body },
      );

      if (raw.error) {
        return {
          success: false, data: [], totalResults: 0, hasMore: false,
          error: raw.message ?? 'Search failed',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const contacts = raw.response.map(mapProspeoSearchResult);
      const total = raw.pagination?.total ?? contacts.length;

      return {
        success: true,
        data: contacts,
        totalResults: total,
        hasMore: (raw.pagination?.page ?? 1) * (raw.pagination?.per_page ?? 25) < total,
        creditsConsumed: contacts.length * 0.1,
        fieldsPopulated: ['name', 'title', 'email', 'company'],
        qualityScore: 0.7,
      };
    } catch (error) {
      this.log.error({ error }, 'People search failed');
      return {
        success: false, data: [], totalResults: 0, hasMore: false,
        error: String(error), creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }
}
