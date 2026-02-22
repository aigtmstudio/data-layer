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
import { mapParallelCompany, mapParallelPerson } from './mappers.js';
import type {
  ParallelTaskRun,
  ParallelTaskResult,
  ParallelCompanyOutput,
  ParallelPersonOutput,
} from './types.js';
import { COMPANY_OUTPUT_SCHEMA, PERSON_OUTPUT_SCHEMA } from './types.js';

const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT = 60_000;

export class ParallelProvider extends BaseProvider implements DataProvider {
  readonly name = 'parallel';
  readonly displayName = 'Parallel.ai';
  readonly capabilities: ProviderCapability[] = [
    'company_enrich', 'people_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.parallel.ai',
      rateLimit: { perSecond: 30, perMinute: 2000 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    try {
      const input = params.domain
        ? `Research the company with domain ${params.domain}. Find all available business information.`
        : `Research the company named "${params.name}". Find all available business information.`;

      const result = await this.runTask<ParallelCompanyOutput>(input, COMPANY_OUTPUT_SCHEMA);
      const unified = mapParallelCompany(result);

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
      const parts: string[] = [];
      if (params.linkedinUrl) parts.push(`LinkedIn profile: ${params.linkedinUrl}`);
      if (params.firstName && params.lastName) parts.push(`Name: ${params.firstName} ${params.lastName}`);
      if (params.companyDomain) parts.push(`Company: ${params.companyDomain}`);
      if (params.email) parts.push(`Email: ${params.email}`);

      if (!parts.length) {
        return {
          success: false, data: null, error: 'At least one identifier required',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const input = `Research this person and find their professional information. ${parts.join('. ')}.`;

      const result = await this.runTask<ParallelPersonOutput>(input, PERSON_OUTPUT_SCHEMA);
      const unified = mapParallelPerson(result);
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

  private async runTask<T>(input: string, outputSchema: unknown): Promise<T> {
    // Step 1: Create task run
    const createResponse = await this.request<ParallelTaskRun>(
      'post',
      '/v1/tasks/runs',
      {
        body: {
          processor: 'pro',
          input,
          task_spec: { output_schema: outputSchema },
        },
        timeout: REQUEST_TIMEOUT,
      },
    );

    const runId = createResponse.run_id;

    // Step 2: Poll until complete
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = createResponse.status;

    while (status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
      if (Date.now() > deadline) throw new Error('Task run timed out');
      await sleep(POLL_INTERVAL_MS);

      const pollResponse = await this.request<ParallelTaskRun>(
        'get',
        `/v1/tasks/runs/${runId}`,
        { timeout: REQUEST_TIMEOUT },
      );
      status = pollResponse.status;

      if (status === 'failed') {
        throw new Error(`Task failed: ${pollResponse.error?.message ?? 'unknown error'}`);
      }
    }

    // Step 3: Get result
    const result = await this.request<ParallelTaskResult<T>>(
      'get',
      `/v1/tasks/runs/${runId}/result`,
      { timeout: REQUEST_TIMEOUT },
    );

    return result.output.content;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
