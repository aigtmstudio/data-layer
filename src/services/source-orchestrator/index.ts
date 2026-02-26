import type {
  DataProvider,
  ProviderCapability,
  CompanySearchParams,
  UnifiedCompany,
  UnifiedContact,
  EmailVerificationResult,
  PeopleSearchParams,
  EmailFindParams,
  EmailVerifyParams,
} from '../../providers/types.js';
import type { CreditManager } from '../credit-manager/index.js';
import type { ProviderPerformanceTracker } from '../intelligence/provider-performance-tracker.js';
import { logger } from '../../lib/logger.js';

export interface WaterfallConfig {
  qualityThreshold: number;
  maxProviders: number;
  requiredFields?: string[];
  /** Override provider order instead of using static priority */
  providerOverride?: string[];
}

export interface WaterfallResult<T> {
  result: T | null;
  providersUsed: string[];
  totalCost: number;
  skippedDueToCredits?: number;
}

const DEFAULT_CONFIG: WaterfallConfig = {
  qualityThreshold: 0.7,
  maxProviders: 3,
};

export class SourceOrchestrator {
  private providers: Map<string, { provider: DataProvider; priority: number }> = new Map();
  private performanceTracker?: ProviderPerformanceTracker;

  constructor(private creditManager: CreditManager) {}

  setPerformanceTracker(tracker: ProviderPerformanceTracker): void {
    this.performanceTracker = tracker;
  }

  registerProvider(provider: DataProvider, priority: number): void {
    this.providers.set(provider.name, { provider, priority });
    logger.info({ provider: provider.name, priority, capabilities: provider.capabilities }, 'Provider registered');
  }

  private getProvidersWithCapability(capability: ProviderCapability, providerOverride?: string[]): DataProvider[] {
    if (providerOverride?.length) {
      // Use override order, filtering to providers that have the capability
      return providerOverride
        .map(name => this.providers.get(name))
        .filter((entry): entry is { provider: DataProvider; priority: number } =>
          entry != null && entry.provider.capabilities.includes(capability))
        .map(({ provider }) => provider);
    }
    return Array.from(this.providers.values())
      .filter(({ provider }) => provider.capabilities.includes(capability))
      .sort((a, b) => a.priority - b.priority)
      .map(({ provider }) => provider);
  }

  /** Get all registered provider names */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async enrichCompany(
    clientId: string,
    params: { domain?: string; name?: string },
    config?: Partial<WaterfallConfig>,
  ): Promise<WaterfallResult<UnifiedCompany>> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    let merged: UnifiedCompany | null = null;
    const providersUsed: string[] = [];
    let totalCost = 0;

    for (const provider of this.getProvidersWithCapability('company_enrich', cfg.providerOverride)) {
      if (providersUsed.length >= cfg.maxProviders) break;
      if (!provider.enrichCompany) continue;

      const hasCredits = await this.creditManager.hasBalance(clientId, 1);
      if (!hasCredits) {
        logger.warn({ clientId, provider: provider.name }, 'Insufficient credits, skipping');
        continue;
      }

      const startTime = Date.now();
      const response = await provider.enrichCompany(params);
      const responseTimeMs = Date.now() - startTime;

      if (response.success && response.data) {
        await this.creditManager.charge(clientId, {
          baseCost: response.creditsConsumed,
          source: provider.name,
          operation: 'company_enrich',
          description: `Company enrichment: ${params.domain ?? params.name}`,
        });
        totalCost += response.creditsConsumed;
        providersUsed.push(provider.name);

        // Track performance (fire-and-forget)
        this.performanceTracker?.recordPerformance({
          providerName: provider.name,
          clientId,
          operation: 'company_enrich',
          qualityScore: response.qualityScore,
          responseTimeMs,
          fieldsPopulated: response.fieldsPopulated.length,
          costCredits: response.creditsConsumed,
        });

        merged = merged ? mergeCompanyData(merged, response.data) : response.data;

        if (response.qualityScore >= cfg.qualityThreshold && hasRequiredFields(merged as unknown as Record<string, unknown>, cfg.requiredFields)) {
          break;
        }
      }
    }

