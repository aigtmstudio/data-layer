import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, gte } from 'drizzle-orm';
import type { IcpFilters } from '../../db/schema/icps.js';
import type { StrategyData } from '../../db/schema/intelligence.js';
import { PROVIDER_PROFILES, SIGNAL_DEFINITIONS } from './provider-knowledge.js';
import type { ProviderPerformanceTracker, ProviderStats } from './provider-performance-tracker.js';
import type { ClientProfileService } from './client-profile.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

const STRATEGY_TTL_HOURS = 24;

export const STRATEGY_PROMPT = `You are an AI strategist for a B2B data enrichment platform. Your job is to analyze the client's situation and determine the optimal strategy for building a prospect list.

You have access to 13 data providers, each with different strengths, costs, and data characteristics. Your goal is to select and prioritize providers to:
1. Maximize data quality and completeness
2. Prioritize original/uncommon data (leads less likely to be in every SDR's outbox)
3. Detect strong buying signals and intent
4. Minimize costs while maintaining quality

Return ONLY valid JSON matching this schema:
{
  "providerPlan": [
    { "provider": "provider_name", "priority": 1, "reason": "why this provider first" }
  ],
  "signalPriorities": [
    { "signalType": "signal_name", "weight": 0.0-1.0 }
  ],
  "originalityWeight": 0.0-1.0,
  "scoringWeights": {
    "icpFit": 0.0-1.0,
    "signals": 0.0-1.0,
    "originality": 0.0-1.0,
    "costEfficiency": 0.0-1.0
  },
  "maxBudgetPerCompany": number (in credits),
  "reasoning": "Brief explanation of strategy"
}

Rules:
- scoringWeights must sum to 1.0
- providerPlan should include 3-6 providers, ordered by priority
- Only include providers from the available list
- Consider the client's industry and market dynamics when selecting providers
- For commodity industries (e.g., SaaS selling to SaaS), increase originalityWeight
- For niche industries, prioritize providers with deep knowledge graph data
- Always explain your reasoning`;

registerPrompt({
  key: 'strategy.generation.system',
  label: 'Strategy Generation',
  area: 'Strategy',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for determining optimal provider strategy for list building',
  defaultContent: STRATEGY_PROMPT,
});

export class StrategyGenerator {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(
    anthropicApiKey: string,
    private profileService: ClientProfileService,
    private performanceTracker: ProviderPerformanceTracker,
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  async generateStrategy(
    clientId: string,
    icpId: string,
    personaId?: string,
    availableProviders?: string[],
  ): Promise<StrategyData> {
    const log = logger.child({ clientId, icpId });

    // Check cache first
    const cached = await this.getCachedStrategy(clientId, icpId, personaId);
    if (cached) {
      log.info('Using cached strategy');
      return cached;
    }

    // Gather context
    const db = getDb();

    const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, icpId));
    if (!icp) throw new Error(`ICP not found: ${icpId}`);

