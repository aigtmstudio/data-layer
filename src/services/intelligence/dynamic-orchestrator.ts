import { getDb, schema } from '../../db/index.js';
import { eq, and, or, gte, lte, inArray, ilike, isNull } from 'drizzle-orm';
import type { IcpFilters } from '../../db/schema/icps.js';
import type { SourceRecord } from '../../db/schema/companies.js';
import type { StrategyData } from '../../db/schema/intelligence.js';
import type { UnifiedCompany } from '../../providers/types.js';
import type { SourceOrchestrator } from '../source-orchestrator/index.js';
import type { StrategyGenerator } from './strategy-generator.js';
import type { SignalDetector } from './signal-detector.js';
import type { IntelligenceScorer } from './intelligence-scorer.js';
import type { ClientProfileService } from './client-profile.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export interface IntelligentListParams {
  clientId: string;
  listId: string;
  icpId: string;
  personaId?: string;
  limit?: number;
}

interface ScoredCompany {
  company: typeof schema.companies.$inferSelect;
  intelligenceScore: number;
  icpFitScore: number;
  signalScore: number;
  originalityScore: number;
  reasons: string[];
}

export class DynamicOrchestrator {
  constructor(
    private orchestrator: SourceOrchestrator,
    private strategyGenerator: StrategyGenerator,
    private signalDetector: SignalDetector,
    private intelligenceScorer: IntelligenceScorer,
    private clientProfileService: ClientProfileService,
  ) {}

