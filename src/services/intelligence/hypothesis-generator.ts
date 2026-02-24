import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { ClientProfileService } from './client-profile.js';
import { logger } from '../../lib/logger.js';

const VALID_DETECTION_METHODS = [
  'funding_data',
  'hiring_activity',
  'tech_stack_monitoring',
  'news_search',
  'website_content_analysis',
  'description_analysis',
  'webhook_external_feed',
] as const;

const HYPOTHESIS_GENERATION_PROMPT = `You are a B2B signal strategist. Generate testable hypotheses about what market signals indicate buying urgency for the described company's target market.

Each hypothesis must be a specific, actionable statement about a detectable market event that makes a company more likely to buy.

## Detection Capabilities

The system can automatically detect these signals during company enrichment:

- funding_data: Funding rounds, amounts, stages, and dates from company databases (Apollo, Crunchbase, Diffbot)
- hiring_activity: Headcount growth, job postings, hiring keywords from LinkedIn and job boards
- tech_stack_monitoring: Technologies used on company websites and career pages
- news_search: Expansion announcements, product launches, leadership changes, M&A via web search (Tavily, Exa)
- website_content_analysis: Product page changes, new features, messaging shifts via website scraping
- description_analysis: Pain points and competitive switching signals inferred by AI from company descriptions

External signals can also be fed via webhook (requires separate n8n/Zapier setup):
- webhook_external_feed: Regulatory changes, earnings reports, industry newsletters, custom alerts

## Rules

1. Generate exactly 8-12 hypotheses — no more, no fewer
2. Each hypothesis must be triggered by DIFFERENT underlying data — do not generate multiple hypotheses that would fire on the same signal (e.g. don't write 3 variations about funding rounds)
3. Strongly prefer auto-detectable methods (funding_data through description_analysis) over webhook_external_feed
4. Maximum 2 hypotheses may use webhook_external_feed
5. Each hypothesis should be specific to the client's industry and offering — avoid generic B2B platitudes
6. Before finalising, review your list and merge any hypotheses that overlap

For each hypothesis, provide:
- hypothesis: Clear, specific statement tied to a detectable event
- signalCategory: One of "regulatory", "economic", "technology", "competitive"
- detectionMethod: Exactly one of: "funding_data", "hiring_activity", "tech_stack_monitoring", "news_search", "website_content_analysis", "description_analysis", "webhook_external_feed"
- affectedSegments: Which ICP segments this affects
- priority: 1-10 where 1 is highest priority
- reasoning: One sentence on why this signal matters and how it connects to buying intent

Return ONLY a valid JSON array:
[
  {
    "hypothesis": "...",
    "signalCategory": "regulatory|economic|technology|competitive",
    "detectionMethod": "funding_data|hiring_activity|tech_stack_monitoring|news_search|website_content_analysis|description_analysis|webhook_external_feed",
    "affectedSegments": ["..."],
    "priority": 1,
    "reasoning": "..."
  }
]`;

export interface HypothesisFilters {
  status?: 'active' | 'paused' | 'retired';
  signalCategory?: 'regulatory' | 'economic' | 'technology' | 'competitive';
  icpId?: string;
}

export interface CreateHypothesisInput {
  clientId: string;
  icpId?: string;
  hypothesis: string;
  signalCategory: 'regulatory' | 'economic' | 'technology' | 'competitive';
  monitoringSources?: string[];
  affectedSegments?: string[];
  priority?: number;
}

export interface UpdateHypothesisInput {
  hypothesis?: string;
  signalCategory?: 'regulatory' | 'economic' | 'technology' | 'competitive';
  monitoringSources?: string[];
  affectedSegments?: string[];
  priority?: number;
  status?: 'active' | 'paused' | 'retired';
  validatedBy?: 'llm_generated' | 'human_validated' | 'human_created';
}

export class HypothesisGenerator {
  private anthropic: Anthropic;

