import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

export const CLASSIFICATION_PROMPT = `You are a market signal classifier. Given a market signal (headline + summary) and a set of active hypotheses, determine:

1. Which hypothesis (if any) this signal best matches
2. A relevance score (0.00-1.00) — how strongly this signal relates to the matched hypothesis
3. The signal category (regulatory, economic, industry, competitive)
4. Which market segments are affected

If no hypothesis matches well, set hypothesisIndex to -1 and still classify the category and relevance.

Return ONLY valid JSON:
{
  "hypothesisIndex": number (-1 if no match),
  "relevanceScore": number (0.00-1.00),
  "signalCategory": "regulatory"|"economic"|"industry"|"competitive",
  "affectedSegments": string[],
  "reasoning": string
}`;

export interface IngestSignalInput {
  clientId: string;
  headline: string;
  summary?: string;
  sourceUrl?: string;
  sourceName?: string;
  rawData?: Record<string, unknown>;
  detectedAt?: string;
}

export interface SignalFeedOptions {
  clientId: string;
  category?: string;
  processed?: boolean;
  hypothesisId?: string;
  limit?: number;
  offset?: number;
}

registerPrompt({
  key: 'signal.market.classification.system',
  label: 'Market Signal Classification',
  area: 'Signal Detection',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for classifying incoming market signals against active hypotheses',
  defaultContent: CLASSIFICATION_PROMPT,
});

export class MarketSignalProcessor {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  async ingestSignal(input: IngestSignalInput) {
    const db = getDb();
    const [signal] = await db
      .insert(schema.marketSignals)
      .values({
        clientId: input.clientId,
        headline: input.headline,
        summary: input.summary ?? null,
        sourceUrl: input.sourceUrl ?? null,
        sourceName: input.sourceName ?? null,
        rawData: input.rawData ?? {},
        detectedAt: input.detectedAt ? new Date(input.detectedAt) : new Date(),
        processed: false,
      })
      .returning();
    return signal;
  }

  async ingestBatch(signals: IngestSignalInput[]) {
    const db = getDb();
    const inserted = await db
      .insert(schema.marketSignals)
      .values(
        signals.map(s => ({
          clientId: s.clientId,
          headline: s.headline,
          summary: s.summary ?? null,
          sourceUrl: s.sourceUrl ?? null,
          sourceName: s.sourceName ?? null,
          rawData: s.rawData ?? {},
          detectedAt: s.detectedAt ? new Date(s.detectedAt) : new Date(),
          processed: false,
        })),
      )
      .returning();
    return inserted;
  }