  /**
   * Build an intelligent list using AI-driven strategy.
   * This is the main entry point for the intelligence layer.
   */
  async buildIntelligentList(params: IntelligentListParams): Promise<{
    companiesAdded: number;
    contactsAdded: number;
    strategyUsed: StrategyData;
  }> {
    const log = logger.child({ listId: params.listId, clientId: params.clientId });
    const db = getDb();

    // 1. Load ICP
    const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, params.icpId));
    if (!icp) throw new NotFoundError('ICP', params.icpId);
    const filters = icp.filters as IcpFilters;

    // 2. Generate strategy
    log.info('Generating intelligence strategy');
    const strategy = await this.strategyGenerator.generateStrategy(
      params.clientId,
      params.icpId,
      params.personaId,
      this.orchestrator.getRegisteredProviders(),
    );
    log.info({ strategy: strategy.reasoning }, 'Strategy generated');

    // 3. Link strategy to list
    const [strategyRecord] = await db
      .select({ id: schema.strategies.id })
      .from(schema.strategies)
      .where(eq(schema.strategies.clientId, params.clientId))
      .orderBy(schema.strategies.createdAt)
      .limit(1);

    if (strategyRecord) {
      await db.update(schema.lists)
        .set({ strategyId: strategyRecord.id })
        .where(eq(schema.lists.id, params.listId));
    }

    // 4. Query companies matching ICP (same base query as ListBuilder)
    const conditions = [eq(schema.companies.clientId, params.clientId)];
    if (filters.industries?.length) {
      conditions.push(
        or(...filters.industries.map(i => ilike(schema.companies.industry, `%${i}%`)))!,
      );
    }
    if (filters.employeeCountMin != null) {
      conditions.push(gte(schema.companies.employeeCount, filters.employeeCountMin));
    }
    if (filters.employeeCountMax != null) {
      conditions.push(lte(schema.companies.employeeCount, filters.employeeCountMax));
    }
    if (filters.countries?.length) {
      conditions.push(inArray(schema.companies.country, filters.countries));
    }

    const matchingCompanies = await db
      .select()
      .from(schema.companies)
      .where(and(...conditions))
      .limit(params.limit ?? 1000);

    log.info({ count: matchingCompanies.length }, 'Companies matching ICP filters');

    // 5. Get client profile for signal context
    const clientProfile = await this.clientProfileService.getProfile(params.clientId);
    const clientContext = clientProfile ? {
      products: clientProfile.products as string[] | undefined,
      industry: clientProfile.industry ?? undefined,
    } : undefined;

    // 6. Detect signals for all companies (batch)
    const companyIds = matchingCompanies.map(c => c.id);
    const existingSignals = await this.signalDetector.getSignalsForCompanies(params.clientId, companyIds);

    // For companies without signals, detect them now
    for (const company of matchingCompanies) {
      if (!existingSignals.has(company.id)) {
        const companyData: UnifiedCompany = {
          name: company.name,
          domain: company.domain ?? undefined,
          industry: company.industry ?? undefined,
          description: company.description ?? undefined,
          employeeCount: company.employeeCount ?? undefined,
          employeeRange: company.employeeRange ?? undefined,
          techStack: (company.techStack as string[]) ?? [],
          latestFundingStage: company.latestFundingStage ?? undefined,
          totalFunding: company.totalFunding != null ? Number(company.totalFunding) : undefined,
          country: company.country ?? undefined,
          externalIds: {},
        };

        const signals = await this.signalDetector.detectSignals(
          params.clientId, companyData, company.id, clientContext,
        );
        existingSignals.set(company.id, signals);
      }
    }

    // 7. Score all companies with the intelligence scorer
    const scored: ScoredCompany[] = matchingCompanies
      .map(company => {
        const companyData: UnifiedCompany = {
          name: company.name,
          domain: company.domain ?? undefined,
          industry: company.industry ?? undefined,
          employeeCount: company.employeeCount ?? undefined,
          annualRevenue: company.annualRevenue != null ? Number(company.annualRevenue) : undefined,
          foundedYear: company.foundedYear ?? undefined,
          totalFunding: company.totalFunding != null ? Number(company.totalFunding) : undefined,
          latestFundingStage: company.latestFundingStage ?? undefined,
          country: company.country ?? undefined,
          techStack: (company.techStack as string[]) ?? [],
          externalIds: {},
        };

        const signals = existingSignals.get(company.id) ?? [];
        const sources = (company.sources as SourceRecord[]) ?? [];
        const totalCost = sources.length; // Approximate: 1 credit per source

        const scoreResult = this.intelligenceScorer.scoreCompany(
          companyData,
          filters,
          signals,
          sources,
          totalCost,
          strategy.scoringWeights,
          strategy.signalPriorities,
        );

        return {
          company,
          ...scoreResult,
        };
      })
      .filter(c => c.intelligenceScore >= 0.3)
      .sort((a, b) => b.intelligenceScore - a.intelligenceScore);

    log.info({ scored: scored.length }, 'Companies scored and ranked');

    // 8. Load persona if provided
    let persona: typeof schema.personas.$inferSelect | null = null;
    if (params.personaId) {
      const [p] = await db.select().from(schema.personas).where(eq(schema.personas.id, params.personaId));
      persona = p ?? null;
    }

    // 9. Insert into list with intelligence scores
    let contactsAdded = 0;

    for (const { company, intelligenceScore, icpFitScore, signalScore, originalityScore, reasons } of scored) {
      await db
        .insert(schema.listMembers)
        .values({
          listId: params.listId,
          companyId: company.id,
          icpFitScore: String(icpFitScore),
          signalScore: String(signalScore),
          originalityScore: String(originalityScore),
          intelligenceScore: String(intelligenceScore),
          addedReason: reasons.slice(0, 5).join('; '),
        })
        .onConflictDoNothing();

      // Find matching contacts
      if (persona) {
        const contactConditions = [
          eq(schema.contacts.clientId, params.clientId),
          eq(schema.contacts.companyId, company.id),
        ];

        const titlePatterns = persona.titlePatterns as string[];
        if (titlePatterns?.length) {
          contactConditions.push(
            or(...titlePatterns.map(p => {
              const sqlPattern = p.replace(/\*/g, '%');
              return ilike(schema.contacts.title, `%${sqlPattern}%`);
            }))!,
          );
        }

        const seniorityLevels = persona.seniorityLevels as string[];
        if (seniorityLevels?.length) {
          contactConditions.push(inArray(schema.contacts.seniority, seniorityLevels));
        }

        const departments = persona.departments as string[];
        if (departments?.length) {
          contactConditions.push(
            or(...departments.map(d => ilike(schema.contacts.department, `%${d}%`)))!,
          );
        }

        const matchingContacts = await db
          .select()
          .from(schema.contacts)
          .where(and(...contactConditions));

        for (const contact of matchingContacts) {
          await db
            .insert(schema.listMembers)
            .values({
              listId: params.listId,
              contactId: contact.id,
              companyId: company.id,
              icpFitScore: String(icpFitScore),
              signalScore: String(signalScore),
              originalityScore: String(originalityScore),
              intelligenceScore: String(intelligenceScore),
              addedReason: `${reasons.slice(0, 3).join('; ')} | Title: ${contact.title}`,
            })
            .onConflictDoNothing();
          contactsAdded++;
        }
      }

      // Update originality score on the company record
      await db
        .update(schema.companies)
        .set({ originalityScore: String(originalityScore) })
        .where(eq(schema.companies.id, company.id));
    }

    // 10. Update list stats
    await db
      .update(schema.lists)
      .set({
        companyCount: scored.length,
        contactCount: contactsAdded,
        memberCount: scored.length + contactsAdded,
        filterSnapshot: {
          icpFilters: filters as unknown as Record<string, unknown>,
          strategy: { reasoning: strategy.reasoning, providerPlan: strategy.providerPlan } as unknown as Record<string, unknown>,
          appliedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.lists.id, params.listId));

    log.info({ companiesAdded: scored.length, contactsAdded }, 'Intelligent list built');

    return {
      companiesAdded: scored.length,
      contactsAdded,
      strategyUsed: strategy,
    };
  }

  /**
   * Enrich companies using strategy-driven provider selection.
   * Delegates to SourceOrchestrator with providerOverride.
   */
  async enrichWithStrategy(
    clientId: string,
    domains: string[],
    strategy: StrategyData,
  ) {
    const providerOrder = strategy.providerPlan
      .sort((a, b) => a.priority - b.priority)
      .map(p => p.provider);

    const results: Array<{ domain: string; success: boolean; providersUsed: string[] }> = [];

    for (const domain of domains) {
      const { result, providersUsed } = await this.orchestrator.enrichCompany(
        clientId,
        { domain },
        {
          providerOverride: providerOrder,
          maxProviders: Math.min(providerOrder.length, 4),
        },
      );

      results.push({
        domain,
        success: result != null,
        providersUsed,
      });
    }

    return results;
  }
}
