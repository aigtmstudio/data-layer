import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';
import type { ExaProvider } from '../../providers/exa/index.js';
import type { TavilyProvider } from '../../providers/tavily/index.js';
import type { MarketSignalProcessor } from './market-signal-processor.js';

export const QUERY_GENERATION_PROMPT = `Given a market signal hypothesis, generate 1-2 concise search queries to find recent news evidence that would validate or invalidate this hypothesis.

Each query should be specific enough to find relevant news articles from the last 30 days.
Focus on current events, not background information.
Include the current year/month where relevant to anchor queries to recent content.

Return ONLY a valid JSON array of 1-2 search query strings.
Example: ["EU AI Act enforcement timeline 2025", "AI regulation compliance requirements enterprise SaaS"]`;

registerPrompt({
  key: 'signal.market.query_generation.system',
  label: 'Market Signal Query Generation',
  area: 'Signal Detection',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for generating news search queries from market signal hypotheses',
  defaultContent: QUERY_GENERATION_PROMPT,
});

export const BROAD_TRENDING_PROMPT = `Given a client's ICP (Ideal Customer Profile) data, generate 2-4 broad search queries to find trending news and social discussions in their target market.

These queries should NOT be about specific hypotheses — instead they should capture:
- Breaking news in the ICP's industries
- Trending discussions among the ICP's target personas
- Recent developments related to the ICP's key topics/keywords

Use the current date to anchor queries to very recent content.
Include industry-specific terminology from the ICP keywords.

Return ONLY a valid JSON array of 2-4 search query strings.
Example: ["fintech regulatory changes 2026", "enterprise SaaS buyer sentiment shift", "UK B2B tech growth trends"]`;

registerPrompt({
  key: 'signal.market.broad_trending.system',
  label: 'Broad Trending Query Generation',
  area: 'Signal Detection',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for generating ICP-driven broad trending queries',
  defaultContent: BROAD_TRENDING_PROMPT,
});

export interface EvidenceSearchResult {
  hypothesesSearched: number;
  searchesPerformed: number;
  signalsIngested: number;
  trendingSearchesPerformed?: number;
  trendingSignalsIngested?: number;
}

export class MarketSignalSearcher {
  private anthropic: Anthropic;
  private exaProvider?: ExaProvider;
  private tavilyProvider?: TavilyProvider;
  private marketSignalProcessor: MarketSignalProcessor;
  private promptConfig?: PromptConfigService;
  private log = logger.child({ service: 'market-signal-searcher' });

  constructor(
    anthropicClient: Anthropic,
    marketSignalProcessor: MarketSignalProcessor,
    providers: { exa?: ExaProvider; tavily?: TavilyProvider },
  ) {
    this.anthropic = anthropicClient;
    this.marketSignalProcessor = marketSignalProcessor;
    this.exaProvider = providers.exa;
    this.tavilyProvider = providers.tavily;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  /**
   * Search for real-world evidence for active market hypotheses.
   * For each hypothesis, generates search queries and ingests results as market signals.
   * Skips hypotheses searched within the cooldown window (default 24h).
   * Deduplicates results against existing signals by sourceUrl.
   */
  async searchForEvidence(
    clientId: string,
    options?: { hypothesisIds?: string[]; maxSearchesPerHypothesis?: number; cooldownHours?: number },
  ): Promise<EvidenceSearchResult> {
    const db = getDb();
    const maxSearches = options?.maxSearchesPerHypothesis ?? 2;
    const cooldownHours = options?.cooldownHours ?? 24;
    const result: EvidenceSearchResult = { hypothesesSearched: 0, searchesPerformed: 0, signalsIngested: 0 };

    // Load active market hypotheses
    const conditions = [
      eq(schema.signalHypotheses.clientId, clientId),
      eq(schema.signalHypotheses.signalLevel, 'market'),
      eq(schema.signalHypotheses.status, 'active'),
    ];

    let hypotheses = await db
      .select()
      .from(schema.signalHypotheses)
      .where(and(...conditions))
      .orderBy(schema.signalHypotheses.priority);

    if (options?.hypothesisIds?.length) {
      hypotheses = hypotheses.filter(h => options.hypothesisIds!.includes(h.id));
    }

    if (hypotheses.length === 0) {
      this.log.info({ clientId }, 'No active market hypotheses found');
      return result;
    }

    // Skip hypotheses searched within the cooldown window
    const cooldownCutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const beforeCount = hypotheses.length;
    hypotheses = hypotheses.filter(h => !h.lastSearchedAt || h.lastSearchedAt < cooldownCutoff);

    if (hypotheses.length < beforeCount) {
      this.log.info(
        { skipped: beforeCount - hypotheses.length, remaining: hypotheses.length, cooldownHours },
        'Skipped recently-searched hypotheses',
      );
    }

    if (hypotheses.length === 0) {
      this.log.info({ clientId }, 'All hypotheses searched within cooldown window');
      return result;
    }

    // Pre-load existing sourceUrls for this client to deduplicate
    const existingSignals = await db
      .select({ sourceUrl: schema.marketSignals.sourceUrl })
      .from(schema.marketSignals)
      .where(eq(schema.marketSignals.clientId, clientId));
    const existingUrls = new Set(existingSignals.map(s => s.sourceUrl).filter((u): u is string => !!u));

    this.log.info({ count: hypotheses.length, existingUrls: existingUrls.size, clientId }, 'Searching for evidence');

    // Process hypotheses in parallel (concurrency of 3 to respect rate limits)
    const CONCURRENCY = 3;
    for (let i = 0; i < hypotheses.length; i += CONCURRENCY) {
      const batch = hypotheses.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (hypothesis) => {
          const queries = await this.generateSearchQueries(hypothesis, maxSearches);
          let searched = 0;
          let ingested = 0;

          for (const query of queries) {
            const count = await this.executeSearch(clientId, query, hypothesis.id, existingUrls);
            searched++;
            ingested += count;
          }

          // Update lastSearchedAt
          await db
            .update(schema.signalHypotheses)
            .set({ lastSearchedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.signalHypotheses.id, hypothesis.id));

          return { searched, ingested };
        }),
      );

      for (const settled of batchResults) {
        result.hypothesesSearched++;
        if (settled.status === 'fulfilled') {
          result.searchesPerformed += settled.value.searched;
          result.signalsIngested += settled.value.ingested;
        } else {
          this.log.error({ error: settled.reason }, 'Failed to search for hypothesis evidence');
        }
      }
    }

