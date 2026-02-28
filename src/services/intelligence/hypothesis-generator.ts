import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { ClientProfileService } from './client-profile.js';
import type { ClientProfileWebsiteData } from '../../db/schema/intelligence.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

// -- Valid detection methods per level --

const MARKET_DETECTION_METHODS = [
  'news_search',
  'webhook_external_feed',
  'website_content_analysis',
] as const;

const COMPANY_DETECTION_METHODS = [
  'funding_data',
  'hiring_activity',
  'tech_stack_monitoring',
  'news_search',
  'website_content_analysis',
  'description_analysis',
] as const;

const PERSONA_DETECTION_METHODS = [
  'employment_history',
  'title_analysis',
  'seniority_matching',
  'department_matching',
] as const;

// -- Valid categories per level --

const MARKET_CATEGORIES = ['regulatory', 'economic', 'industry', 'competitive'] as const;
const COMPANY_CATEGORIES = ['funding', 'hiring', 'tech_adoption', 'expansion', 'leadership', 'product_launch'] as const;
const PERSONA_CATEGORIES = ['job_change', 'title_match', 'seniority_match', 'tenure_signal'] as const;

const ALL_CATEGORIES = [...MARKET_CATEGORIES, ...COMPANY_CATEGORIES, ...PERSONA_CATEGORIES] as const;
type ValidCategory = typeof ALL_CATEGORIES[number];

// -- Prompts --

export const MARKET_HYPOTHESIS_PROMPT = `You are a B2B market signal strategist. Generate testable hypotheses about MACRO-LEVEL market events that indicate increased buying urgency across an entire market segment — NOT about individual companies.

Market signals are external events that affect many companies simultaneously:
- Regulatory changes (new legislation, compliance deadlines, policy shifts)
- Industry trends (market consolidation, emerging categories, sector growth/decline)
- Economic shifts (interest rate changes, funding climate, budget cycles)
- Competitive landscape changes (major acquisitions, new market entrants, category creation)

DO NOT include company-specific signals like "Company raises funding" or "Company is hiring engineers." Those belong at the company level.

## Detection Capabilities

Market signals are detected via:
- news_search: Industry news, regulatory announcements, analyst reports via web search
- webhook_external_feed: Regulatory feeds, earnings calendars, industry newsletters
- website_content_analysis: Industry association pages, government regulatory sites

## Rules

1. Generate exactly 4-6 hypotheses
2. Each hypothesis must describe a macro event affecting a SEGMENT, not a single company
3. Every hypothesis must include which ICP segments it affects
4. Strongly prefer auto-detectable methods (news_search) over webhook_external_feed
5. Maximum 1 hypothesis may use webhook_external_feed
6. Be specific to the client's industry and target market — no generic B2B platitudes

For each hypothesis, provide:
- hypothesis: Clear statement about a detectable macro event and why it creates buying urgency
- signalCategory: One of "regulatory", "economic", "industry", "competitive"
- detectionMethod: One of "news_search", "webhook_external_feed", "website_content_analysis"
- affectedSegments: Which ICP segments this affects
- priority: 1-10 (1 = highest)
- reasoning: One sentence on why this macro event creates buying intent across the segment

Return ONLY a valid JSON array:
[
  {
    "hypothesis": "...",
    "signalCategory": "regulatory|economic|industry|competitive",
    "detectionMethod": "news_search|webhook_external_feed|website_content_analysis",
    "affectedSegments": ["..."],
    "priority": 1,
    "reasoning": "..."
  }
]`;

