import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanyEnrichParams,
  PeopleEnrichParams,
  UnifiedCompany,
  UnifiedContact,
  ProviderResponse,
} from '../types.js';
import { mapLinkedInCompany, mapLinkedInProfile } from './mappers.js';
import { ACTORS } from './actors.js';
import type {
  ApifyRunResponse,
  ApifyDatasetResponse,
  ApifyRun,
  LinkedInCompanyResult,
  LinkedInProfileResult,
} from './types.js';

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const WAIT_FOR_FINISH = '60';
const REQUEST_TIMEOUT = 90_000;

export class ApifyProvider extends BaseProvider implements DataProvider {
  readonly name = 'apify';
  readonly displayName = 'Apify';
  readonly capabilities: ProviderCapability[] = [
    'company_enrich', 'people_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.apify.com/v2',
      rateLimit: { perSecond: 10, perMinute: 300 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    try {
      // Build LinkedIn company URL from domain
      const companyUrl = params.domain
        ? `https://www.linkedin.com/company/${params.domain.replace(/\.[^.]+$/, '')}/`
        : undefined;

      if (!companyUrl && !params.name) {
        return {
          success: false, data: null, error: 'Domain or name required',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const input = {
        companyUrls: companyUrl ? [companyUrl] : [],
        ...(params.name && !companyUrl ? { searchQueries: [params.name] } : {}),
      };

      const items = await this.runActor<LinkedInCompanyResult>(
        ACTORS.LINKEDIN_COMPANY_SCRAPER,
        input,
      );

      if (!items.length) {
        return {
          success: false, data: null, error: 'No company data found',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapLinkedInCompany(items[0]);

      // Override domain with the requested one if available
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

  async enrichPerson(params: PeopleEnrichParams): Promise<ProviderResponse<UnifiedContact>> {
    try {
      if (!params.linkedinUrl) {
        return {
          success: false, data: null, error: 'LinkedIn URL required for Apify enrichment',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const input = {
        profileUrls: [params.linkedinUrl],
      };

      const items = await this.runActor<LinkedInProfileResult>(
        ACTORS.LINKEDIN_PROFILE_SCRAPER,
        input,
      );

      if (!items.length) {
        return {
          success: false, data: null, error: 'No profile data found',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapLinkedInProfile(items[0]);
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

  private async runActor<T>(actorSlug: string, input: unknown): Promise<T[]> {
    // Step 1: Start run with waitForFinish
    const runResponse = await this.request<ApifyRunResponse>(
      'post',
      `/acts/${actorSlug}/runs`,
      {
        body: input,
        params: { waitForFinish: WAIT_FOR_FINISH },
        timeout: REQUEST_TIMEOUT,
      },
    );

    let run = runResponse.data;

    // Step 2: Poll until terminal status
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (run.status === 'RUNNING' || run.status === 'READY') {
      if (Date.now() > deadline) throw new Error('Actor run timed out');
      await sleep(5000);

      const pollResponse = await this.request<ApifyRunResponse>(
        'get',
        `/acts/${actorSlug}/runs/${run.id}`,
        {
          params: { waitForFinish: WAIT_FOR_FINISH },
          timeout: REQUEST_TIMEOUT,
        },
      );
      run = pollResponse.data;
    }

    if (run.status !== 'SUCCEEDED') {
      throw new Error(`Actor run ${run.status}: ${run.statusMessage ?? 'unknown error'}`);
    }

    // Step 3: Fetch dataset items
    const dataset = await this.request<ApifyDatasetResponse<T>>(
      'get',
      `/datasets/${run.defaultDatasetId}/items`,
      { params: { format: 'json', limit: '100' } },
    );

    return dataset.data.items;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
