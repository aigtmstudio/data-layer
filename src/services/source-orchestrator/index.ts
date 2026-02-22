import type {
  DataProvider,
  ProviderCapability,
  UnifiedCompany,
  UnifiedContact,
  EmailVerificationResult,
  PeopleSearchParams,
  EmailFindParams,
  EmailVerifyParams,
} from '../../providers/types.js';
import type { CreditManager } from '../credit-manager/index.js';
import { logger } from '../../lib/logger.js';

interface WaterfallConfig {
  qualityThreshold: number;
  maxProviders: number;
  requiredFields?: string[];
}

interface WaterfallResult<T> {
  result: T | null;
  providersUsed: string[];
  totalCost: number;
}

const DEFAULT_CONFIG: WaterfallConfig = {
  qualityThreshold: 0.7,
  maxProviders: 3,
};

export class SourceOrchestrator {
  private providers: Map<string, { provider: DataProvider; priority: number }> = new Map();

  constructor(private creditManager: CreditManager) {}

  registerProvider(provider: DataProvider, priority: number): void {
    this.providers.set(provider.name, { provider, priority });
    logger.info({ provider: provider.name, priority, capabilities: provider.capabilities }, 'Provider registered');
  }

  private getProvidersWithCapability(capability: ProviderCapability): DataProvider[] {
    return Array.from(this.providers.values())
      .filter(({ provider }) => provider.capabilities.includes(capability))
      .sort((a, b) => a.priority - b.priority)
      .map(({ provider }) => provider);
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

    for (const provider of this.getProvidersWithCapability('company_enrich')) {
      if (providersUsed.length >= cfg.maxProviders) break;
      if (!provider.enrichCompany) continue;

      const hasCredits = await this.creditManager.hasBalance(clientId, 1);
      if (!hasCredits) {
        logger.warn({ clientId, provider: provider.name }, 'Insufficient credits, skipping');
        continue;
      }

      const response = await provider.enrichCompany(params);
      if (response.success && response.data) {
        await this.creditManager.charge(clientId, {
          baseCost: response.creditsConsumed,
          source: provider.name,
          operation: 'company_enrich',
          description: `Company enrichment: ${params.domain ?? params.name}`,
        });
        totalCost += response.creditsConsumed;
        providersUsed.push(provider.name);

        merged = merged ? mergeCompanyData(merged, response.data) : response.data;

        if (response.qualityScore >= cfg.qualityThreshold && hasRequiredFields(merged as unknown as Record<string, unknown>, cfg.requiredFields)) {
          break;
        }
      }
    }

    return { result: merged, providersUsed, totalCost };
  }

  async searchPeople(
    clientId: string,
    params: PeopleSearchParams,
  ): Promise<WaterfallResult<UnifiedContact[]>> {
    const providers = this.getProvidersWithCapability('people_search');
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