export const COMPANY_HYPOTHESIS_PROMPT = `You are a B2B company signal strategist. Generate testable hypotheses about COMPANY-SPECIFIC events that indicate an individual company is likely to buy.

Company signals are detectable changes within a specific organisation:
- Funding events (new rounds, IPO filings, secondary funding)
- Hiring patterns (headcount surge, key role postings, department expansion)
- Technology adoption (new tools in stack, migration announcements, RFP signals)
- Organisational changes (leadership hires, restructuring, new divisions)
- Expansion signals (new offices, geographic expansion, M&A activity)
- Product launches or pivots (new product lines, market repositioning)

DO NOT include macro-market signals like "new regulation in the industry" or "economic downturn." Those belong at the market level.

## Detection Capabilities

Company signals are detected via:
- funding_data: Funding rounds from Apollo, Crunchbase, Diffbot
- hiring_activity: Headcount changes and job postings from LinkedIn/job boards
- tech_stack_monitoring: Technologies detected on websites and career pages
- news_search: Company-specific announcements, press releases, leadership changes
- website_content_analysis: Product page changes, messaging shifts, new features
- description_analysis: Pain points and competitive switching inferred by AI

## Rules

1. Generate exactly 4-6 hypotheses
2. Each hypothesis must describe a change detectable at the INDIVIDUAL COMPANY level
3. Each hypothesis should use a DIFFERENT detection method where possible
4. Be specific to the client's offering — how does each signal connect to buying intent?
5. Consider the ICP: what company-level changes would move an ICP-fit company from "interesting" to "actively needs our product"?

For each hypothesis, provide:
- hypothesis: Clear statement about a detectable company event and buying intent
- signalCategory: One of "funding", "hiring", "tech_adoption", "expansion", "leadership", "product_launch"
- detectionMethod: One of "funding_data", "hiring_activity", "tech_stack_monitoring", "news_search", "website_content_analysis", "description_analysis"
- affectedSegments: Which company characteristics this applies to
- priority: 1-10 (1 = highest)
- reasoning: Why this company-specific event signals buying readiness

Return ONLY a valid JSON array:
[
  {
    "hypothesis": "...",
    "signalCategory": "funding|hiring|tech_adoption|expansion|leadership|product_launch",
    "detectionMethod": "funding_data|hiring_activity|tech_stack_monitoring|news_search|website_content_analysis|description_analysis",
    "affectedSegments": ["..."],
    "priority": 1,
    "reasoning": "..."
  }
]`;

export const PERSONA_HYPOTHESIS_PROMPT = `You are a B2B buyer signal strategist. Generate testable hypotheses about PERSON-SPECIFIC events that indicate an individual contact within a target company is likely to be receptive to outreach.

Persona signals are detectable from contact enrichment data:
- Job changes: recently started a new role (< 6 months tenure = "new broom" effect)
- Title match: contact's title closely matches the target persona patterns
- Seniority alignment: contact is at the right seniority level for purchasing authority
- Tenure signals: long-tenured contacts may be entrenched; newly promoted contacts may be looking to make an impact

These are NOT company-level signals. "Company raised funding" is a company signal. "VP of Engineering just joined 3 months ago" is a persona signal.

## Detection Capabilities

What we can currently detect from enrichment data:
- employment_history: Job start dates, previous roles, career trajectory
- title_analysis: AI analysis of job title against persona patterns
- seniority_matching: Seniority level vs. persona requirements
- department_matching: Department vs. persona target departments

## Rules

1. Generate exactly 3-4 hypotheses
2. Each hypothesis must be detectable from contact enrichment data we already have (employment history, title, seniority, department, company tenure)
3. Do NOT hypothesise about social media activity, content downloads, or intent data — we cannot detect those yet
4. Consider the specific persona: what about THIS type of buyer's career trajectory signals readiness?

For each hypothesis, provide:
- hypothesis: Clear statement about a person-level signal and buying receptivity
- signalCategory: One of "job_change", "title_match", "seniority_match", "tenure_signal"
- detectionMethod: One of "employment_history", "title_analysis", "seniority_matching", "department_matching"
- affectedSegments: Which persona characteristics this applies to
- priority: 1-10 (1 = highest)
- reasoning: Why this person-level signal indicates openness to outreach

Return ONLY a valid JSON array:
[
  {
    "hypothesis": "...",
    "signalCategory": "job_change|title_match|seniority_match|tenure_signal",
    "detectionMethod": "employment_history|title_analysis|seniority_matching|department_matching",
    "affectedSegments": ["..."],
    "priority": 1,
    "reasoning": "..."
  }
]`;

// -- Register prompts --

registerPrompt({
  key: 'hypothesis.market.system',
  label: 'Market Hypothesis Generation',
  area: 'Signal Hypotheses',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for generating macro-level market signal hypotheses',
  defaultContent: MARKET_HYPOTHESIS_PROMPT,
});

