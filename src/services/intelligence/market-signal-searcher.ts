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

export interface EvidenceSearchResult {
  hypothesesSearched: number;
  searchesPerformed: number;
  signalsIngested: number;
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

    const userMessage = `Hypothesis: ${hypothesis.hypothesis}
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
    hypothesisId: string,
    existingUrls?: Set<string>,
  ): Promise<number> {
    const log = this.log.child({ query, hypothesisId });

    // Calculate 30-day lookback
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Try Exa first, then Tavily
    if (this.exaProvider) {
      try {
        const response = await this.exaProvider.searchNews({
          query,
          numResults: 5,
          startPublishedDate: thirtyDaysAgo,
        });

        if (response.results?.length > 0) {
          const signals = response.results
            .filter(r => !r.url || !existingUrls?.has(r.url))
            .map(r => ({
              clientId,
              headline: r.title ?? query,
              summary: r.text?.slice(0, 500),
              sourceUrl: r.url,
              sourceName: 'exa_news_search',
              rawData: { hypothesisId, searchQuery: query, exaScore: r.score },
              detectedAt: r.publishedDate,
            }));

          if (signals.length > 0) {
            // Add to dedup set for subsequent searches in this run
            for (const s of signals) {
              if (s.sourceUrl) existingUrls?.add(s.sourceUrl);
            }
            await this.marketSignalProcessor.ingestBatch(signals);
          }
          log.info({ count: signals.length, filtered: response.results.length - signals.length, provider: 'exa' }, 'Ingested search results');
          return signals.length;
        }
      } catch (error) {
        log.warn({ error }, 'Exa news search failed, trying Tavily');
      }
    }

    // Fallback to Tavily
    if (this.tavilyProvider) {
      try {
        const response = await this.tavilyProvider.searchNews({ query, maxResults: 5 });

        if (response.results?.length > 0) {
          const signals = response.results
            .filter(r => !r.url || !existingUrls?.has(r.url))
            .map(r => ({
              clientId,
              headline: r.title ?? query,
              summary: r.content?.slice(0, 500),
              sourceUrl: r.url,
              sourceName: 'tavily_news_search',
              rawData: { hypothesisId, searchQuery: query, tavilyScore: r.score },
            }));

          if (signals.length > 0) {
            for (const s of signals) {
              if (s.sourceUrl) existingUrls?.add(s.sourceUrl);
            }
            await this.marketSignalProcessor.ingestBatch(signals);
          }
          log.info({ count: signals.length, filtered: response.results.length - signals.length, provider: 'tavily' }, 'Ingested search results');
          return signals.length;
        }
      } catch (error) {
        log.error({ error }, 'Tavily news search also failed');
      }
    }

    log.warn('No search provider available or no results found');
    return 0;
  }
}