    return { result: merged, providersUsed, totalCost };
  }

  async searchCompanies(
    clientId: string,
    params: CompanySearchParams,
    config?: Partial<WaterfallConfig>,
  ): Promise<WaterfallResult<UnifiedCompany[]>> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const allResults: UnifiedCompany[] = [];
    const providersUsed: string[] = [];
    let totalCost = 0;
    let skippedDueToCredits = 0;
    const seenDomains = new Set<string>();

    const searchProviders = this.getProvidersWithCapability('company_search', cfg.providerOverride);
    logger.info(
      { capability: 'company_search', providers: searchProviders.map(p => p.name), clientId },
      'Providers available for company search',
    );

    for (const provider of searchProviders) {
      if (providersUsed.length >= cfg.maxProviders) break;
      if (!provider.searchCompanies) continue;

      const hasCredits = await this.creditManager.hasBalance(clientId, 1);
      if (!hasCredits) {
        logger.warn({ clientId, provider: provider.name }, 'Insufficient credits, skipping provider');
        skippedDueToCredits++;
        continue;
      }

      const startTime = Date.now();
      logger.info({ provider: provider.name, params }, 'Calling provider searchCompanies');
      const response = await provider.searchCompanies(params);
      const responseTimeMs = Date.now() - startTime;

      logger.info(
        { provider: provider.name, success: response.success, resultCount: response.data?.length ?? 0, responseTimeMs },
        'Provider searchCompanies response',
      );

      if (response.success && response.data && response.data.length > 0) {
        if (response.creditsConsumed > 0) {
          await this.creditManager.charge(clientId, {
            baseCost: response.creditsConsumed,
            source: provider.name,
            operation: 'company_search',
            description: `Company search: ${params.keywords?.join(', ') ?? params.industries?.join(', ') ?? 'filters'}`,
          });
        }
        totalCost += response.creditsConsumed;
        providersUsed.push(provider.name);

        this.performanceTracker?.recordPerformance({
          providerName: provider.name,
          clientId,
          operation: 'company_search',
          qualityScore: response.qualityScore,
          responseTimeMs,
          fieldsPopulated: response.fieldsPopulated.length,
          costCredits: response.creditsConsumed,
        });

        // Deduplicate by domain across providers
        for (const company of response.data) {
          const key = company.domain?.toLowerCase();
          if (key && seenDomains.has(key)) continue;
          if (key) seenDomains.add(key);
          allResults.push(company);
        }

        // For search, we accumulate results — stop when we have enough
        if (allResults.length >= (params.limit ?? 100)) break;
      }
    }

    return { result: allResults, providersUsed, totalCost, skippedDueToCredits };
  }

  async searchPeople(
    clientId: string,
    params: PeopleSearchParams,
    config?: { providerOverride?: string[] },
  ): Promise<WaterfallResult<UnifiedContact[]>> {
    const providers = this.getProvidersWithCapability('people_search', config?.providerOverride);
    for (const provider of providers) {
      if (!provider.searchPeople) continue;

      const response = await provider.searchPeople(params);
      if (response.success && response.data && response.data.length > 0) {
        if (response.creditsConsumed > 0) {
          await this.creditManager.charge(clientId, {
            baseCost: response.creditsConsumed,
            source: provider.name,
            operation: 'people_search',
            description: `People search: ${params.companyDomains?.join(', ') ?? 'bulk'}`,
          });
        }
        return { result: response.data, providersUsed: [provider.name], totalCost: response.creditsConsumed };
      }
    }

    return { result: [], providersUsed: [], totalCost: 0 };
  }

  async findEmail(
    clientId: string,
    params: EmailFindParams,
  ): Promise<WaterfallResult<{ email: string; confidence: number }>> {
    for (const provider of this.getProvidersWithCapability('email_find')) {
      if (!provider.findEmail) continue;

      const hasCredits = await this.creditManager.hasBalance(clientId, 1);
      if (!hasCredits) continue;

      const response = await provider.findEmail(params);
      if (response.success && response.data) {
        await this.creditManager.charge(clientId, {
          baseCost: response.creditsConsumed,
          source: provider.name,
          operation: 'email_find',
          description: `Email find: ${params.firstName} ${params.lastName} @ ${params.companyDomain}`,
        });
        return { result: response.data, providersUsed: [provider.name], totalCost: response.creditsConsumed };
      }
    }

    return { result: null, providersUsed: [], totalCost: 0 };
  }

  async verifyEmail(
    clientId: string,
    params: EmailVerifyParams,
  ): Promise<WaterfallResult<EmailVerificationResult>> {
    for (const provider of this.getProvidersWithCapability('email_verify')) {
      if (!provider.verifyEmail) continue;

      const response = await provider.verifyEmail(params);
      if (response.success && response.data) {
        if (response.creditsConsumed > 0) {
          await this.creditManager.charge(clientId, {
            baseCost: response.creditsConsumed,
            source: provider.name,
            operation: 'email_verify',
            description: `Email verify: ${params.email}`,
          });
        }
        return { result: response.data, providersUsed: [provider.name], totalCost: response.creditsConsumed };
      }
    }

    return { result: null, providersUsed: [], totalCost: 0 };
  }
}

function mergeCompanyData(primary: UnifiedCompany, secondary: UnifiedCompany): UnifiedCompany {
  const merged = { ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if (key === 'externalIds') {
      merged.externalIds = { ...merged.externalIds, ...secondary.externalIds };
    } else if ((merged as Record<string, unknown>)[key] == null || (merged as Record<string, unknown>)[key] === '') {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function hasRequiredFields(data: Record<string, unknown> | null, fields?: string[]): boolean {
  if (!fields || !data) return true;
  return fields.every(f => data[f] != null && data[f] !== '');
}