  async processUnclassifiedSignals(clientId?: string, batchSize = 50): Promise<number> {
    const db = getDb();
    const log = logger.child({ clientId, batchSize });
    log.info('Processing unclassified market signals');

    // Fetch unprocessed signals
    const conditions = [eq(schema.marketSignals.processed, false)];
    if (clientId) {
      conditions.push(eq(schema.marketSignals.clientId, clientId));
    }

    const unprocessed = await db
      .select()
      .from(schema.marketSignals)
      .where(and(...conditions))
      .limit(batchSize)
      .orderBy(schema.marketSignals.createdAt);

    if (unprocessed.length === 0) {
      log.info('No unprocessed signals found');
      return 0;
    }

    log.info({ count: unprocessed.length }, 'Found unprocessed signals');
    let processedCount = 0;

    // Group signals by client for hypothesis lookup
    const signalsByClient = new Map<string, typeof unprocessed>();
    for (const signal of unprocessed) {
      const group = signalsByClient.get(signal.clientId) ?? [];
      group.push(signal);
      signalsByClient.set(signal.clientId, group);
    }

    for (const [cId, signals] of signalsByClient) {
      // Load active hypotheses for this client
      const hypotheses = await db
        .select()
        .from(schema.signalHypotheses)
        .where(and(
          eq(schema.signalHypotheses.clientId, cId),
          eq(schema.signalHypotheses.status, 'active'),
        ))
        .orderBy(schema.signalHypotheses.priority);

      const hypothesesContext = hypotheses.length > 0
        ? hypotheses.map((h, i) => `[${i}] ${h.hypothesis} (category: ${h.signalCategory})`).join('\n')
        : 'No hypotheses defined. Classify the signal by category only.';

      // Classify each signal
      for (const signal of signals) {
        try {
          const userMessage = `## Signal\nHeadline: ${signal.headline}\n${signal.summary ? `Summary: ${signal.summary}` : ''}\n${signal.sourceName ? `Source: ${signal.sourceName}` : ''}\n\n## Active Hypotheses\n${hypothesesContext}`;

          let classificationPrompt = CLASSIFICATION_PROMPT;
          if (this.promptConfig) {
            try { classificationPrompt = await this.promptConfig.getPrompt('signal.market.classification.system'); } catch { /* use default */ }
          }

          const message = await this.anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: classificationPrompt,
            messages: [{ role: 'user', content: userMessage }],
          });

          const textBlock = message.content.find(b => b.type === 'text');
          if (!textBlock?.text) {
            log.warn({ signalId: signal.id }, 'No text response from classification');
            continue;
          }

          const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
          const classification = JSON.parse(cleaned) as {
            hypothesisIndex: number;
            relevanceScore: number;
            signalCategory: string;
            affectedSegments: string[];
            reasoning: string;
          };

          const matchedHypothesis = classification.hypothesisIndex >= 0 && classification.hypothesisIndex < hypotheses.length
            ? hypotheses[classification.hypothesisIndex]
            : null;

          // Validate category
          const validCategories = ['regulatory', 'economic', 'industry', 'competitive'] as const;
          const category = validCategories.includes(classification.signalCategory as typeof validCategories[number])
            ? classification.signalCategory as typeof validCategories[number]
            : null;

          // Update signal with classification
          await db
            .update(schema.marketSignals)
            .set({
              hypothesisId: matchedHypothesis?.id ?? null,
              signalCategory: category,
              relevanceScore: String(Math.max(0, Math.min(1, classification.relevanceScore)).toFixed(2)),
              affectedSegments: classification.affectedSegments ?? [],
              processed: true,
              processedAt: new Date(),
            })
            .where(eq(schema.marketSignals.id, signal.id));

          processedCount++;

          // If high relevance, promote companies from TAM to active_segment
          if (classification.relevanceScore >= 0.7 && classification.affectedSegments?.length > 0) {
            await this.promoteCompanies(cId, classification.affectedSegments, signal.id, matchedHypothesis?.id, classification.relevanceScore);
          }

          log.debug({
            signalId: signal.id,
            relevance: classification.relevanceScore,
            matchedHypothesis: matchedHypothesis?.id,
            category,
          }, 'Signal classified');
        } catch (error) {
          log.error({ error, signalId: signal.id }, 'Failed to classify signal');
          // Mark as processed to avoid retry loops; set low relevance
          await db
            .update(schema.marketSignals)
            .set({
              processed: true,
              processedAt: new Date(),
              relevanceScore: '0.00',
            })
            .where(eq(schema.marketSignals.id, signal.id));
          processedCount++;
        }
      }
    }

    log.info({ processedCount }, 'Signal processing complete');
    return processedCount;
  }

  private async promoteCompanies(
    clientId: string,
    affectedSegments: string[],
    signalId: string,
    hypothesisId?: string | null,
    relevanceScore?: number,
  ) {
    const db = getDb();
    const log = logger.child({ clientId, signalId, segments: affectedSegments });

    // Find all TAM companies for this client that match the affected segments
    const tamCompanies = await db
      .select()
      .from(schema.companies)
      .where(and(
        eq(schema.companies.clientId, clientId),
        eq(schema.companies.pipelineStage, 'tam'),
      ));

    if (tamCompanies.length === 0) {
      log.debug('No TAM companies to promote');
      return;
    }

    // Simple segment matching — check if company industry/description overlaps with affected segments
    const segmentKeywords = affectedSegments.map(s => s.toLowerCase());
    const matchingCompanies = tamCompanies.filter(company => {
      const companyText = [company.industry, company.description, company.subIndustry]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return segmentKeywords.some(kw => companyText.includes(kw));
    });

    if (matchingCompanies.length === 0) {
      log.debug('No matching TAM companies for segments');
      return;
    }

    log.info({ matchCount: matchingCompanies.length }, 'Promoting companies to active_segment');

    // Promote matching companies
    for (const company of matchingCompanies) {
      await db
        .update(schema.companies)
        .set({
          pipelineStage: 'active_segment',
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, company.id));

      // Create a company_signal record linking this market signal to the company
      await db
        .insert(schema.companySignals)
        .values({
          companyId: company.id,
          clientId,
          signalType: 'market_signal',
          signalStrength: String(Math.max(0, Math.min(1, relevanceScore ?? 0.70)).toFixed(2)),
          signalData: {
            evidence: `Promoted by market signal: ${signalId}`,
            details: { marketSignalId: signalId, hypothesisId },
          },
          source: 'market_signal_processor',
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        });
    }

    // Recalculate signal scores for promoted companies
    for (const company of matchingCompanies) {
      const signals = await db
        .select()
        .from(schema.companySignals)
        .where(eq(schema.companySignals.companyId, company.id));

      const avgScore = signals.length > 0
        ? signals.reduce((sum, s) => sum + parseFloat(s.signalStrength), 0) / signals.length
        : 0;

      await db
        .update(schema.companies)
        .set({ signalScore: String(avgScore.toFixed(2)) })
        .where(eq(schema.companies.id, company.id));
    }
  }

  async getSignalFeed(options: SignalFeedOptions) {
    const db = getDb();
    const conditions = [eq(schema.marketSignals.clientId, options.clientId)];

    if (options.category) {
      const validCategories = ['regulatory', 'economic', 'industry', 'competitive'] as const;
      if (validCategories.includes(options.category as typeof validCategories[number])) {
        conditions.push(eq(schema.marketSignals.signalCategory, options.category as typeof validCategories[number]));
      }
    }
    if (options.processed !== undefined) {
      conditions.push(eq(schema.marketSignals.processed, options.processed));
    }
    if (options.hypothesisId) {
      conditions.push(eq(schema.marketSignals.hypothesisId, options.hypothesisId));
    }

    const signals = await db
      .select()
      .from(schema.marketSignals)
      .where(and(...conditions))
      .orderBy(desc(schema.marketSignals.createdAt))
      .limit(options.limit ?? 50)
      .offset(options.offset ?? 0);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.marketSignals)
      .where(and(...conditions));

    return { signals, total: Number(count) };
  }

  async getSignalById(id: string) {
    const db = getDb();
    const [signal] = await db
      .select()
      .from(schema.marketSignals)
      .where(eq(schema.marketSignals.id, id));
    return signal ?? null;
  }
}
