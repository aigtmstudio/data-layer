import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import type { ApifyProvider } from '../../providers/apify/index.js';
import type { MarketSignalProcessor } from './market-signal-processor.js';
import type { InfluencerPlatform } from '../../db/schema/influencers.js';

const COOLDOWN_HOURS = 6;

export interface InfluencerFetchResult {
  influencersChecked: number;
  influencersSkipped: number;
  signalsIngested: number;
  totalInfluencers?: number; // set only when influencersChecked === 0
  errors: { handle: string; platform: string; error: string }[];
}

export class InfluencerMonitorService {
  private apifyProvider: ApifyProvider;
  private marketSignalProcessor: MarketSignalProcessor;
  private log = logger.child({ service: 'influencer-monitor' });

  constructor(apifyProvider: ApifyProvider, marketSignalProcessor: MarketSignalProcessor) {
    this.apifyProvider = apifyProvider;
    this.marketSignalProcessor = marketSignalProcessor;
  }

  /**
   * Fetch recent posts from all active influencers for a client and ingest them as market signals.
   * Respects a 6-hour cooldown per influencer to avoid redundant fetches.
   */
  async fetchAndIngestPosts(
    clientId: string,
    options?: { postsPerInfluencer?: number; forceRefresh?: boolean },
  ): Promise<InfluencerFetchResult> {
    const db = getDb();
    const postsPerInfluencer = options?.postsPerInfluencer ?? 10;
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
    const result: InfluencerFetchResult = { influencersChecked: 0, influencersSkipped: 0, signalsIngested: 0, errors: [] };

    const activeInfluencers = await db
      .select()
      .from(schema.influencers)
      .where(and(
        eq(schema.influencers.clientId, clientId),
        eq(schema.influencers.isActive, true),
      ));

    if (activeInfluencers.length === 0) {
      const allInfluencers = await db
        .select({ id: schema.influencers.id })
        .from(schema.influencers)
        .where(eq(schema.influencers.clientId, clientId));
      this.log.info({ clientId, total: allInfluencers.length }, 'No active influencers to fetch');
      result.totalInfluencers = allInfluencers.length;
      return result;
    }

    // Pre-load existing sourceUrls for deduplication
    const existingSignals = await db
      .select({ sourceUrl: schema.marketSignals.sourceUrl })
      .from(schema.marketSignals)
      .where(eq(schema.marketSignals.clientId, clientId));
    const existingUrls = new Set(existingSignals.map(s => s.sourceUrl).filter((u): u is string => !!u));

    this.log.info({ clientId, count: activeInfluencers.length }, 'Fetching influencer posts');

    for (const influencer of activeInfluencers) {
      result.influencersChecked++;

      // Cooldown check
      if (!options?.forceRefresh && influencer.lastFetchedAt && influencer.lastFetchedAt > cooldownCutoff) {
        this.log.debug({ influencer: influencer.handle, platform: influencer.platform }, 'Influencer within cooldown, skipping');
        result.influencersSkipped++;
        continue;
      }

      if (!influencer.profileUrl) {
        this.log.warn({ influencer: influencer.id }, 'Influencer has no profileUrl, skipping');
        result.influencersSkipped++;
        continue;
      }

      try {
        const posts = await this.apifyProvider.fetchInfluencerPosts({
          platform: influencer.platform as InfluencerPlatform,
          profileUrl: influencer.profileUrl,
          limit: postsPerInfluencer,
        });

        const signals = posts
          .filter(post => !post.url || !existingUrls.has(post.url))
          .map(post => ({
            clientId,
            headline: post.text.slice(0, 200).replace(/\s+/g, ' ').trim() || `${influencer.name} on ${influencer.platform}`,
            summary: post.text.slice(0, 1000),
            sourceUrl: post.url,
            sourceName: `influencer_${influencer.platform}` as string,
            rawData: {
              influencerId: influencer.id,
              influencerName: influencer.name,
              influencerHandle: influencer.handle,
              influencerCategory: influencer.category,
              ...((post.rawData && typeof post.rawData === 'object') ? post.rawData as Record<string, unknown> : {}),
            } as Record<string, unknown>,
            detectedAt: post.publishedAt,
          }));

        if (signals.length > 0) {
          for (const s of signals) {
            if (s.sourceUrl) existingUrls.add(s.sourceUrl);
          }
          await this.marketSignalProcessor.ingestBatch(signals);
          result.signalsIngested += signals.length;
        }

        // Update lastFetchedAt
        await db
          .update(schema.influencers)
          .set({ lastFetchedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.influencers.id, influencer.id));

        this.log.info({ influencer: influencer.handle, platform: influencer.platform, ingested: signals.length }, 'Influencer posts fetched');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.error({ error, influencer: influencer.handle, platform: influencer.platform }, 'Failed to fetch influencer posts');
        result.errors.push({ handle: influencer.handle, platform: influencer.platform, error: msg });
      }
    }

    this.log.info(result, 'Influencer fetch complete');
    return result;
  }
}
