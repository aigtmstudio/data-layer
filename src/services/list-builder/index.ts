import { getDb, schema } from '../../db/index.js';
import { eq, and, or, inArray, ilike, isNull, sql } from 'drizzle-orm';
import { scoreCompanyFit } from '../icp-engine/scorer.js';
import type { IcpFilters } from '../../db/schema/icps.js';
import type { SourceRecord } from '../../db/schema/companies.js';
import type { UnifiedCompany } from '../../providers/types.js';
import type { CompanyDiscoveryService } from '../company-discovery/index.js';
import type { SignalDetector } from '../intelligence/signal-detector.js';
import type { IntelligenceScorer } from '../intelligence/intelligence-scorer.js';
import type { ClientProfileService } from '../intelligence/client-profile.js';
import type { PersonaSignalDetector } from '../intelligence/persona-signal-detector.js';
import type { EmploymentRecord } from '../../db/schema/contacts.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isBlockedDomain, isBlockedCompanyName, isPlausibleCompanyName } from '../company-discovery/index.js';

export class ListBuilder {
  private discoveryService?: CompanyDiscoveryService;
  private signalDetector?: SignalDetector;
  private intelligenceScorer?: IntelligenceScorer;
  private clientProfileService?: ClientProfileService;
  private personaSignalDetector?: PersonaSignalDetector;

  setDiscoveryService(service: CompanyDiscoveryService): void {
    this.discoveryService = service;
  }

  setSignalDetector(detector: SignalDetector): void {
    this.signalDetector = detector;
  }

  setIntelligenceScorer(scorer: IntelligenceScorer): void {
    this.intelligenceScorer = scorer;
  }

  setClientProfileService(service: ClientProfileService): void {
    this.clientProfileService = service;
  }

