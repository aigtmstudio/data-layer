import Anthropic from '@anthropic-ai/sdk';
import type { SourceOrchestrator } from '../source-orchestrator/index.js';
import type { EnrichmentPipeline } from '../enrichment/index.js';
import type { CompanySearchParams, UnifiedCompany } from '../../providers/types.js';
import type { IcpFilters, ProviderSearchHints } from '../../db/schema/icps.js';
import { scoreCompanyFit } from '../icp-engine/scorer.js';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

// Domains that are platforms/social sites, not actual companies.
// Results with these domains are noise from search providers.
const BLOCKED_DOMAINS = new Set([
  'linktr.ee', 'linktree.com',
  'facebook.com', 'fb.com',
  'instagram.com',
  'twitter.com', 'x.com',
  'linkedin.com',
  'youtube.com', 'youtu.be',
  'tiktok.com',
  'pinterest.com',
  'reddit.com',
  'yelp.com',
  'tripadvisor.com',
  'wikipedia.org',
  'crunchbase.com',
  'glassdoor.com',
  'indeed.com',
  'medium.com',
  'substack.com',
  'github.com',
  'about.me',
  'bit.ly',
  'goo.gl',
  'magnet.me',
  'wordpress.com',
  'blogspot.com',
  'wixsite.com',
  'squarespace.com',
  'weebly.com',
  'tumblr.com',
  'google.com',
]);

export function isBlockedDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const lower = domain.toLowerCase().replace(/^www\./, '');
  // Check exact match and parent domain (e.g. "en.wikipedia.org" → "wikipedia.org")
  if (BLOCKED_DOMAINS.has(lower)) return true;
  const parts = lower.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (BLOCKED_DOMAINS.has(parent)) return true;
  }
  // Also block country-specific variants (glassdoor.co.uk, yelp.co.uk, etc.)
  if (parts.length > 2) {
    const baseName = parts.slice(0, -2).join('.');
    const parentDomain = baseName.split('.').pop();
    if (parentDomain && BLOCKED_DOMAINS.has(parentDomain + '.com')) return true;
  }
  return false;
}

/**
 * Filter out results that aren't actual companies.
 * Exa (web search) sometimes returns directory pages, review aggregators,
 * industry association pages, or generic list pages.
 */
const NON_COMPANY_PATTERNS = [
  /^companies\b/i,           // "Companies & Reviews", "Companies in..."
  /\bcompanies\s+(in|&|and)\b/i,
  /\b(review|rating)s?\b/i,  // Review/rating aggregator pages
  /\blist\s+of\b/i,          // "List of restaurants in..."
  /\btop\s+\d+\b/i,          // "Top 10 hospitality..."
  /\bbest\s+\d+\b/i,         // "Best 50 restaurants..."
  /\bdirectory\b/i,          // Directories
  /\bassociation\b/i,        // Industry associations
  /\bfederation\b/i,         // Industry federations
  /\bcouncil\b/i,            // Industry councils (not companies)
  /\bawards?\b/i,            // "Restaurant & Bar Design Awards"
  /\bjobs?\s+(in|at|for)\b/i, // Job listing pages
  /\bcareers?\s+(in|at)\b/i,
];

function isPlausibleCompany(company: UnifiedCompany): boolean {
  // Companies without domains are suspicious but might be from AI discovery
  if (!company.domain && !company.name) return false;

  const name = company.name ?? '';

  // Check if the name looks like a non-company result
  for (const pattern of NON_COMPANY_PATTERNS) {
    if (pattern.test(name)) {
      logger.debug({ name, domain: company.domain }, 'Filtered non-company result');
      return false;
    }
  }

  return true;
}

export interface DiscoveryResult {
  companiesDiscovered: number;
  companiesScored: number;
  companiesAdded: number;
  contactsFound: number;
  providersUsed: string[];
  totalCost: number;
  warnings?: string[];
}