  constructor(
    anthropicApiKey: string,
    private clientProfileService: ClientProfileService,
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  async generateHypotheses(clientId: string, icpId?: string): Promise<typeof schema.signalHypotheses.$inferSelect[]> {
    const log = logger.child({ clientId, icpId });
    log.info('Generating signal hypotheses');

    // Load context
    const profile = await this.clientProfileService.getProfile(clientId);
    const db = getDb();

    let icpData: typeof schema.icps.$inferSelect | undefined;
    if (icpId) {
      const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, icpId));
      icpData = icp;
    } else {
      // Get the first active ICP for this client
      const [icp] = await db
        .select()
        .from(schema.icps)
        .where(and(eq(schema.icps.clientId, clientId), eq(schema.icps.isActive, true)));
      icpData = icp;
    }

    // Build context for Claude
    const contextParts: string[] = [];

    if (profile) {
      contextParts.push(`## Company Profile`);
      if (profile.industry) contextParts.push(`Industry: ${profile.industry}`);
      if (profile.products?.length) contextParts.push(`Products: ${profile.products.join(', ')}`);
      if (profile.targetMarket) contextParts.push(`Target Market: ${profile.targetMarket}`);
      if (profile.competitors?.length) contextParts.push(`Competitors: ${profile.competitors.join(', ')}`);
      if (profile.valueProposition) contextParts.push(`Value Proposition: ${profile.valueProposition}`);
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

    // Get the client's own info
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
    if (client) {
      contextParts.push(`\n## Client Company`);
      contextParts.push(`Name: ${client.name}`);
      if (client.industry) contextParts.push(`Industry: ${client.industry}`);
      if (client.website) contextParts.push(`Website: ${client.website}`);
      if (client.notes) contextParts.push(`Notes: ${client.notes}`);
    }

    const contextMessage = contextParts.length > 0
      ? contextParts.join('\n')
      : 'No profile or ICP data available. Generate general B2B buying signal hypotheses.';

    log.info({ contextLength: contextMessage.length }, 'Calling Sonnet for hypothesis generation');

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: HYPOTHESIS_GENERATION_PROMPT,
      messages: [{ role: 'user', content: contextMessage }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('No text response from hypothesis generation');
    }

    let hypotheses: Array<{
      hypothesis: string;
      signalCategory: string;
      detectionMethod: string;
      affectedSegments: string[];
      priority: number;
      reasoning: string;
    }>;

    try {
      // Handle potential markdown code fences
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      hypotheses = JSON.parse(cleaned);
    } catch {
      log.error({ rawText: textBlock.text.substring(0, 200) }, 'Failed to parse hypothesis JSON');
      throw new Error('Failed to parse hypothesis generation response');
    }

    log.info({ count: hypotheses.length }, 'Hypotheses generated, persisting to DB');

    // Validate categories and detection methods
    const validCategories = ['regulatory', 'economic', 'technology', 'competitive'] as const;
    const validatedHypotheses = hypotheses.filter(h => {
      if (!validCategories.includes(h.signalCategory as typeof validCategories[number])) {
        log.warn({ hypothesis: h.hypothesis, category: h.signalCategory }, 'Invalid category, skipping');
        return false;
      }
      if (!VALID_DETECTION_METHODS.includes(h.detectionMethod as typeof VALID_DETECTION_METHODS[number])) {
        log.warn({ hypothesis: h.hypothesis, detectionMethod: h.detectionMethod }, 'Invalid detection method, defaulting to description_analysis');
        h.detectionMethod = 'description_analysis';
      }
      return true;
    });

    // Insert into DB — map detectionMethod to monitoringSources
    const inserted = await db
      .insert(schema.signalHypotheses)
      .values(
        validatedHypotheses.map(h => ({
          clientId,
          icpId: icpData?.id ?? null,
          hypothesis: h.hypothesis,
          signalCategory: h.signalCategory as typeof validCategories[number],
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

  async getHypotheses(clientId: string, filters?: HypothesisFilters) {
    const db = getDb();
    const conditions = [eq(schema.signalHypotheses.clientId, clientId)];

    if (filters?.status) {
      conditions.push(eq(schema.signalHypotheses.status, filters.status));
    }
    if (filters?.signalCategory) {
      conditions.push(eq(schema.signalHypotheses.signalCategory, filters.signalCategory));
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
    const [updated] = await db
      .update(schema.signalHypotheses)
      .set({
        ...data,
        updatedAt: new Date(),
      })
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
