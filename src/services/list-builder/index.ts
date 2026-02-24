import { getDb, schema } from '../../db/index.js';
import { eq, and, or, gte, lte, inArray, ilike, sql, isNull } from 'drizzle-orm';
import { scoreCompanyFit } from '../icp-engine/scorer.js';
import type { IcpFilters, ProviderSearchHints } from '../../db/schema/icps.js';
import type { UnifiedCompany } from '../../providers/types.js';
import type { CompanyDiscoveryService } from '../company-discovery/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export class ListBuilder {
  private discoveryService?: CompanyDiscoveryService;

  setDiscoveryService(service: CompanyDiscoveryService): void {
    this.discoveryService = service;
  }
  async buildList(params: {
    clientId: string;
    listId: string;
    icpId: string;
    personaId?: string;
    limit?: number;
  }): Promise<{ companiesAdded: number; contactsAdded: number }> {
    const db = getDb();

    const [icp] = await db
      .select()
      .from(schema.icps)
      .where(eq(schema.icps.id, params.icpId));
    if (!icp) throw new NotFoundError('ICP', params.icpId);

    const filters = icp.filters as IcpFilters;
    const providerHints = (icp.providerHints as ProviderSearchHints | null) ?? filters.providerHints;

    // Build company query
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
    // Use provider hints keyword terms for additional matching
    if (providerHints?.keywordSearchTerms?.length) {
      conditions.push(
        or(...providerHints.keywordSearchTerms.map(term =>
          or(
            ilike(schema.companies.name, `%${term}%`),
            ilike(schema.companies.industry, `%${term}%`),
          )!,
        ))!,
      );
    }

    const matchingCompanies = await db
      .select()
      .from(schema.companies)
      .where(and(...conditions))
      .limit(params.limit ?? 1000);

    // Score each company
    const scored = matchingCompanies
      .map(c => {
        const companyData: UnifiedCompany = {
          name: c.name,
          domain: c.domain ?? undefined,
          industry: c.industry ?? undefined,
          employeeCount: c.employeeCount ?? undefined,
          annualRevenue: c.annualRevenue != null ? Number(c.annualRevenue) : undefined,
          foundedYear: c.foundedYear ?? undefined,
          totalFunding: c.totalFunding != null ? Number(c.totalFunding) : undefined,
          latestFundingStage: c.latestFundingStage ?? undefined,
          country: c.country ?? undefined,
          techStack: (c.techStack as string[]) ?? [],
          externalIds: {},
        };
        const scoreResult = scoreCompanyFit(companyData, filters);
        return { company: c, ...scoreResult };
      })
      .filter(c => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    // Load persona if provided
    let persona: typeof schema.personas.$inferSelect | null = null;
    if (params.personaId) {
      const [p] = await db
        .select()
        .from(schema.personas)
        .where(eq(schema.personas.id, params.personaId));
      persona = p ?? null;
    }

    let contactsAdded = 0;

    for (const { company, score, reasons } of scored) {
      // Add company to list
      await db
        .insert(schema.listMembers)
        .values({
          listId: params.listId,
          companyId: company.id,
          icpFitScore: String(score),
          addedReason: reasons.join('; '),
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
              icpFitScore: String(score),
              addedReason: `${reasons.join('; ')} | Title: ${contact.title}`,
            })
            .onConflictDoNothing();
          contactsAdded++;
        }
      }
    }

    // Update list stats
    await db
      .update(schema.lists)
      .set({
        companyCount: scored.length,
        contactCount: contactsAdded,
        memberCount: scored.length + contactsAdded,
        filterSnapshot: {
          icpFilters: filters as unknown as Record<string, unknown>,
          personaFilters: persona ? {
            titlePatterns: persona.titlePatterns,
            seniorityLevels: persona.seniorityLevels,
            departments: persona.departments,
          } : undefined,
          appliedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.lists.id, params.listId));

    logger.info(
      { listId: params.listId, companiesAdded: scored.length, contactsAdded },
      'List built successfully',
    );

    return { companiesAdded: scored.length, contactsAdded };
  }

  async refreshList(listId: string): Promise<void> {
    const db = getDb();
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, listId));
    if (!list || !list.icpId) throw new NotFoundError('List', listId);

    // Soft-remove all current members
    await db
      .update(schema.listMembers)
      .set({ removedAt: new Date() })
      .where(and(eq(schema.listMembers.listId, listId), isNull(schema.listMembers.removedAt)));

    // Rebuild
    await this.buildList({
      clientId: list.clientId,
      listId,
      icpId: list.icpId,
      personaId: list.personaId ?? undefined,
    });

    // Update refresh timestamp
    await db
      .update(schema.lists)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.lists.id, listId));

    logger.info({ listId }, 'List refreshed');
  }

  async buildListWithDiscovery(params: {
    clientId: string;
    listId: string;
    icpId: string;
    personaId?: string;
    limit?: number;
    jobId: string;
  }): Promise<{ companiesAdded: number; contactsAdded: number; discovery: import('../company-discovery/index.js').DiscoveryResult }> {
    const db = getDb();

    if (!this.discoveryService) {
      throw new Error('CompanyDiscoveryService not configured');
    }

    // Step 1: Discover companies from external providers
    logger.info({ listId: params.listId, icpId: params.icpId }, 'Starting list build with discovery');

    const discovery = await this.discoveryService.discoverAndPopulate({
      clientId: params.clientId,
      icpId: params.icpId,
      personaId: params.personaId,
      limit: params.limit ?? 100,
      jobId: params.jobId,
    });

    logger.info(
      { listId: params.listId, ...discovery },
      'Discovery phase complete, building list from DB',
    );

    // Step 2: Build list from the now-populated DB
    const result = await this.buildList({
      clientId: params.clientId,
      listId: params.listId,
      icpId: params.icpId,
      personaId: params.personaId,
      limit: params.limit,
    });

    // Step 3: Update job as completed
    await db
      .update(schema.jobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        output: {
          companiesAdded: result.companiesAdded,
          contactsAdded: result.contactsAdded,
          companiesDiscovered: discovery.companiesDiscovered,
          companiesScored: discovery.companiesScored,
          providersUsed: discovery.providersUsed,
        },
      })
      .where(eq(schema.jobs.id, params.jobId));

    logger.info(
      { listId: params.listId, companiesAdded: result.companiesAdded, contactsAdded: result.contactsAdded },
      'List build with discovery complete',
    );

    return { ...result, discovery };
  }
}