registerPrompt({
  key: 'hypothesis.company.system',
  label: 'Company Hypothesis Generation',
  area: 'Signal Hypotheses',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for generating company-level signal hypotheses',
  defaultContent: COMPANY_HYPOTHESIS_PROMPT,
});

registerPrompt({
  key: 'hypothesis.persona.system',
  label: 'Persona Hypothesis Generation',
  area: 'Signal Hypotheses',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for generating persona-level signal hypotheses',
  defaultContent: PERSONA_HYPOTHESIS_PROMPT,
});

// -- Types --

export type SignalLevel = 'market' | 'company' | 'persona';
export type SignalCategory =
  | 'regulatory' | 'economic' | 'industry' | 'competitive'       // Market
  | 'funding' | 'hiring' | 'tech_adoption' | 'expansion' | 'leadership' | 'product_launch' // Company
  | 'job_change' | 'title_match' | 'seniority_match' | 'tenure_signal'; // Persona

export interface HypothesisFilters {
  status?: 'active' | 'paused' | 'retired';
  signalCategory?: SignalCategory;
  signalLevel?: SignalLevel;
  icpId?: string;
}

export interface CreateHypothesisInput {
  clientId: string;
  icpId?: string;
  hypothesis: string;
  signalLevel: SignalLevel;
  signalCategory: SignalCategory;
  monitoringSources?: string[];
  affectedSegments?: string[];
  priority?: number;
}

export interface UpdateHypothesisInput {
  hypothesis?: string;
  signalCategory?: SignalCategory;
  monitoringSources?: string[];
  affectedSegments?: string[];
  priority?: number;
  status?: 'active' | 'paused' | 'retired';
  validatedBy?: 'llm_generated' | 'human_validated' | 'human_created';
}

// -- Raw LLM output shape --

interface RawHypothesis {
  hypothesis: string;
  signalCategory: string;
  detectionMethod: string;
  affectedSegments: string[];
  priority: number;
  reasoning: string;
}

// -- Service --

export class HypothesisGenerator {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(
    anthropicClient: Anthropic,
    private clientProfileService: ClientProfileService,
  ) {
    this.anthropic = anthropicClient;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  // ── Context builders ──────────────────────────────────────────────

  private async buildBaseContext(clientId: string, icpId?: string) {
    const profile = await this.clientProfileService.getProfile(clientId);
    const db = getDb();

    let icpData: typeof schema.icps.$inferSelect | undefined;
    if (icpId) {
      const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, icpId));
      icpData = icp;
    } else {
      const [icp] = await db
        .select()
        .from(schema.icps)
        .where(and(eq(schema.icps.clientId, clientId), eq(schema.icps.isActive, true)));
      icpData = icp;
    }

    const contextParts: string[] = [];
    let websiteData: ClientProfileWebsiteData | undefined;

    if (profile) {
      contextParts.push(`## Company Profile`);
      if (profile.industry) contextParts.push(`Industry: ${profile.industry}`);
      if (profile.products?.length) contextParts.push(`Products: ${profile.products.join(', ')}`);
      if (profile.targetMarket) contextParts.push(`Target Market: ${profile.targetMarket}`);
      if (profile.competitors?.length) contextParts.push(`Competitors: ${profile.competitors.join(', ')}`);
      if (profile.valueProposition) contextParts.push(`Value Proposition: ${profile.valueProposition}`);

      // Include enriched website intelligence
      websiteData = profile.websiteData as ClientProfileWebsiteData | undefined;
      if (websiteData) {
        if (websiteData.geographies?.length) {
          contextParts.push(`Geographies Served: ${websiteData.geographies.join(', ')}`);
        }
        // Target audience with case study evidence
        if (websiteData.targetAudience) {
          if (typeof websiteData.targetAudience === 'string') {
            contextParts.push(`Target Audience: ${websiteData.targetAudience}`);
          } else {
            if (websiteData.targetAudience.description) {
              contextParts.push(`Target Audience: ${websiteData.targetAudience.description}`);
            }
            if (websiteData.targetAudience.evidenceFromCaseStudies?.length) {
              contextParts.push(`Evidence from Case Studies/Customers: ${websiteData.targetAudience.evidenceFromCaseStudies.join(', ')}`);
            }
            if (websiteData.targetAudience.buyerPersonas?.length) {
              contextParts.push(`Known Buyer Personas: ${websiteData.targetAudience.buyerPersonas.join(', ')}`);
            }
          }
        }
      }
    }

