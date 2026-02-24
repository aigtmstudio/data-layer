import type { SourceOrchestrator } from '../source-orchestrator/index.js';
import type { EnrichmentPipeline } from '../enrichment/index.js';
import type { CompanySearchParams, UnifiedCompany } from '../../providers/types.js';
import type { IcpFilters, ProviderSearchHints } from '../../db/schema/icps.js';
import { scoreCompanyFit } from '../icp-engine/scorer.js';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export interface DiscoveryResult {
  companiesDiscovered: number;
  companiesScored: number;
  companiesAdded: number;
  contactsFound: number;
  providersUsed: string[];
  totalCost: number;
}

export class CompanyDiscoveryService {
  constructor(
    private orchestrator: SourceOrchestrator,
    private enrichment: EnrichmentPipeline,
  ) {}

  async discoverAndPopulate(params: {
    clientId: string;
    icpId: string;
    personaId?: string;
    limit?: number;
    jobId?: string;
  }): Promise<DiscoveryResult> {
    const db = getDb();
    const limit = params.limit ?? 100;

    // 1. Load ICP
    const [icp] = await db
      .select()
      .from(schema.icps)
      .where(eq(schema.icps.id, params.icpId));
    if (!icp) throw new Error(`ICP not found: ${params.icpId}`);

    const filters = icp.filters as IcpFilters;
    const providerHints = (icp.providerHints as ProviderSearchHints | null) ?? filters.providerHints;

    // 2. Translate IcpFilters → CompanySearchParams
    const searchParams = this.buildSearchParams(filters, providerHints, limit);

    logger.info(
      { icpId: params.icpId, searchParams, limit },
      'Starting company discovery',
    );

    // Update job status to running
    if (params.jobId) {
      await db
        .update(schema.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(schema.jobs.id, params.jobId));
    }

    // 3. Search providers
    const { result: discovered, providersUsed, totalCost } =
      await this.orchestrator.searchCompanies(params.clientId, searchParams);

    const companies = discovered ?? [];
    logger.info(
      { count: companies.length, providersUsed },
      'Companies discovered from providers',
    );

    if (companies.length === 0) {
      if (params.jobId) {
        await db
          .update(schema.jobs)
          .set({
            processedItems: 0,
            totalItems: 0,
            output: { companiesDiscovered: 0, companiesAdded: 0 },
          })
          .where(eq(schema.jobs.id, params.jobId));
      }
      return {
        companiesDiscovered: 0,
        companiesScored: 0,
        companiesAdded: 0,
        contactsFound: 0,
        providersUsed,
        totalCost,
      };
    }

    // 4. Deduplicate against existing DB companies
    const existingDomains = new Set<string>();
    if (companies.some(c => c.domain)) {
      const domains = companies.map(c => c.domain?.toLowerCase()).filter(Boolean) as string[];
      const existing = await db
        .select({ domain: schema.companies.domain })
        .from(schema.companies)
        .where(eq(schema.companies.clientId, params.clientId));
      for (const row of existing) {
        if (row.domain) existingDomains.add(row.domain.toLowerCase());
      }
    }

    const newCompanies = companies.filter(c => {
      if (!c.domain) return true; // Keep companies without domains (will get a new DB record)
      return !existingDomains.has(c.domain.toLowerCase());
    });

    logger.info(
      { total: companies.length, new: newCompanies.length, existing: companies.length - newCompanies.length },
      'Deduplication complete',
    );

    // Update job progress
    if (params.jobId) {
      await db
        .update(schema.jobs)
        .set({ totalItems: newCompanies.length, processedItems: 0, updatedAt: new Date() })
        .where(eq(schema.jobs.id, params.jobId));
    }

    // 5. Upsert discovered companies into DB
    let upserted = 0;
    for (const company of newCompanies) {
      await this.upsertDiscoveredCompany(params.clientId, company, providersUsed);
      upserted++;

      if (params.jobId && upserted % 10 === 0) {
        await db
          .update(schema.jobs)
          .set({ processedItems: upserted, updatedAt: new Date() })
          .where(eq(schema.jobs.id, params.jobId));
      }
    }

    // 6. Score all discovered companies (new + existing)
    const allDiscoveredDomains = companies
      .map(c => c.domain?.toLowerCase())
      .filter(Boolean) as string[];

    const scoredCompanies = companies
      .map(c => ({ company: c, ...scoreCompanyFit(c, filters) }))
      .filter(c => c.score >= 0.3) // Lower threshold for discovered companies — they already matched search
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    logger.info(
      { discovered: companies.length, scored: scoredCompanies.length },
      'Scoring complete',
    );

    // 7. Optionally enrich top companies for better data
    const domainsToEnrich = scoredCompanies
      .filter(c => c.company.domain)
      .slice(0, Math.min(20, limit)) // Cap enrichment to 20 companies per build
      .map(c => c.company.domain!)
      .filter(d => !existingDomains.has(d.toLowerCase())); // Only enrich truly new companies

    let contactsFound = 0;
    if (domainsToEnrich.length > 0 && params.jobId) {
      // Load persona filters for contact discovery
      let personaFilters: { titlePatterns?: string[]; seniorityLevels?: string[]; departments?: string[] } | undefined;
      if (params.personaId) {
        const [persona] = await db
          .select()
          .from(schema.personas)
          .where(eq(schema.personas.id, params.personaId));
        if (persona) {
          personaFilters = {
            titlePatterns: persona.titlePatterns as string[],
            seniorityLevels: persona.seniorityLevels as string[],
            departments: persona.departments as string[],
          };
        }
      }

      await this.enrichment.enrichCompanies(
        params.clientId,
        domainsToEnrich,
        params.jobId,
        {
          discoverContacts: !!params.personaId,
          findEmails: !!params.personaId,
          verifyEmails: false, // Skip verification during build for speed
          personaFilters,
        },
      );

      // Count contacts found
      if (params.personaId) {
        for (const domain of domainsToEnrich) {
          const companyRows = await db
            .select({ id: schema.companies.id })
            .from(schema.companies)
            .where(and(eq(schema.companies.clientId, params.clientId), eq(schema.companies.domain, domain)))
            .limit(1);
          if (companyRows.length > 0) {
            const contacts = await db
              .select({ id: schema.contacts.id })
              .from(schema.contacts)
              .where(eq(schema.contacts.companyId, companyRows[0].id));
            contactsFound += contacts.length;
          }
        }
      }
    }

    return {
      companiesDiscovered: companies.length,
      companiesScored: scoredCompanies.length,
      companiesAdded: upserted,
      contactsFound,
      providersUsed,
      totalCost,
    };
  }

