import type { SourceOrchestrator } from '../source-orchestrator/index.js';
import type { UnifiedCompany, UnifiedContact } from '../../providers/types.js';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import type { SourceRecord } from '../../db/schema/companies.js';

export class EnrichmentPipeline {
  constructor(private orchestrator: SourceOrchestrator) {}

  async enrichCompanies(
    clientId: string,
    domains: string[],
    jobId: string,
    options?: {
      discoverContacts?: boolean;
      findEmails?: boolean;
      verifyEmails?: boolean;
      personaFilters?: { titlePatterns?: string[]; seniorityLevels?: string[]; departments?: string[] };
    },
  ): Promise<void> {
    const db = getDb();
    const opts = {
      discoverContacts: true,
      findEmails: true,
      verifyEmails: true,
      ...options,
    };

    await db
      .update(schema.jobs)
      .set({ status: 'running', startedAt: new Date(), totalItems: domains.length })
      .where(eq(schema.jobs.id, jobId));

    let processed = 0;
    let failed = 0;

    for (const domain of domains) {
      try {
        // Step 1: Enrich company
        const { result: company, providersUsed } = await this.orchestrator.enrichCompany(
          clientId, { domain },
        );
        if (!company) {
          failed++;
          continue;
        }

        const companyRecord = await this.upsertCompany(clientId, company, providersUsed);

        // Step 2: Discover contacts
        if (opts.discoverContacts) {
          const { result: people } = await this.orchestrator.searchPeople(clientId, {
            companyDomains: [domain],
            titlePatterns: opts.personaFilters?.titlePatterns,
            seniorityLevels: opts.personaFilters?.seniorityLevels,
            departments: opts.personaFilters?.departments,
          });

          for (const person of people ?? []) {
            // Step 3: Find email
            if (opts.findEmails && person.firstName && person.lastName && !person.workEmail) {
              const emailResult = await this.orchestrator.findEmail(clientId, {
                firstName: person.firstName,
                lastName: person.lastName,
                companyDomain: domain,
              });
              if (emailResult.result) {
                person.workEmail = emailResult.result.email;
              }
            }

            // Step 4: Verify email
            let verificationStatus: string = 'unverified';
            if (opts.verifyEmails && person.workEmail) {
              const verifyResult = await this.orchestrator.verifyEmail(clientId, {
                email: person.workEmail,
              });
              if (verifyResult.result) {
                verificationStatus = verifyResult.result.status;
              }
            }

            await this.upsertContact(clientId, companyRecord.id, person, verificationStatus);
          }
        }

        processed++;
      } catch (error) {
        failed++;
        logger.error({ error, domain, jobId }, 'Enrichment failed for domain');

        await db
          .update(schema.jobs)
          .set({
            errors: [
              ...(await this.getJobErrors(jobId)),
              { item: domain, error: String(error), timestamp: new Date().toISOString() },
            ],
          })
          .where(eq(schema.jobs.id, jobId));
      }

      // Update progress
      await db
        .update(schema.jobs)
        .set({ processedItems: processed, failedItems: failed, updatedAt: new Date() })
        .where(eq(schema.jobs.id, jobId));
    }

    await db
      .update(schema.jobs)
      .set({
        status: failed === domains.length ? 'failed' : 'completed',
        processedItems: processed,
        failedItems: failed,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));
  }

  private async upsertCompany(
    clientId: string,
    data: UnifiedCompany,
    providersUsed: string[],
  ) {
    const db = getDb();
    const now = new Date();
    const sources: SourceRecord[] = providersUsed.map(p => ({
      source: p,
      fetchedAt: now.toISOString(),
      fieldsProvided: [],
    }));

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
      sources,
      primarySource: providersUsed[0],
      apolloId: data.externalIds.apollo,
      leadmagicId: data.externalIds.leadmagic,
      lastEnrichedAt: now,
      updatedAt: now,
    };

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

  private async upsertContact(
    clientId: string,
    companyId: string,
    data: UnifiedContact,
    verificationStatus: string,
  ) {
    const db = getDb();
    const now = new Date();

    const dbFields = {
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: data.fullName ?? [data.firstName, data.lastName].filter(Boolean).join(' '),
      linkedinUrl: data.linkedinUrl,
      photoUrl: data.photoUrl,
      title: data.title,
      seniority: data.seniority,
      department: data.department,
      companyName: data.companyName,
      companyDomain: data.companyDomain,
      workEmail: data.workEmail,
      personalEmail: data.personalEmail,
      emailVerificationStatus: verificationStatus as 'unverified' | 'valid' | 'invalid' | 'catch_all' | 'unknown',
      emailVerifiedAt: verificationStatus !== 'unverified' ? now : undefined,
      phone: data.phone,
      mobilePhone: data.mobilePhone,
      city: data.city,
      state: data.state,
      country: data.country,
      employmentHistory: data.employmentHistory ?? [],
      apolloId: data.externalIds.apollo,
      leadmagicId: data.externalIds.leadmagic,
      prospeoId: data.externalIds.prospeo,
      lastEnrichedAt: now,
      updatedAt: now,
    };

    // Dedupe by LinkedIn URL or email within same client
    if (data.linkedinUrl) {
      const existing = await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(and(eq(schema.contacts.clientId, clientId), eq(schema.contacts.linkedinUrl, data.linkedinUrl)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(schema.contacts).set(dbFields).where(eq(schema.contacts.id, existing[0].id));
        return existing[0];
      }
    }

    const [inserted] = await db
      .insert(schema.contacts)
      .values({ clientId, companyId, ...dbFields, sources: [] })
      .returning({ id: schema.contacts.id });
    return inserted;
  }

  /**
   * Discover contacts at specified company domains.
   * Unlike enrichCompanies, this does NOT re-enrich the companies or manage job state.
   * Searches broadly by domain (no persona filters at the API level) to maximise
   * discovery, then the caller filters contacts by persona criteria locally.
   */
  async discoverContacts(
    clientId: string,
    companies: Array<{ companyId: string; domain: string }>,
    options?: {
      findEmails?: boolean;
    },
  ): Promise<{ contactsDiscovered: number; companiesSearched: number }> {
    const opts = { findEmails: true, ...options };
    let contactsDiscovered = 0;
    let companiesSearched = 0;

    for (const { companyId, domain } of companies) {
      try {
        // Search broadly by domain only — persona filtering is done locally by the caller
        const { result: people, providersUsed } = await this.orchestrator.searchPeople(clientId, {
          companyDomains: [domain],
        });

        logger.info(
          { domain, companyId, peopleFound: people?.length ?? 0, providersUsed },
          'People search result',
        );

        for (const person of people ?? []) {
          if (opts.findEmails && person.firstName && person.lastName && !person.workEmail) {
            const emailResult = await this.orchestrator.findEmail(clientId, {
              firstName: person.firstName,
              lastName: person.lastName,
              companyDomain: domain,
            });
            if (emailResult.result) {
              person.workEmail = emailResult.result.email;
            }
          }

          await this.upsertContact(clientId, companyId, person, 'unverified');
          contactsDiscovered++;
        }

        companiesSearched++;
      } catch (error) {
        logger.error({ error, domain, companyId }, 'Contact discovery failed for domain');
      }
    }

    logger.info({ contactsDiscovered, companiesSearched }, 'Contact discovery complete');
    return { contactsDiscovered, companiesSearched };
  }

  private async getJobErrors(jobId: string) {
    const db = getDb();
    const [job] = await db
      .select({ errors: schema.jobs.errors })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId));
    return (job?.errors as Array<{ item: string; error: string; timestamp: string }>) ?? [];
  }
}