    if (icpData) {
      contextParts.push(`\n## Ideal Customer Profile: ${icpData.name}`);
      if (icpData.description) contextParts.push(`Description: ${icpData.description}`);
      if (icpData.naturalLanguageInput) contextParts.push(`ICP Definition: ${icpData.naturalLanguageInput}`);

      const filters = icpData.filters;
      if (filters.industries?.length) contextParts.push(`Target Industries: ${filters.industries.join(', ')}`);
      if (filters.countries?.length) contextParts.push(`Target Countries: ${filters.countries.join(', ')}`);
      if (filters.techStack?.length) contextParts.push(`Tech Stack: ${filters.techStack.join(', ')}`);
      if (filters.keywords?.length) contextParts.push(`Keywords: ${filters.keywords.join(', ')}`);
      if (filters.fundingStages?.length) contextParts.push(`Funding Stages: ${filters.fundingStages.join(', ')}`);
      if (filters.employeeCountMin || filters.employeeCountMax) {
        contextParts.push(`Employee Count: ${filters.employeeCountMin ?? 0} - ${filters.employeeCountMax ?? 'unlimited'}`);
      }
    }

    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
    if (client) {
      contextParts.push(`\n## Client Company`);
      contextParts.push(`Name: ${client.name}`);
      if (client.industry) contextParts.push(`Industry: ${client.industry}`);
      if (client.website) contextParts.push(`Website: ${client.website}`);
      if (client.notes) contextParts.push(`Notes: ${client.notes}`);
    }