    const clientProfile = await this.profileService.getProfile(clientId);
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));

    let persona = null;
    if (personaId) {
      const [p] = await db.select().from(schema.personas).where(eq(schema.personas.id, personaId));
      persona = p ?? null;
    }

    // Get historical provider performance for this client
    const perfStats = await this.performanceTracker.getProviderStats(clientId);

    // Build the context prompt
    const contextPrompt = this.buildContextPrompt(
      client,
      clientProfile,
      icp.filters as IcpFilters,
      persona,
      perfStats,
      availableProviders ?? Object.keys(PROVIDER_PROFILES),
    );

    // Generate strategy via Claude
    log.info('Generating strategy via Claude');
    const strategy = await this.callLlm(contextPrompt);

    // Cache the strategy
    const contextHash = this.computeContextHash(clientId, icpId, personaId);
    await this.cacheStrategy(clientId, icpId, personaId, contextHash, strategy);

    return strategy;
  }

  private buildContextPrompt(
    client: { name: string; industry?: string | null; website?: string | null } | undefined,
    clientProfile: { industry?: string | null; products?: unknown; targetMarket?: string | null; competitors?: unknown; valueProposition?: string | null } | null,
    icpFilters: IcpFilters,
    persona: { titlePatterns?: unknown; seniorityLevels?: unknown; departments?: unknown } | null,
    perfStats: ProviderStats[],
    availableProviders: string[],
  ): string {
    const sections: string[] = [];

    // Client context
    sections.push('## Client');
    sections.push(`Name: ${client?.name ?? 'Unknown'}`);
    if (client?.industry) sections.push(`Industry: ${client.industry}`);
    if (clientProfile?.products) {
      const products = clientProfile.products as string[];
      if (products.length > 0) sections.push(`Products: ${products.join(', ')}`);
    }
    if (clientProfile?.targetMarket) sections.push(`Target market: ${clientProfile.targetMarket}`);
    if (clientProfile?.valueProposition) sections.push(`Value prop: ${clientProfile.valueProposition}`);
    if (clientProfile?.competitors) {
      const competitors = clientProfile.competitors as string[];
      if (competitors.length > 0) sections.push(`Competitors: ${competitors.join(', ')}`);
    }

    // ICP
    sections.push('\n## Ideal Customer Profile');
    if (icpFilters.industries?.length) sections.push(`Industries: ${icpFilters.industries.join(', ')}`);
    if (icpFilters.employeeCountMin || icpFilters.employeeCountMax) {
      sections.push(`Company size: ${icpFilters.employeeCountMin ?? 1}-${icpFilters.employeeCountMax ?? '10000+'} employees`);
    }
    if (icpFilters.countries?.length) sections.push(`Countries: ${icpFilters.countries.join(', ')}`);
    if (icpFilters.techStack?.length) sections.push(`Tech stack: ${icpFilters.techStack.join(', ')}`);
    if (icpFilters.fundingStages?.length) sections.push(`Funding stages: ${icpFilters.fundingStages.join(', ')}`);
    if (icpFilters.keywords?.length) sections.push(`Keywords: ${icpFilters.keywords.join(', ')}`);

    // Persona
    if (persona) {
      sections.push('\n## Target Persona');
      const titles = persona.titlePatterns as string[];
      if (titles?.length) sections.push(`Title patterns: ${titles.join(', ')}`);
      const seniority = persona.seniorityLevels as string[];
      if (seniority?.length) sections.push(`Seniority: ${seniority.join(', ')}`);
      const depts = persona.departments as string[];
      if (depts?.length) sections.push(`Departments: ${depts.join(', ')}`);
    }

    // Available providers with profiles
    sections.push('\n## Available Data Providers');
    for (const name of availableProviders) {
      const profile = PROVIDER_PROFILES[name];
      if (!profile) continue;
      sections.push(`\n### ${profile.displayName} (${name})`);
      sections.push(`- Best for: ${profile.bestOperations.join(', ')}`);
      sections.push(`- Strong industries: ${profile.strongIndustries.join(', ')}`);
      sections.push(`- Commonality: ${(profile.commonalityScore * 100).toFixed(0)}% (higher = more saturated data)`);
      sections.push(`- Cost tier: ${profile.costTier}`);
      sections.push(`- Strengths: ${profile.uniqueStrengths.join('; ')}`);
      sections.push(`- Detectable signals: ${profile.detectableSignals.join(', ') || 'none'}`);
    }

    // Historical performance
    if (perfStats.length > 0) {
      sections.push('\n## Historical Performance (this client, last 30 days)');
      for (const stat of perfStats) {
        sections.push(`- ${stat.providerName}: avg quality ${(stat.avgQualityScore * 100).toFixed(0)}%, avg ${stat.avgFieldsPopulated.toFixed(1)} fields, ${stat.totalCalls} calls`);
      }
    }

    // Signal types
    sections.push('\n## Available Signal Types');
    for (const [type, def] of Object.entries(SIGNAL_DEFINITIONS)) {
      sections.push(`- ${type}: ${def.description} (default weight: ${def.defaultWeight})`);
    }

    return sections.join('\n');
  }

  private async callLlm(contextPrompt: string): Promise<StrategyData> {
    let strategyPrompt = STRATEGY_PROMPT;
    if (this.promptConfig) {
      try { strategyPrompt = await this.promptConfig.getPrompt('strategy.generation.system'); } catch { /* use default */ }
    }

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: strategyPrompt,
      messages: [{ role: 'user', content: contextPrompt }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('Empty response from strategy LLM');

    const parsed = JSON.parse(textBlock.text) as StrategyData;

    // Validate and normalize
    if (!parsed.providerPlan?.length) throw new Error('Strategy missing providerPlan');
    if (!parsed.scoringWeights) throw new Error('Strategy missing scoringWeights');

    // Normalize scoring weights to sum to 1
    const total = parsed.scoringWeights.icpFit + parsed.scoringWeights.signals +
      parsed.scoringWeights.originality + parsed.scoringWeights.costEfficiency;
    if (total > 0 && Math.abs(total - 1) > 0.01) {
      parsed.scoringWeights.icpFit /= total;
      parsed.scoringWeights.signals /= total;
      parsed.scoringWeights.originality /= total;
      parsed.scoringWeights.costEfficiency /= total;
    }

    return parsed;
  }

  private computeContextHash(clientId: string, icpId: string, personaId?: string): string {
    const input = `${clientId}:${icpId}:${personaId ?? 'none'}`;
    return createHash('sha256').update(input).digest('hex').slice(0, 32);
  }

  private async getCachedStrategy(
    clientId: string,
    icpId: string,
    personaId?: string,
  ): Promise<StrategyData | null> {
    const db = getDb();
    const contextHash = this.computeContextHash(clientId, icpId, personaId);
    const now = new Date();

    const [cached] = await db
      .select()
      .from(schema.strategies)
      .where(and(
        eq(schema.strategies.clientId, clientId),
        eq(schema.strategies.contextHash, contextHash),
        gte(schema.strategies.expiresAt, now),
      ))
      .limit(1);

    return cached ? cached.strategy as StrategyData : null;
  }

  private async cacheStrategy(
    clientId: string,
    icpId: string,
    personaId: string | undefined,
    contextHash: string,
    strategy: StrategyData,
  ): Promise<void> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + STRATEGY_TTL_HOURS * 60 * 60 * 1000);

    await db
      .insert(schema.strategies)
      .values({
        clientId,
        icpId,
        personaId,
        contextHash,
        strategy,
        expiresAt,
      })
      .onConflictDoNothing();
  }
}