export const AI_DISCOVERY_PROMPT = `List {{limit}} real companies that match this ideal customer profile. Only include companies you are confident actually exist.

Filters:
{{filters}}

Return ONLY a JSON array of objects with "name" and "domain" fields. Example:
[{"name": "Pfizer", "domain": "pfizer.com"}, {"name": "Johnson & Johnson", "domain": "jnj.com"}]

Rules:
- Only real, currently operating companies
- Include the company's primary website domain (not linkedin or wikipedia)
- Focus on well-known companies that clearly match the criteria
- No duplicates`;

registerPrompt({
  key: 'discovery.ai.user',
  label: 'AI Company Discovery',
  area: 'Company Discovery',
  promptType: 'user',
  model: 'claude-sonnet-4-20250514',
  description: 'User prompt template for AI-powered company discovery fallback. Use {{limit}} and {{filters}} placeholders.',
  defaultContent: AI_DISCOVERY_PROMPT,
});

export class CompanyDiscoveryService {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(
    private orchestrator: SourceOrchestrator,
    private enrichment: EnrichmentPipeline,
    anthropicApiKey: string,
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  async discoverAndPopulate(params: {
    clientId: string;
    icpId: string;
    personaId?: string;
    limit?: number;
    jobId?: string;
  }): Promise<DiscoveryResult> {
    const db = getDb();
    const limit = params.limit ?? 100;
    const warnings: string[] = [];

    // 1. Load ICP
    const [icp] = await db
      .select()
      .from(schema.icps)
      .where(eq(schema.icps.id, params.icpId));
    if (!icp) throw new Error(`ICP not found: ${params.icpId}`);

    const filters = icp.filters as IcpFilters;
    let providerHints = (icp.providerHints as ProviderSearchHints | null) ?? filters.providerHints;

    // Auto-generate provider hints from filters if none exist.
    // Without hints, search providers (e.g. Exa) have no semantic query to work with.
    if (!providerHints || (!providerHints.semanticSearchQuery && !providerHints.keywordSearchTerms?.length)) {
      const parts: string[] = [];
      if (filters.industries?.length) parts.push(filters.industries.join(', '));
      if (filters.keywords?.length) parts.push(filters.keywords.join(', '));
      if (filters.countries?.length) parts.push(`in ${filters.countries.join(', ')}`);
      if (filters.employeeCountMin || filters.employeeCountMax) {
        parts.push(`${filters.employeeCountMin ?? 1}-${filters.employeeCountMax ?? '10000+'} employees`);
      }
      if (parts.length > 0) {
        providerHints = {
          ...providerHints,
          semanticSearchQuery: `Companies in ${parts.join(', ')}`,
          keywordSearchTerms: [...(filters.industries ?? []), ...(filters.keywords ?? [])],
        };
        logger.info({ icpId: params.icpId, generatedHints: providerHints }, 'Auto-generated provider hints from ICP filters');
      }
    }

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
    const { result: discovered, providersUsed, totalCost, skippedDueToCredits } =
      await this.orchestrator.searchCompanies(params.clientId, searchParams);

    let companies = (discovered ?? []).filter(c => !isBlockedDomain(c.domain));
    const blockedCount = (discovered?.length ?? 0) - companies.length;
    if (blockedCount > 0) {
      logger.info({ blockedCount }, 'Filtered out companies with blocked domains (social/platform sites)');
    }
    logger.info(
      { count: companies.length, providersUsed, totalCost, skippedDueToCredits },
      'Companies discovered from providers',
    );

    if (skippedDueToCredits && skippedDueToCredits > 0) {
      warnings.push(`${skippedDueToCredits} data provider(s) skipped due to insufficient credits. Add credits in Settings to use provider-powered discovery.`);
    }

    // 3b. Fallback: if no search providers returned results, use AI to suggest companies
    // then try to enrich via providers (if credits available), otherwise use AI data as-is
    if (companies.length === 0) {
      logger.warn(
        { providersUsed, skippedDueToCredits },
        'No companies from provider search — falling back to AI-powered discovery',
      );
      if (params.jobId) {
        await db
          .update(schema.jobs)
          .set({ output: { phase: 'ai_discovery', warnings }, updatedAt: new Date() })
          .where(eq(schema.jobs.id, params.jobId));
      }

      const aiCompanies = await this.discoverViaAI(filters, providerHints, limit);
      if (aiCompanies.length > 0) {
        // Try to enrich each AI-suggested company via providers for better data
        const enriched: UnifiedCompany[] = [];
        const unenriched: UnifiedCompany[] = [];
        for (const suggestion of aiCompanies) {
          if (!suggestion.domain) continue;
          try {
            const { result } = await this.orchestrator.enrichCompany(
              params.clientId,
              { domain: suggestion.domain, name: suggestion.name },
            );
            if (result) {
              enriched.push(result);
              continue;
            }
          } catch (err) {
            logger.debug({ domain: suggestion.domain, error: err }, 'Failed to enrich AI-suggested company');
          }
          // Enrichment failed or was skipped (e.g. no credits) — use AI data as-is
          unenriched.push({
            name: suggestion.name,
            domain: suggestion.domain,
            websiteUrl: `https://${suggestion.domain}`,
            externalIds: {},
          });
        }
        companies = [...enriched, ...unenriched];
        if (!providersUsed.includes('ai_discovery')) providersUsed.push('ai_discovery');
        logger.info(
          { suggested: aiCompanies.length, enriched: enriched.length, unenriched: unenriched.length },
          'AI discovery complete',
        );
      }
    }

    if (companies.length === 0) {
      warnings.push('No companies found from any source. Check your ICP filters and credit balance.');
      if (params.jobId) {
        await db
          .update(schema.jobs)
          .set({
            processedItems: 0,
            totalItems: 0,
            output: { companiesDiscovered: 0, companiesAdded: 0, warnings },
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
        warnings,
      };
    }

    // 4. Filter out non-company results (directories, review sites, associations)
    {
      const before = companies.length;
      companies = companies.filter(c => isPlausibleCompany(c));
      if (before > companies.length) {
        logger.info({ filtered: before - companies.length }, 'Filtered non-company results');
      }
    }

    // 5. Apply ICP exclusion filters
    const excludedDomains = new Set(
      (filters.excludeDomains ?? []).map(d => d.toLowerCase().replace(/^www\./, '')),
    );
    if (excludedDomains.size > 0) {
      const before = companies.length;
      companies = companies.filter(c => {
        if (!c.domain) return true;
        return !excludedDomains.has(c.domain.toLowerCase().replace(/^www\./, ''));
      });
      if (before > companies.length) {
        logger.info({ excluded: before - companies.length }, 'Filtered companies by ICP excludeDomains');
      }
    }

    // Apply excludeIndustries if set
    if (filters.excludeIndustries?.length) {
      const before = companies.length;
      const lowerExclude = filters.excludeIndustries.map(i => i.toLowerCase());
      companies = companies.filter(c => {
        if (!c.industry) return true; // Keep companies with unknown industry
        const ci = c.industry.toLowerCase();
        return !lowerExclude.some(ex => ci.includes(ex) || ex.includes(ci));
      });
      if (before > companies.length) {
        logger.info({ excluded: before - companies.length }, 'Filtered companies by ICP excludeIndustries');
      }
    }

    // 6. Enrich sparse companies BEFORE upsert so DB gets enriched data.
    // Companies from Exa only have name + domain — enrich via Apollo to get
    // industry, employee count, country etc. for proper scoring and display.
    const sparseCompanies = companies.filter(c =>
      c.domain && !c.industry && !c.employeeCount && !c.country,
    );
    if (sparseCompanies.length > 0) {
      const enrichLimit = Math.min(sparseCompanies.length, limit);
      logger.info(
        { sparse: sparseCompanies.length, enriching: enrichLimit },
        'Enriching sparse companies before upsert',
      );

      if (params.jobId) {
        await db
          .update(schema.jobs)
          .set({ output: { phase: 'enriching_sparse', sparseCount: sparseCompanies.length, warnings }, updatedAt: new Date() })
          .where(eq(schema.jobs.id, params.jobId));
      }

      let enriched = 0;
      for (const company of sparseCompanies.slice(0, enrichLimit)) {
        try {
          const { result: enrichedData, providersUsed: enrichProviders } = await this.orchestrator.enrichCompany(
            params.clientId,
            { domain: company.domain, name: company.name },
          );
          if (enrichedData) {
            if (enrichedData.name && !company.externalIds.exa) company.name = enrichedData.name;
            if (enrichedData.industry && !company.industry) company.industry = enrichedData.industry;
            if (enrichedData.employeeCount && !company.employeeCount) company.employeeCount = enrichedData.employeeCount;
            if (enrichedData.country && !company.country) company.country = enrichedData.country;
            if (enrichedData.annualRevenue && !company.annualRevenue) company.annualRevenue = enrichedData.annualRevenue;
            if (enrichedData.foundedYear && !company.foundedYear) company.foundedYear = enrichedData.foundedYear;
            if (enrichedData.latestFundingStage && !company.latestFundingStage) company.latestFundingStage = enrichedData.latestFundingStage;
            if (enrichedData.techStack?.length && !company.techStack?.length) company.techStack = enrichedData.techStack;
            if (enrichedData.employeeRange && !company.employeeRange) company.employeeRange = enrichedData.employeeRange;
            if (enrichedData.description && !company.description) company.description = enrichedData.description;
            if (enrichedData.city && !company.city) company.city = enrichedData.city;
            if (enrichedData.state && !company.state) company.state = enrichedData.state;
            if (enrichedData.linkedinUrl && !company.linkedinUrl) company.linkedinUrl = enrichedData.linkedinUrl;
            // Merge externalIds from enrichment provider
            Object.assign(company.externalIds, enrichedData.externalIds);
            enriched++;
          }
        } catch (err) {
          logger.debug({ domain: company.domain, error: err }, 'Failed to enrich sparse company');
        }
      }

      logger.info({ enriched, attempted: enrichLimit }, 'Sparse company enrichment complete');
    }

    // 7. Deduplicate against existing DB companies
    const existingDomains = new Set<string>();
    if (companies.some(c => c.domain)) {
      const existing = await db
        .select({ domain: schema.companies.domain })
        .from(schema.companies)
        .where(eq(schema.companies.clientId, params.clientId));
      for (const row of existing) {
        if (row.domain) existingDomains.add(row.domain.toLowerCase());
      }
    }

    const newCompanies = companies.filter(c => {
      if (!c.domain) return true;
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

    // 8. Upsert discovered companies into DB (now with enriched data)
    let upserted = 0;
    for (const company of newCompanies) {
      await this.upsertDiscoveredCompany(params.clientId, company);
      upserted++;

      if (params.jobId && upserted % 10 === 0) {
        await db
          .update(schema.jobs)
          .set({ processedItems: upserted, updatedAt: new Date() })
          .where(eq(schema.jobs.id, params.jobId));
      }
    }

    // 9. Score all discovered companies (new + existing)
    // Note: these companies already matched provider search criteria so we use a low threshold
    const scoredCompanies = companies
      .map(c => ({ company: c, ...scoreCompanyFit(c, filters) }))
      .filter(c => c.score >= 0.2) // Low threshold — companies already matched provider search filters
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    logger.info(
      { discovered: companies.length, scored: scoredCompanies.length },
      'Scoring complete',
    );

    // 8. Optionally enrich top companies for better data (contacts, emails)
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
      warnings: warnings.length > 0 ? warnings : undefined,
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

    // Pass semantic search query through for providers like Exa
    if (hints?.semanticSearchQuery) params.query = hints.semanticSearchQuery;

    // Merge keywords from both filters and provider hints
    const keywords: string[] = [];
    if (filters.keywords?.length) keywords.push(...filters.keywords);
    if (hints?.keywordSearchTerms?.length) keywords.push(...hints.keywordSearchTerms);
    if (keywords.length) params.keywords = [...new Set(keywords)];

    return params;
  }

  private async discoverViaAI(
    filters: IcpFilters,
    hints: ProviderSearchHints | undefined,
    limit: number,
  ): Promise<Array<{ name: string; domain: string }>> {
    const filterDesc: string[] = [];
    if (filters.industries?.length) filterDesc.push(`Industries: ${filters.industries.join(', ')}`);
    if (filters.employeeCountMin || filters.employeeCountMax)
      filterDesc.push(`Employees: ${filters.employeeCountMin ?? 'any'}-${filters.employeeCountMax ?? 'any'}`);
    if (filters.revenueMin || filters.revenueMax)
      filterDesc.push(`Revenue: $${filters.revenueMin ?? 0}-$${filters.revenueMax ?? 'any'}`);
    if (filters.countries?.length) filterDesc.push(`Countries: ${filters.countries.join(', ')}`);
    if (filters.states?.length) filterDesc.push(`States: ${filters.states.join(', ')}`);
    if (filters.cities?.length) filterDesc.push(`Cities: ${filters.cities.join(', ')}`);
    if (filters.techStack?.length) filterDesc.push(`Tech stack: ${filters.techStack.join(', ')}`);
    if (filters.fundingStages?.length) filterDesc.push(`Funding stages: ${filters.fundingStages.join(', ')}`);
    if (filters.keywords?.length) filterDesc.push(`Keywords: ${filters.keywords.join(', ')}`);
    if (hints?.keywordSearchTerms?.length) filterDesc.push(`Search terms: ${hints.keywordSearchTerms.join(', ')}`);

    let promptTemplate = AI_DISCOVERY_PROMPT;
    if (this.promptConfig) {
      try { promptTemplate = await this.promptConfig.getPrompt('discovery.ai.user'); } catch { /* use default */ }
    }
    const prompt = promptTemplate
      .replace('{{limit}}', String(Math.min(limit, 50)))
      .replace('{{filters}}', filterDesc.join('\n'));

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      // Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('AI discovery returned no parseable JSON');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{ name: string; domain: string }>;
      const valid = parsed.filter(c => c.name && c.domain && !isBlockedDomain(c.domain));
      logger.info({ count: valid.length }, 'AI suggested companies');
      return valid;
    } catch (error) {
      logger.error({ error }, 'AI discovery failed');
      return [];
    }
  }

  private async upsertDiscoveredCompany(
    clientId: string,
    data: UnifiedCompany,
  ): Promise<{ id: string }> {
    const db = getDb();
    const now = new Date();

    // Infer which providers actually contributed data for THIS company
    const companySources: string[] = [];
    if (data.externalIds.apollo) companySources.push('apollo');
    if (data.externalIds.exa) companySources.push('exa');
    if (data.externalIds.leadmagic) companySources.push('leadmagic');
    if (companySources.length === 0) companySources.push('ai_discovery');

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
      techStack: data.techStack?.length ? data.techStack : undefined,
      logoUrl: data.logoUrl,
      description: data.description,
      phone: data.phone,
      sources: companySources.map(p => ({
        source: p,
        fetchedAt: now.toISOString(),
        fieldsProvided: [] as string[],
      })),
      primarySource: companySources[0],
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
        // Only update fields that have data — don't overwrite existing enriched fields with empty values
        const updateFields: Record<string, unknown> = { updatedAt: now };
        for (const [key, value] of Object.entries(dbFields)) {
          if (value !== undefined && value !== null && key !== 'updatedAt') {
            updateFields[key] = value;
          }
        }
        await db.update(schema.companies).set(updateFields).where(eq(schema.companies.id, existing[0].id));
        return existing[0];
      }
    }

    const [inserted] = await db
      .insert(schema.companies)
      .values({ clientId, ...dbFields, techStack: dbFields.techStack ?? [] })
      .returning({ id: schema.companies.id });
    return inserted;
  }
}