    return { contextParts, icpData, websiteData };
  }

  // ── LLM call + parse ──────────────────────────────────────────────

  private async resolvePrompt(key: string, fallback: string): Promise<string> {
    if (this.promptConfig) {
      try { return await this.promptConfig.getPrompt(key); } catch { /* use fallback */ }
    }
    return fallback;
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<RawHypothesis[]> {
    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('No text response from hypothesis generation');
    }

    try {
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      logger.error({ rawText: textBlock.text.substring(0, 200) }, 'Failed to parse hypothesis JSON');
      throw new Error('Failed to parse hypothesis generation response');
    }
  }

  // ── Validate + persist ────────────────────────────────────────────

  private async persistHypotheses(
    clientId: string,
    icpId: string | null,
    signalLevel: SignalLevel,
    raw: RawHypothesis[],
    validCategories: readonly string[],
    validDetectionMethods: readonly string[],
    defaultDetectionMethod: string,
  ) {
    const log = logger.child({ clientId, signalLevel });

    const validated = raw.filter(h => {
      if (!validCategories.includes(h.signalCategory)) {
        log.warn({ hypothesis: h.hypothesis, category: h.signalCategory }, 'Invalid category, skipping');
        return false;
      }
      if (!validDetectionMethods.includes(h.detectionMethod)) {
        log.warn({ hypothesis: h.hypothesis, detectionMethod: h.detectionMethod }, `Invalid detection method, defaulting to ${defaultDetectionMethod}`);
        h.detectionMethod = defaultDetectionMethod;
      }
      return true;
    });

    if (validated.length === 0) {
      log.warn('No valid hypotheses after filtering');
      return [];
    }

    const db = getDb();
    const inserted = await db
      .insert(schema.signalHypotheses)
      .values(
        validated.map(h => ({
          clientId,
          icpId,
          signalLevel: signalLevel as typeof signalLevel,
          hypothesis: h.hypothesis,
          signalCategory: h.signalCategory as ValidCategory,
          monitoringSources: [h.detectionMethod],
          affectedSegments: h.affectedSegments,
          priority: Math.max(1, Math.min(10, h.priority)),
          status: 'active' as const,
          validatedBy: 'llm_generated' as const,
          metadata: { reasoning: h.reasoning, detectionMethod: h.detectionMethod },
        })),
      )
      .returning();

    log.info({ inserted: inserted.length }, 'Signal hypotheses persisted');
    return inserted;
  }

  // ── Generation methods ────────────────────────────────────────────

  async generateMarketHypotheses(clientId: string, icpId?: string): Promise<typeof schema.signalHypotheses.$inferSelect[]> {
    const log = logger.child({ clientId, icpId, signalLevel: 'market' });
    log.info('Generating market-level hypotheses');

    const { contextParts, icpData, websiteData } = await this.buildBaseContext(clientId, icpId);

    // Inject strategic JTBD — tells the LLM what macro events exacerbate buying urgency
    if (websiteData?.strategicJTBD?.length) {
      contextParts.push(`\n## Strategic JTBD (what high-level challenges this company solves, and what conditions would exacerbate them)`);
      for (const jtbd of websiteData.strategicJTBD) {
        contextParts.push(`- Goal: ${jtbd.goal}`);
        if (jtbd.exacerbatingConditions?.length) {
          contextParts.push(`  Exacerbating conditions: ${jtbd.exacerbatingConditions.join('; ')}`);
        }
      }
    }

    const contextMessage = contextParts.length > 0
      ? contextParts.join('\n')
      : 'No profile or ICP data available. Generate general B2B market signal hypotheses.';

    const systemPrompt = await this.resolvePrompt('hypothesis.market.system', MARKET_HYPOTHESIS_PROMPT);
    const raw = await this.callLLM(systemPrompt, contextMessage);
    log.info({ count: raw.length }, 'Market hypotheses generated from LLM');

    return this.persistHypotheses(
      clientId,
      icpData?.id ?? null,
      'market',
      raw,
      MARKET_CATEGORIES,
      MARKET_DETECTION_METHODS,
      'news_search',
    );
  }

  async generateCompanyHypotheses(clientId: string, icpId?: string): Promise<typeof schema.signalHypotheses.$inferSelect[]> {
    const log = logger.child({ clientId, icpId, signalLevel: 'company' });
    log.info('Generating company-level hypotheses');

    const { contextParts, icpData, websiteData } = await this.buildBaseContext(clientId, icpId);

    // Inject company triggers — internal events that signal buying need
    if (websiteData?.companyTriggers?.length) {
      contextParts.push(`\n## Likely Company Triggers (internal events that would make a prospect need this product)`);
      for (const trigger of websiteData.companyTriggers) {
        contextParts.push(`- ${trigger}`);
      }
    }

    const contextMessage = contextParts.length > 0
      ? contextParts.join('\n')
      : 'No profile or ICP data available. Generate general B2B company signal hypotheses.';

    const companySystemPrompt = await this.resolvePrompt('hypothesis.company.system', COMPANY_HYPOTHESIS_PROMPT);
    const raw = await this.callLLM(companySystemPrompt, contextMessage);
    log.info({ count: raw.length }, 'Company hypotheses generated from LLM');

    return this.persistHypotheses(
      clientId,
      icpData?.id ?? null,
      'company',
      raw,
      COMPANY_CATEGORIES,
      COMPANY_DETECTION_METHODS,
      'description_analysis',
    );
  }

  async generatePersonaHypotheses(clientId: string, icpId?: string, personaId?: string): Promise<typeof schema.signalHypotheses.$inferSelect[]> {
    const log = logger.child({ clientId, icpId, personaId, signalLevel: 'persona' });
    log.info('Generating persona-level hypotheses');

    const { contextParts, icpData, websiteData } = await this.buildBaseContext(clientId, icpId);

    // Inject persona JTBD — individual-level challenges the product solves
    if (websiteData?.personaJTBD?.length) {
      contextParts.push(`\n## Persona-level JTBD (challenges/goals the client helps individual personas with)`);
      for (const pjtbd of websiteData.personaJTBD) {
        contextParts.push(`- Persona: ${pjtbd.persona}`);
        if (pjtbd.goals?.length) contextParts.push(`  Goals: ${pjtbd.goals.join('; ')}`);
        if (pjtbd.painPoints?.length) contextParts.push(`  Pain Points: ${pjtbd.painPoints.join('; ')}`);
      }
    }

    // Load persona data
    if (personaId) {
      const db = getDb();
      const [persona] = await db.select().from(schema.personas).where(eq(schema.personas.id, personaId));
      if (persona) {
        contextParts.push(`\n## Target Persona: ${persona.name}`);
        if (persona.description) contextParts.push(`Description: ${persona.description}`);
        if (persona.titlePatterns?.length) contextParts.push(`Titles: ${persona.titlePatterns.join(', ')}`);
        if (persona.seniorityLevels?.length) contextParts.push(`Seniority: ${persona.seniorityLevels.join(', ')}`);
        if (persona.departments?.length) contextParts.push(`Departments: ${persona.departments.join(', ')}`);
      }
    }

    const contextMessage = contextParts.length > 0
      ? contextParts.join('\n')
      : 'No profile, ICP, or persona data available. Generate general B2B persona signal hypotheses.';

    const personaSystemPrompt = await this.resolvePrompt('hypothesis.persona.system', PERSONA_HYPOTHESIS_PROMPT);
    const raw = await this.callLLM(personaSystemPrompt, contextMessage);
    log.info({ count: raw.length }, 'Persona hypotheses generated from LLM');

    return this.persistHypotheses(
      clientId,
      icpData?.id ?? null,
      'persona',
      raw,
      PERSONA_CATEGORIES,
      PERSONA_DETECTION_METHODS,
      'title_analysis',
    );
  }

  // ── CRUD methods ──────────────────────────────────────────────────

  async getHypotheses(clientId: string, filters?: HypothesisFilters) {
    const db = getDb();
    const conditions = [eq(schema.signalHypotheses.clientId, clientId)];

    if (filters?.status) {
      conditions.push(eq(schema.signalHypotheses.status, filters.status));
    }
    if (filters?.signalCategory) {
      conditions.push(eq(schema.signalHypotheses.signalCategory, filters.signalCategory));
    }
    if (filters?.signalLevel) {
      conditions.push(eq(schema.signalHypotheses.signalLevel, filters.signalLevel));
    }
    if (filters?.icpId) {
      conditions.push(eq(schema.signalHypotheses.icpId, filters.icpId));
    }

    return db
      .select()
      .from(schema.signalHypotheses)
      .where(and(...conditions))
      .orderBy(schema.signalHypotheses.priority);
  }

  async getHypothesisById(id: string) {
    const db = getDb();
    const [hypothesis] = await db
      .select()
      .from(schema.signalHypotheses)
      .where(eq(schema.signalHypotheses.id, id));
    return hypothesis ?? null;
  }

  async createHypothesis(input: CreateHypothesisInput) {
    const db = getDb();
    const [created] = await db
      .insert(schema.signalHypotheses)
      .values({
        clientId: input.clientId,
        icpId: input.icpId ?? null,
        signalLevel: input.signalLevel,
        hypothesis: input.hypothesis,
        signalCategory: input.signalCategory,
        monitoringSources: input.monitoringSources ?? [],
        affectedSegments: input.affectedSegments ?? [],
        priority: input.priority ?? 5,
        status: 'active',
        validatedBy: 'human_created',
      })
      .returning();
    return created;
  }

  async updateHypothesis(id: string, data: UpdateHypothesisInput) {
    const db = getDb();
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.hypothesis !== undefined) updateData.hypothesis = data.hypothesis;
    if (data.monitoringSources !== undefined) updateData.monitoringSources = data.monitoringSources;
    if (data.affectedSegments !== undefined) updateData.affectedSegments = data.affectedSegments;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.validatedBy !== undefined) updateData.validatedBy = data.validatedBy;
    if (data.signalCategory !== undefined) updateData.signalCategory = data.signalCategory;

    const [updated] = await db
      .update(schema.signalHypotheses)
      .set(updateData)
      .where(eq(schema.signalHypotheses.id, id))
      .returning();
    return updated ?? null;
  }

  async deleteHypothesis(id: string) {
    const db = getDb();
    await db.delete(schema.signalHypotheses).where(eq(schema.signalHypotheses.id, id));
  }

  async bulkUpdateStatus(ids: string[], status: 'active' | 'paused' | 'retired') {
    const db = getDb();
    await db
      .update(schema.signalHypotheses)
      .set({ status, updatedAt: new Date() })
      .where(inArray(schema.signalHypotheses.id, ids));
  }
}