  setPersonaSignalDetector(detector: PersonaSignalDetector): void {
    this.personaSignalDetector = detector;
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

    // Fetch all companies for this client — the ICP scorer handles filtering
    // with fuzzy/partial matching that's more accurate than SQL exact-match conditions.
    // SQL filters caused false negatives (e.g. country "US" != "United States").
    const matchingCompanies = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.clientId, params.clientId))
      .limit((params.limit ?? 1000) * 3); // Over-fetch so scorer has enough to filter

    // Filter out companies with blocked domains, platform names, or non-company names
    const validCompanies = matchingCompanies.filter(c =>
      !isBlockedDomain(c.domain ?? undefined)
      && !isBlockedCompanyName(c.name)
      && isPlausibleCompanyName(c.name),
    );
    if (validCompanies.length < matchingCompanies.length) {
      logger.info(
        { blocked: matchingCompanies.length - validCompanies.length },
        'Filtered out companies with blocked domains during list build',
      );
    }

    // Skip companies already in the list (prevents duplicates on re-build)
    const existingMembers = await db
      .select({ companyId: schema.listMembers.companyId })
      .from(schema.listMembers)
      .where(and(
        eq(schema.listMembers.listId, params.listId),
        isNull(schema.listMembers.removedAt),
      ));
    const existingCompanyIds = new Set(existingMembers.map(m => m.companyId).filter(Boolean));
    const candidates = existingCompanyIds.size > 0
      ? validCompanies.filter(c => !existingCompanyIds.has(c.id))
      : validCompanies;

    if (existingCompanyIds.size > 0) {
      logger.info(
        { existing: existingCompanyIds.size, newCandidates: candidates.length },
        'Skipped companies already in list',
      );
    }

    logger.info(
      { listId: params.listId, candidateCount: candidates.length },
      'Companies loaded from DB for scoring',
    );

    // Score each company
    const allScored = candidates.map(c => {
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
    });

    const scored = allScored
      .filter(c => c.score >= 0.2)
      .sort((a, b) => b.score - a.score);

    // Diagnostic logging: show why companies were kept or filtered
    const filtered = allScored.filter(c => c.score < 0.2);
    if (filtered.length > 0) {
      logger.info(
        {
          listId: params.listId,
          filteredOut: filtered.length,
          kept: scored.length,
          sampleFiltered: filtered.slice(0, 3).map(c => ({
            name: c.company.name,
            score: c.score,
            reasons: c.reasons,
            breakdown: c.breakdown,
          })),
        },
        'Companies filtered by ICP scoring',
      );
    }

    // --- Signal detection & composite scoring ---
    // If signal services are wired, detect signals and compute intelligence scores.
    // Otherwise fall back to ICP-only scoring (backwards-compatible).
    const hasSignalServices = !!(this.signalDetector && this.intelligenceScorer);

    interface ScoredMember {
      company: typeof matchingCompanies[number];
      icpFitScore: number;
      signalScore: number;
      intelligenceScore: number;
      reasons: string[];
    }

    let finalScored: ScoredMember[];

    if (hasSignalServices && scored.length > 0) {
      logger.info({ listId: params.listId, companies: scored.length }, 'Detecting signals for list companies');

      // Get client context for signal detection
      let clientContext: { products?: string[]; industry?: string } | undefined;
      if (this.clientProfileService) {
        const profile = await this.clientProfileService.getProfile(params.clientId);
        if (profile) {
          clientContext = {
            products: (profile.products as string[]) ?? undefined,
            industry: profile.industry ?? undefined,
          };
        }
      }

      // Batch-load existing signals
      const companyIds = scored.map(s => s.company.id);
      const existingSignals = await this.signalDetector!.getSignalsForCompanies(params.clientId, companyIds);

      // Detect signals for companies that don't have any yet
      for (const { company } of scored) {
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

          const signals = await this.signalDetector!.detectSignals(
            params.clientId, companyData, company.id, clientContext,
          );
          existingSignals.set(company.id, signals);
        }
      }

      const signalCounts = { withSignals: 0, without: 0 };

      // Compute composite intelligence score for each company
      finalScored = scored.map(({ company, score: icpScore, reasons: icpReasons }) => {
        const signals = existingSignals.get(company.id) ?? [];
        const sources = (company.sources as SourceRecord[]) ?? [];

        if (signals.length > 0) signalCounts.withSignals++;
        else signalCounts.without++;

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

        const result = this.intelligenceScorer!.scoreCompany(
          companyData, filters, signals, sources, sources.length,
        );

        return {
          company,
          icpFitScore: icpScore,
          signalScore: result.signalScore,
          intelligenceScore: result.intelligenceScore,
          reasons: result.reasons,
        };
      }).sort((a, b) => b.intelligenceScore - a.intelligenceScore);

      logger.info(
        { listId: params.listId, ...signalCounts, total: finalScored.length },
        'Signal detection and composite scoring complete',
      );
    } else {
      // No signal services — use ICP score only
      finalScored = scored.map(({ company, score, reasons }) => ({
        company,
        icpFitScore: score,
        signalScore: 0,
        intelligenceScore: score,
        reasons,
      }));
    }

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

    for (const { company, icpFitScore, signalScore, intelligenceScore, reasons } of finalScored) {
      // Add company to list
      await db
        .insert(schema.listMembers)
        .values({
          listId: params.listId,
          companyId: company.id,
          icpFitScore: String(icpFitScore),
          signalScore: String(signalScore),
          intelligenceScore: String(intelligenceScore),
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
              icpFitScore: String(icpFitScore),
              signalScore: String(signalScore),
              intelligenceScore: String(intelligenceScore),
              addedReason: `${reasons.slice(0, 3).join('; ')} | Title: ${contact.title}`,
            })
            .onConflictDoNothing();
          contactsAdded++;
        }
      }
    }

    // Count actual active members (includes pre-existing + newly added)
    const [{ companyTotal, contactTotal }] = await db
      .select({
        companyTotal: sql<number>`count(distinct company_id) filter (where company_id is not null)::int`,
        contactTotal: sql<number>`count(distinct contact_id) filter (where contact_id is not null)::int`,
      })
      .from(schema.listMembers)
      .where(and(
        eq(schema.listMembers.listId, params.listId),
        isNull(schema.listMembers.removedAt),
      ));

    // Update list stats
    await db
      .update(schema.lists)
      .set({
        companyCount: companyTotal,
        contactCount: contactTotal,
        memberCount: companyTotal + contactTotal,
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
      { listId: params.listId, companiesAdded: finalScored.length, contactsAdded },
      'List built successfully',
    );

    return { companiesAdded: finalScored.length, contactsAdded };
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
          ...(discovery.warnings?.length ? { warnings: discovery.warnings } : {}),
        },
      })
      .where(eq(schema.jobs.id, params.jobId));

    logger.info(
      { listId: params.listId, companiesAdded: result.companiesAdded, contactsAdded: result.contactsAdded },
      'List build with discovery complete',
    );

    return { ...result, discovery };
  }

  /**
   * Run company-level signal detection on list members at active_segment.
   * This is the Gate 2 action in the funnel — triggered by a human after
   * reviewing which companies were promoted by market signals.
   */
  async runCompanySignals(listId: string): Promise<{
    processed: number;
    qualified: number;
    signalsDetected: number;
  }> {
    const db = getDb();

    if (!this.signalDetector || !this.intelligenceScorer) {
      throw new Error('Signal services not configured — cannot run company signals');
    }

    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, listId));
    if (!list) throw new NotFoundError('List', listId);

    // Load list members whose company is at active_segment
    const activeMembers = await db
      .select({
        memberId: schema.listMembers.id,
        companyId: schema.listMembers.companyId,
        company: schema.companies,
      })
      .from(schema.listMembers)
      .innerJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
      .where(and(
        eq(schema.listMembers.listId, listId),
        isNull(schema.listMembers.removedAt),
        eq(schema.companies.pipelineStage, 'active_segment'),
      ));

    if (activeMembers.length === 0) {
      logger.info({ listId }, 'No active_segment members to run company signals on');
      return { processed: 0, qualified: 0, signalsDetected: 0 };
    }

    logger.info(
      { listId, activeMembers: activeMembers.length },
      'Running company-level signal detection',
    );

    // Get client context for signal detection
    let clientContext: { products?: string[]; industry?: string } | undefined;
    if (this.clientProfileService) {
      const profile = await this.clientProfileService.getProfile(list.clientId);
      if (profile) {
        clientContext = {
          products: (profile.products as string[]) ?? undefined,
          industry: profile.industry ?? undefined,
        };
      }
    }

    // Load ICP filters for intelligence scoring
    let icpFilters: IcpFilters = {};
    if (list.icpId) {
      const [icp] = await db
        .select()
        .from(schema.icps)
        .where(eq(schema.icps.id, list.icpId));
      if (icp) {
        icpFilters = icp.filters as IcpFilters;
      }
    }

    let qualified = 0;
    let totalSignals = 0;
    const companyIdsToQualify: string[] = [];

    for (const member of activeMembers) {
      const company = member.company;
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
        annualRevenue: company.annualRevenue != null ? Number(company.annualRevenue) : undefined,
        foundedYear: company.foundedYear ?? undefined,
        externalIds: {},
      };

      // Detect signals
      const signals = await this.signalDetector.detectSignals(
        list.clientId, companyData, company.id, clientContext,
      );
      totalSignals += signals.length;

      // Compute composite scores
      const sources = (company.sources as SourceRecord[]) ?? [];
      const result = this.intelligenceScorer.scoreCompany(
        companyData, icpFilters, signals, sources, sources.length,
      );

      // Update list member with scores
      await db
        .update(schema.listMembers)
        .set({
          signalScore: String(result.signalScore),
          intelligenceScore: String(result.intelligenceScore),
          addedReason: result.reasons.length > 0
            ? result.reasons.slice(0, 5).join('; ')
            : undefined,
        })
        .where(eq(schema.listMembers.id, member.memberId));

      // Qualify companies with sufficient signals
      const hasStrongSignal = signals.some(s => s.signalStrength >= 0.5);
      if (hasStrongSignal || result.signalScore >= 0.3) {
        companyIdsToQualify.push(company.id);
        qualified++;
      }
    }

    // Batch-promote qualifying companies to 'qualified'
    if (companyIdsToQualify.length > 0) {
      await db
        .update(schema.companies)
        .set({
          pipelineStage: 'qualified',
          updatedAt: new Date(),
        })
        .where(inArray(schema.companies.id, companyIdsToQualify));
    }

    logger.info(
      { listId, processed: activeMembers.length, qualified, signalsDetected: totalSignals },
      'Company signal detection complete',
    );

    return {
      processed: activeMembers.length,
      qualified,
      signalsDetected: totalSignals,
    };
  }

  /**
   * Build a contact list from qualified companies in a source company list.
   * Searches for contacts matching the persona at each qualified company,
   * then creates a new contact list with those contacts as members.
   */
  async buildContactList(params: {
    clientId: string;
    sourceListId: string;
    contactListId: string;
    personaId: string;
  }): Promise<{ contactsAdded: number }> {
    const db = getDb();
    const log = logger.child({ sourceListId: params.sourceListId, contactListId: params.contactListId });

    // Load persona
    const [persona] = await db
      .select()
      .from(schema.personas)
      .where(eq(schema.personas.id, params.personaId));
    if (!persona) throw new NotFoundError('Persona', params.personaId);

    // Load qualified companies from source list
    const qualifiedMembers = await db
      .select({
        companyId: schema.listMembers.companyId,
        icpFitScore: schema.listMembers.icpFitScore,
        signalScore: schema.listMembers.signalScore,
        intelligenceScore: schema.listMembers.intelligenceScore,
      })
      .from(schema.listMembers)
      .innerJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
      .where(and(
        eq(schema.listMembers.listId, params.sourceListId),
        isNull(schema.listMembers.removedAt),
        eq(schema.companies.pipelineStage, 'qualified'),
      ));

    if (qualifiedMembers.length === 0) {
      log.info('No qualified companies to search for contacts');
      return { contactsAdded: 0 };
    }

    log.info({ qualifiedCompanies: qualifiedMembers.length }, 'Searching for contacts matching persona');

    const titlePatterns = persona.titlePatterns as string[];
    const seniorityLevels = persona.seniorityLevels as string[];
    const departments = persona.departments as string[];

    let contactsAdded = 0;

    for (const member of qualifiedMembers) {
      if (!member.companyId) continue;

      const contactConditions = [
        eq(schema.contacts.clientId, params.clientId),
        eq(schema.contacts.companyId, member.companyId),
      ];

      if (titlePatterns?.length) {
        contactConditions.push(
          or(...titlePatterns.map(p => {
            const sqlPattern = p.replace(/\*/g, '%');
            return ilike(schema.contacts.title, `%${sqlPattern}%`);
          }))!,
        );
      }

      if (seniorityLevels?.length) {
        contactConditions.push(inArray(schema.contacts.seniority, seniorityLevels));
      }

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
            listId: params.contactListId,
            contactId: contact.id,
            companyId: member.companyId,
            icpFitScore: member.icpFitScore,
            signalScore: member.signalScore,
            intelligenceScore: member.intelligenceScore,
            addedReason: `Persona: ${persona.name} | Title: ${contact.title}`,
          })
          .onConflictDoNothing();
        contactsAdded++;
      }
    }

    // Update contact list stats
    await db
      .update(schema.lists)
      .set({
        contactCount: contactsAdded,
        memberCount: contactsAdded,
        updatedAt: new Date(),
      })
      .where(eq(schema.lists.id, params.contactListId));

    log.info({ contactsAdded }, 'Contact list built');
    return { contactsAdded };
  }

  /**
   * Run persona-level signal detection on all contacts in a contact list.
   * Updates personaScore on each list member.
   */
  async runPersonaSignals(listId: string): Promise<{
    processed: number;
    signalsDetected: number;
  }> {
    const db = getDb();

    if (!this.personaSignalDetector) {
      throw new Error('PersonaSignalDetector not configured');
    }

    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, listId));
    if (!list) throw new NotFoundError('List', listId);

    // Load the persona associated with this list
    if (!list.personaId) {
      throw new Error('List has no persona — cannot run persona signals');
    }
    const [persona] = await db
      .select()
      .from(schema.personas)
      .where(eq(schema.personas.id, list.personaId));
    if (!persona) throw new NotFoundError('Persona', list.personaId);

    const personaContext = {
      name: persona.name,
      titlePatterns: (persona.titlePatterns as string[]) ?? [],
      seniorityLevels: (persona.seniorityLevels as string[]) ?? [],
      departments: (persona.departments as string[]) ?? [],
    };

    // Load contact list members
    const members = await db
      .select({
        memberId: schema.listMembers.id,
        contactId: schema.listMembers.contactId,
        contact: schema.contacts,
      })
      .from(schema.listMembers)
      .innerJoin(schema.contacts, eq(schema.listMembers.contactId, schema.contacts.id))
      .where(and(
        eq(schema.listMembers.listId, listId),
        isNull(schema.listMembers.removedAt),
      ));

    if (members.length === 0) {
      logger.info({ listId }, 'No contact members to run persona signals on');
      return { processed: 0, signalsDetected: 0 };
    }

    logger.info({ listId, members: members.length }, 'Running persona signal detection');

    let totalSignals = 0;

    for (const member of members) {
      if (!member.contactId || !member.contact) continue;

      const contactData = {
        id: member.contact.id,
        title: member.contact.title,
        seniority: member.contact.seniority,
        department: member.contact.department,
        employmentHistory: (member.contact.employmentHistory as EmploymentRecord[]) ?? [],
      };

      const signals = await this.personaSignalDetector.detectSignals(
        list.clientId,
        member.contact.id,
        contactData,
        personaContext,
      );

      totalSignals += signals.length;

      // Compute persona score and update list member
      const personaScore = this.personaSignalDetector.computePersonaScore(signals);
      await db
        .update(schema.listMembers)
        .set({
          personaScore: String(personaScore.toFixed(2)),
        })
        .where(eq(schema.listMembers.id, member.memberId));
    }

    logger.info(
      { listId, processed: members.length, signalsDetected: totalSignals },
      'Persona signal detection complete',
    );

    return {
      processed: members.length,
      signalsDetected: totalSignals,
    };
  }
}