  private buildSearchParams(
    filters: IcpFilters,
    hints: ProviderSearchHints | undefined,
    limit: number,
  ): CompanySearchParams {
    const params: CompanySearchParams = {
      limit: limit * 2, // Over-fetch to account for post-filtering and dedup
    };

    if (filters.industries?.length) params.industries = filters.industries;
    if (filters.employeeCountMin != null) params.employeeCountMin = filters.employeeCountMin;
    if (filters.employeeCountMax != null) params.employeeCountMax = filters.employeeCountMax;
    if (filters.revenueMin != null) params.revenueMin = filters.revenueMin;
    if (filters.revenueMax != null) params.revenueMax = filters.revenueMax;
    if (filters.fundingStages?.length) params.fundingStages = filters.fundingStages;
    if (filters.techStack?.length) params.techStack = filters.techStack;
    if (filters.countries?.length) params.countries = filters.countries;
    if (filters.states?.length) params.states = filters.states;
    if (filters.cities?.length) params.cities = filters.cities;

    // Merge keywords from both filters and provider hints
    const keywords: string[] = [];
    if (filters.keywords?.length) keywords.push(...filters.keywords);
    if (hints?.keywordSearchTerms?.length) keywords.push(...hints.keywordSearchTerms);
    if (keywords.length) params.keywords = [...new Set(keywords)];

    return params;
  }

  private async upsertDiscoveredCompany(
    clientId: string,
    data: UnifiedCompany,
    providersUsed: string[],
  ): Promise<{ id: string }> {
    const db = getDb();
    const now = new Date();

    const dbFields = {
      name: data.name,
      domain: data.domain,
      linkedinUrl: data.linkedinUrl,
      websiteUrl: data.websiteUrl,
      industry: data.industry,
      subIndustry: data.subIndustry,
      employeeCount: data.employeeCount,
      employeeRange: data.employeeRange,
      annualRevenue: data.annualRevenue != null ? String(data.annualRevenue) : undefined,
      foundedYear: data.foundedYear,
      totalFunding: data.totalFunding != null ? String(data.totalFunding) : undefined,
      latestFundingStage: data.latestFundingStage,
      city: data.city,
      state: data.state,
      country: data.country,
      address: data.address,
      techStack: data.techStack ?? [],
      logoUrl: data.logoUrl,
      description: data.description,
      phone: data.phone,
      sources: providersUsed.map(p => ({
        source: p,
        fetchedAt: now.toISOString(),
        fieldsProvided: [] as string[],
      })),
      primarySource: providersUsed[0],
      apolloId: data.externalIds.apollo,
      leadmagicId: data.externalIds.leadmagic,
      updatedAt: now,
    };

    // Dedupe by domain
    if (data.domain) {
      const existing = await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(and(eq(schema.companies.clientId, clientId), eq(schema.companies.domain, data.domain)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(schema.companies).set(dbFields).where(eq(schema.companies.id, existing[0].id));
        return existing[0];
      }
    }

    const [inserted] = await db
      .insert(schema.companies)
      .values({ clientId, ...dbFields })
      .returning({ id: schema.companies.id });
    return inserted;
  }
}