    // ── Broad Trending Searches (ICP-driven, not hypothesis-driven) ──
    try {
      const trendingQueries = await this.generateBroadTrendingQueries(clientId, 4);
      this.log.info({ count: trendingQueries.length }, 'Generated broad trending queries');

      let trendingSearches = 0;
      let trendingIngested = 0;

      for (const query of trendingQueries) {
        const count = await this.executeSearch(
          clientId, query, null, existingUrls,
          { categories: ['news', 'tweet'], sourceSuffix: 'trending' },
        );
        trendingSearches++;
        trendingIngested += count;
      }

      result.trendingSearchesPerformed = trendingSearches;
      result.trendingSignalsIngested = trendingIngested;
      result.searchesPerformed += trendingSearches;
      result.signalsIngested += trendingIngested;
    } catch (error) {
      this.log.error({ error }, 'Broad trending search failed');
    }

    this.log.info(result, 'Evidence search complete');
    return result;
  }

  private async generateSearchQueries(
    hypothesis: { hypothesis: string; signalCategory: string; affectedSegments: unknown },
    maxQueries: number,
  ): Promise<string[]> {
    let systemPrompt = QUERY_GENERATION_PROMPT;
    if (this.promptConfig) {
      try {
        systemPrompt = await this.promptConfig.getPrompt('signal.market.query_generation.system');
      } catch { /* use default */ }
    }

    const segments = Array.isArray(hypothesis.affectedSegments)
      ? hypothesis.affectedSegments.join(', ')
      : '';

    const today = new Date().toISOString().split('T')[0];
    const userMessage = `Today's date: ${today}

Hypothesis: ${hypothesis.hypothesis}
Category: ${hypothesis.signalCategory}
Affected Segments: ${segments}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock?.text) return [];

    try {
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      const queries = JSON.parse(cleaned) as string[];
      return Array.isArray(queries) ? queries.slice(0, maxQueries) : [];
    } catch {
      this.log.warn({ text: textBlock.text }, 'Failed to parse search queries');
      return [];
    }
  }

  private async executeSearch(
    clientId: string,
    query: string,
    hypothesisId: string | null,
    existingUrls?: Set<string>,
    options?: { categories?: ('news' | 'tweet')[]; sourceSuffix?: string },
  ): Promise<number> {
    const log = this.log.child({ query, hypothesisId });
    const categories = options?.categories ?? ['news', 'tweet'];
    const suffix = options?.sourceSuffix ?? 'search';

    // Calculate 30-day lookback
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalIngested = 0;

    // Search Exa across requested categories (news + tweets)
    if (this.exaProvider) {
      for (const category of categories) {
        try {
          const response = await this.exaProvider.searchNews({
            query,
            numResults: category === 'tweet' ? 3 : 5,
            startPublishedDate: thirtyDaysAgo,
            category,
          });

          if (response.results?.length > 0) {
            const signals = response.results
              .filter(r => !r.url || !existingUrls?.has(r.url))
              .map(r => ({
                clientId,
                headline: r.title ?? query,
                summary: r.text?.slice(0, 500),
                sourceUrl: r.url,
                sourceName: `exa_${category}_${suffix}`,
                rawData: { hypothesisId, searchQuery: query, exaScore: r.score, category },
                detectedAt: r.publishedDate,
              }));

            if (signals.length > 0) {
              for (const s of signals) {
                if (s.sourceUrl) existingUrls?.add(s.sourceUrl);
              }
              await this.marketSignalProcessor.ingestBatch(signals);
            }
            totalIngested += signals.length;
            log.info({ count: signals.length, filtered: response.results.length - signals.length, provider: 'exa', category }, 'Ingested search results');
          }
        } catch (error) {
          log.warn({ error, category }, `Exa ${category} search failed`);
        }
      }
    }

    // Tavily fallback — news only, only if no Exa results and news was requested
    if (totalIngested === 0 && categories.includes('news') && this.tavilyProvider) {
      try {
        const response = await this.tavilyProvider.searchNews({ query, maxResults: 5, days: 30 });

        if (response.results?.length > 0) {
          const signals = response.results
            .filter(r => !r.url || !existingUrls?.has(r.url))
            .map(r => ({
              clientId,
              headline: r.title ?? query,
              summary: r.content?.slice(0, 500),
              sourceUrl: r.url,
              sourceName: `tavily_news_${suffix}`,
              rawData: { hypothesisId, searchQuery: query, tavilyScore: r.score },
              detectedAt: r.published_date,
            }));

          if (signals.length > 0) {
            for (const s of signals) {
              if (s.sourceUrl) existingUrls?.add(s.sourceUrl);
            }
            await this.marketSignalProcessor.ingestBatch(signals);
          }
          totalIngested += signals.length;
          log.info({ count: signals.length, filtered: response.results.length - signals.length, provider: 'tavily' }, 'Ingested search results');
        }
      } catch (error) {
        log.error({ error }, 'Tavily news search also failed');
      }
    }

    if (totalIngested === 0) {
      log.warn('No search provider available or no results found');
    }
    return totalIngested;
  }

  // ── Broad Trending Search ──

  private async generateBroadTrendingQueries(
    clientId: string,
    maxQueries: number,
  ): Promise<string[]> {
    const db = getDb();

    const icps = await db
      .select()
      .from(schema.icps)
      .where(and(
        eq(schema.icps.clientId, clientId),
        eq(schema.icps.isActive, true),
      ));

    if (icps.length === 0) {
      this.log.info({ clientId }, 'No active ICPs for broad trending search');
      return [];
    }

    const allKeywords: string[] = [];
    const allIndustries: string[] = [];
    const semanticQueries: string[] = [];

    for (const icp of icps) {
      const filters = icp.filters as Record<string, unknown> | null;
      if (filters?.keywords) allKeywords.push(...(filters.keywords as string[]));
      if (filters?.industries) allIndustries.push(...(filters.industries as string[]));
      const hints = filters?.providerHints as Record<string, unknown> | null;
      if (hints?.semanticSearchQuery) semanticQueries.push(hints.semanticSearchQuery as string);
      if (hints?.keywordSearchTerms) allKeywords.push(...(hints.keywordSearchTerms as string[]));
    }

    const uniqueKeywords = [...new Set(allKeywords)];
    const uniqueIndustries = [...new Set(allIndustries)];

    if (uniqueKeywords.length === 0 && uniqueIndustries.length === 0 && semanticQueries.length === 0) {
      this.log.info({ clientId }, 'ICP data too sparse for broad trending queries');
      return [];
    }

    let systemPrompt = BROAD_TRENDING_PROMPT;
    if (this.promptConfig) {
      try {
        systemPrompt = await this.promptConfig.getPrompt('signal.market.broad_trending.system');
      } catch { /* use default */ }
    }

    const today = new Date().toISOString().split('T')[0];
    const userMessage = `Today's date: ${today}

ICP Industries: ${uniqueIndustries.join(', ') || 'N/A'}
ICP Keywords: ${uniqueKeywords.join(', ') || 'N/A'}
Semantic Descriptions: ${semanticQueries.join('; ') || 'N/A'}
ICP Segments: ${icps.map(i => `${i.name}: ${i.description ?? 'No description'}`).join('\n')}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock?.text) return [];

    try {
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      const queries = JSON.parse(cleaned) as string[];
      return Array.isArray(queries) ? queries.slice(0, maxQueries) : [];
    } catch {
      this.log.warn({ text: textBlock.text }, 'Failed to parse broad trending queries');
      return [];
    }
  }
}
