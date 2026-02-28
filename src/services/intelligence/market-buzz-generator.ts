import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import type { BuzzReport, TrendingTopic, WebinarAngle, SeedCopy } from '../../db/schema/market-buzz.js';
import type { ClientProfileService } from './client-profile.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

// ── Re-export types ──

export type { BuzzReport, TrendingTopic, WebinarAngle, SeedCopy } from '../../db/schema/market-buzz.js';

export type BuzzReportRow = typeof schema.buzzReports.$inferSelect;

// ── Internal types ──

interface SignalRecord {
  headline: string;
  summary: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  relevanceScore: number;
  affectedSegments: string[];
  detectedAt: string;
  /** Days since this signal was detected */
  ageDays: number;
  /** 0-1 decay: 1.0 = today, exponentially decays for older signals */
  recencyWeight: number;
  /** relevanceScore × recencyWeight — used for sorting */
  weightedRelevance: number;
}

interface AggregatedSignalData {
  timeWindow: { days: number; from: string; to: string };
  byCategory: {
    category: string;
    count: number;
    avgRelevance: number;
    avgRecencyWeight: number;
    /** Signals sorted by weightedRelevance (recent + relevant first) */
    signals: SignalRecord[];
  }[];
  /** Unique source domains seen across all signals, with frequency */
  sourceDomainFrequency: { domain: string; count: number }[];
  topSegments: { segment: string; mentionCount: number }[];
  activeHypotheses: { hypothesis: string; signalCategory: string; affectedSegments: string[]; evidenceCount: number }[];
  companySignalTrends: { signalType: string; count: number; avgStrength: number }[];
  totalSignals: number;
}

interface ClientContext {
  products: string[];
  services: string[];
  industry: string | null;
  valueProposition: string | null;
  targetMarket: string | null;
  competitors: string[];
  strategicJTBD: { goal: string; exacerbatingConditions: string[] }[];
}

interface IcpSegment {
  id: string;
  name: string;
  description: string | null;
  industries: string[];
  keywords: string[];
}

// ── Prompts ──

const TRENDING_TOPICS_PROMPT = `You are a market intelligence analyst identifying ACTIVE, BUZZY topics from market signal data.

## Priority: Recency & Buzz Over Evergreen

**CRITICAL**: You must prioritise stories that are actively being reported RIGHT NOW over evergreen themes. The data includes recency weights and source coverage counts — use them. A topic covered by 5+ sources in the last week is far more valuable than a generic industry theme with steady but old mentions.

Indicators of high buzz:
- Multiple signals with different source domains about the same underlying story
- Signals from the last 7 days (high recency weight)
- Specific events: new regulations announced, funding rounds, product launches, acquisitions, executive moves, research publications
- Stories that would appear in a news feed, not a textbook

**AVOID**: Evergreen themes like "digital transformation", "AI adoption", "supply chain challenges" UNLESS there is a specific, dated trigger (e.g., a new regulation, a major vendor announcement, a market crash).

## Venn Overlap

Find the overlap between:
1. **Active Market News** — what's being reported NOW (prioritise by recency weight + source count)
2. **ICP Interests** — what the target segments care about
3. **Client Capabilities** — what the client can address

## Output Requirements

For each topic:
- buzzScore (0-100): composite of recency, multi-source coverage, and ICP relevance. A topic from today with 5 sources = 90+. A 3-week-old single-source signal = 20-30.
- sourceCount: how many distinct source domains cover this
- recencyDays: average age in days of supporting signals
- sources: the key articles/outlets driving the story (include domain, full URL, title, and authority level)
- supportingSignals: include sourceDomain alongside each signal
- overlapScore (0.0-1.0): how strongly all three circles intersect

Sort topics by buzzScore descending. Return 3-7 topics.

Return ONLY valid JSON matching this schema:
{
  "trendingTopics": [{
    "topic": "string — specific, news-driven topic name",
    "description": "string — 2-3 sentences explaining what happened and why it matters NOW",
    "category": "regulatory|economic|industry|competitive",
    "signalCount": number,
    "avgRelevance": number,
    "buzzScore": number (0-100),
    "sourceCount": number,
    "recencyDays": number,
    "affectedSegments": ["string"],
    "sources": [{"domain": "string", "url": "string", "title": "string — article or page title", "authority": "major|niche|unknown"}],
    "clientRelevance": {
      "matchingProducts": ["string — specific client products"],
      "matchingCapabilities": ["string — specific client strengths"],
      "reasoning": "string — why this CURRENT story creates a timely opportunity",
      "overlapScore": number (0.0-1.0)
    },
    "supportingSignals": [{"headline": "string", "sourceUrl": "string|null", "sourceDomain": "string|null", "relevanceScore": number, "detectedAt": "string"}]
  }]
}`;

const WEBINAR_ANGLES_PROMPT = `You are a B2B content strategist designing webinar concepts that will attract the right audience.

Given trending market topics, ICP segments, and client capabilities, generate webinar angles that:
1. Address a SPECIFIC pain point or opportunity the audience cares about RIGHT NOW
2. Position the client as the expert without being a sales pitch
3. Promise concrete takeaways — not vague thought leadership
4. Have titles that create urgency and curiosity

Each webinar should sit at the intersection of market trends + audience needs + client expertise.

Return 3-5 webinar angles. Return ONLY valid JSON:
{
  "webinarAngles": [{
    "title": "string — compelling, specific title (not generic)",
    "description": "string — 2-3 sentences on what attendees will learn",
    "targetSegments": ["string"],
    "trendConnection": "string — which market trend this leverages",
    "clientAngle": "string — how the client's product/expertise makes them credible here",
    "talkingPoints": ["string — 3-5 key points to cover"],
    "estimatedAppeal": "high|medium|low"
  }]
}`;

const SEED_COPY_PROMPT = `You are a B2B copywriter creating short-form content that leverages current market trends.

Given trending topics and target segments, generate email and LinkedIn copy that:
1. Leads with the TREND, not the product — the reader should care about the topic first
2. Is conversational and specific — avoid corporate jargon
3. Creates a natural bridge from the market trend to the client's relevance
4. Has clear, low-friction CTAs

For each of the top 3 trending topics, generate:
- 1 email subject line
- 1 short email body (3-4 sentences max)
- 1 LinkedIn post (2-3 paragraphs)
- 1 LinkedIn InMail (2-3 sentences, personalized tone)

Return ONLY valid JSON:
{
  "seedCopy": [{
    "type": "email_subject|email_body|linkedin_post|linkedin_inmessage",
    "topic": "string — which trending topic this relates to",
    "targetSegment": "string — primary audience segment",
    "content": "string — the actual copy",
    "tone": "string — brief tone description (e.g., 'curious, peer-to-peer')",
    "cta": "string — the call to action"
  }]
}`;

registerPrompt({
  key: 'buzz.trending_topics.system',
  label: 'Market Buzz — Trending Topics',
  area: 'Market Buzz',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for identifying trending topics from market signal data with Venn overlap analysis',
  defaultContent: TRENDING_TOPICS_PROMPT,
});

registerPrompt({
  key: 'buzz.webinar_angles.system',
  label: 'Market Buzz — Webinar Angles',
  area: 'Market Buzz',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for generating webinar concepts from trending topics and ICP segments',
  defaultContent: WEBINAR_ANGLES_PROMPT,
});

registerPrompt({
  key: 'buzz.seed_copy.system',
  label: 'Market Buzz — Seed Copy',
  area: 'Market Buzz',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for generating email and LinkedIn copy from trending topics',
  defaultContent: SEED_COPY_PROMPT,
});

// ── Service ──

export class MarketBuzzGenerator {
  private anthropic: Anthropic;
  private clientProfileService: ClientProfileService;
  private promptConfig?: PromptConfigService;
  private log = logger.child({ service: 'market-buzz' });

  constructor(anthropicClient: Anthropic, clientProfileService: ClientProfileService) {
    this.anthropic = anthropicClient;
    this.clientProfileService = clientProfileService;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  // ── Public API ──

  async generateBuzzReport(params: {
    clientId: string;
    timeWindowDays?: number;
    icpIds?: string[];
    forceRegenerate?: boolean;
  }): Promise<BuzzReport> {
    const timeWindowDays = params.timeWindowDays ?? 30;
    const log = this.log.child({ clientId: params.clientId, timeWindowDays });
    log.info('Starting buzz report generation');

    // Step 1: Aggregate signal data
    const aggregated = await this.aggregateSignalData(params.clientId, timeWindowDays, params.icpIds);

    if (aggregated.totalSignals === 0) {
      throw new Error('No processed market signals found in the selected time window. Run evidence search first.');
    }

    // Step 2: Load client context
    const clientContext = await this.loadClientContext(params.clientId);

    // Step 3: Load ICP segments
    const icpSegments = await this.loadIcpSegments(params.clientId, params.icpIds);

    // Step 4: Check cache (unless forced)
    if (!params.forceRegenerate) {
      const inputHash = this.computeInputHash(aggregated, clientContext, icpSegments);
      const db = getDb();
      const [existing] = await db
        .select()
        .from(schema.buzzReports)
        .where(and(
          eq(schema.buzzReports.clientId, params.clientId),
          eq(schema.buzzReports.inputHash, inputHash),
          eq(schema.buzzReports.status, 'completed'),
        ))
        .orderBy(desc(schema.buzzReports.createdAt))
        .limit(1);

      if (existing?.report) {
        log.info({ reportId: existing.id }, 'Returning cached buzz report');
        return existing.report;
      }
    }

    // Step 5: Generate with LLM
    const report = await this.generateWithLLM(aggregated, clientContext, icpSegments);

    log.info({
      topics: report.trendingTopics.length,
      webinars: report.webinarAngles.length,
      copy: report.seedCopy.length,
    }, 'Buzz report generated');

    return report;
  }

  async getReports(clientId: string, limit = 10): Promise<Omit<BuzzReportRow, 'report'>[]> {
    const db = getDb();
    return db
      .select({
        id: schema.buzzReports.id,
        clientId: schema.buzzReports.clientId,
        timeWindowDays: schema.buzzReports.timeWindowDays,
        icpIds: schema.buzzReports.icpIds,
        signalsAnalyzed: schema.buzzReports.signalsAnalyzed,
        topicsCount: schema.buzzReports.topicsCount,
        webinarAnglesCount: schema.buzzReports.webinarAnglesCount,
        copySnippetsCount: schema.buzzReports.copySnippetsCount,
        inputHash: schema.buzzReports.inputHash,
        jobId: schema.buzzReports.jobId,
        status: schema.buzzReports.status,
        createdAt: schema.buzzReports.createdAt,
        completedAt: schema.buzzReports.completedAt,
      })
      .from(schema.buzzReports)
      .where(eq(schema.buzzReports.clientId, clientId))
      .orderBy(desc(schema.buzzReports.createdAt))
      .limit(limit);
  }

  async getReportById(id: string): Promise<BuzzReportRow | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.buzzReports)
      .where(eq(schema.buzzReports.id, id));
    return row ?? null;
  }

  async deleteReport(id: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.buzzReports).where(eq(schema.buzzReports.id, id));
  }

  // ── Data aggregation ──

  /** Extract domain from a URL, returning null if unparseable. */
  private extractDomain(url: string | null): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Exponential recency decay: half-life = timeWindowDays / 4.
   * A signal from today → ~1.0, from half-life ago → 0.5, from the window edge → ~0.06.
   */
  private recencyWeight(detectedAt: Date, now: Date, halfLifeDays: number): number {
    const ageDays = (now.getTime() - detectedAt.getTime()) / (24 * 60 * 60 * 1000);
    return Math.pow(0.5, ageDays / halfLifeDays);
  }

  private async aggregateSignalData(
    clientId: string,
    timeWindowDays: number,
    _icpIds?: string[],
  ): Promise<AggregatedSignalData> {
    const db = getDb();
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeWindowDays * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString();
    const halfLifeDays = Math.max(timeWindowDays / 4, 2); // e.g. 7.5 days for a 30-day window

    // 1. Recent processed market signals
    const recentSignals = await db
      .select()
      .from(schema.marketSignals)
      .where(and(
        eq(schema.marketSignals.clientId, clientId),
        eq(schema.marketSignals.processed, true),
        gte(schema.marketSignals.createdAt, cutoff),
      ))
      .orderBy(desc(schema.marketSignals.relevanceScore))
      .limit(200);

    // Enrich each signal with recency weight and source domain
    const enriched: SignalRecord[] = recentSignals.map(s => {
      const detected = s.detectedAt ?? s.createdAt;
      const relevance = parseFloat(s.relevanceScore ?? '0');
      const weight = this.recencyWeight(detected, now, halfLifeDays);
      const ageDays = (now.getTime() - detected.getTime()) / (24 * 60 * 60 * 1000);
      return {
        headline: s.headline,
        summary: s.summary,
        sourceUrl: s.sourceUrl,
        sourceDomain: this.extractDomain(s.sourceUrl),
        relevanceScore: relevance,
        affectedSegments: (s.affectedSegments as string[]) ?? [],
        detectedAt: detected.toISOString(),
        ageDays: Math.round(ageDays * 10) / 10,
        recencyWeight: Math.round(weight * 1000) / 1000,
        weightedRelevance: Math.round(relevance * weight * 1000) / 1000,
      };
    });

    // Sort all enriched signals by weighted relevance (recent + relevant first)
    enriched.sort((a, b) => b.weightedRelevance - a.weightedRelevance);

    // Source domain frequency across all signals
    const domainCounts = new Map<string, number>();
    for (const s of enriched) {
      if (s.sourceDomain) {
        domainCounts.set(s.sourceDomain, (domainCounts.get(s.sourceDomain) ?? 0) + 1);
      }
    }
    const sourceDomainFrequency = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    // Group by category
    const categoryMap = new Map<string, SignalRecord[]>();
    for (const signal of enriched) {
      // Recover category from the raw DB signal
      const rawSignal = recentSignals.find(s => s.headline === signal.headline && s.sourceUrl === signal.sourceUrl);
      const cat = rawSignal?.signalCategory ?? 'uncategorized';
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(signal);
    }

    const byCategory = Array.from(categoryMap.entries()).map(([category, signals]) => {
      const recencyWeights = signals.map(s => s.recencyWeight);
      return {
        category,
        count: signals.length,
        avgRelevance: signals.reduce((sum, s) => sum + s.relevanceScore, 0) / signals.length,
        avgRecencyWeight: recencyWeights.reduce((a, b) => a + b, 0) / recencyWeights.length,
        // Already sorted by weightedRelevance, take top 20
        signals: signals.slice(0, 20),
      };
    }).sort((a, b) => {
      // Sort categories by avg weighted relevance (favours recent + relevant)
      const aWeighted = a.avgRelevance * a.avgRecencyWeight;
      const bWeighted = b.avgRelevance * b.avgRecencyWeight;
      return bWeighted - aWeighted;
    });

    // 2. Top segments by mention frequency
    const segmentCounts = new Map<string, number>();
    for (const signal of enriched) {
      for (const seg of signal.affectedSegments) {
        segmentCounts.set(seg, (segmentCounts.get(seg) ?? 0) + 1);
      }
    }
    const topSegments = Array.from(segmentCounts.entries())
      .map(([segment, mentionCount]) => ({ segment, mentionCount }))
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 10);

    // 3. Active hypotheses with evidence counts
    const hypotheses = await db
      .select()
      .from(schema.signalHypotheses)
      .where(and(
        eq(schema.signalHypotheses.clientId, clientId),
        eq(schema.signalHypotheses.status, 'active'),
        eq(schema.signalHypotheses.signalLevel, 'market'),
      ));

    const activeHypotheses = hypotheses.map(h => {
      const matchingSignals = recentSignals.filter(s => s.hypothesisId === h.id);
      return {
        hypothesis: h.hypothesis,
        signalCategory: h.signalCategory,
        affectedSegments: (h.affectedSegments as string[]) ?? [],
        evidenceCount: matchingSignals.length,
      };
    }).sort((a, b) => b.evidenceCount - a.evidenceCount).slice(0, 10);

    // 4. Company signal trends
    const companySignalRows = await db
      .select({
        signalType: schema.companySignals.signalType,
        count: sql<number>`count(*)`,
        avgStrength: sql<number>`avg(${schema.companySignals.signalStrength}::numeric)`,
      })
      .from(schema.companySignals)
      .where(and(
        eq(schema.companySignals.clientId, clientId),
        gte(schema.companySignals.detectedAt, cutoff),
      ))
      .groupBy(schema.companySignals.signalType)
      .orderBy(sql`count(*) desc`);

    const companySignalTrends = companySignalRows.map(r => ({
      signalType: r.signalType,
      count: Number(r.count),
      avgStrength: Number(r.avgStrength) || 0,
    }));

    return {
      timeWindow: {
        days: timeWindowDays,
        from: cutoffStr,
        to: new Date().toISOString(),
      },
      byCategory,
      sourceDomainFrequency,
      topSegments,
      activeHypotheses,
      companySignalTrends,
      totalSignals: recentSignals.length,
    };
  }

  private async loadClientContext(clientId: string): Promise<ClientContext> {
    const profile = await this.clientProfileService.getProfile(clientId);

    const websiteData = profile?.websiteData as Record<string, unknown> | null;
    const strategicJTBD = (websiteData?.strategicJTBD as { goal: string; exacerbatingConditions: string[] }[]) ?? [];

    return {
      products: (profile?.products as string[]) ?? [],
      services: (websiteData?.services as string[]) ?? [],
      industry: profile?.industry ?? null,
      valueProposition: profile?.valueProposition ?? null,
      targetMarket: profile?.targetMarket ?? null,
      competitors: (profile?.competitors as string[]) ?? [],
      strategicJTBD,
    };
  }

  private async loadIcpSegments(clientId: string, icpIds?: string[]): Promise<IcpSegment[]> {
    const db = getDb();
    let icps = await db
      .select()
      .from(schema.icps)
      .where(and(
        eq(schema.icps.clientId, clientId),
        eq(schema.icps.isActive, true),
      ));

    if (icpIds?.length) {
      icps = icps.filter(i => icpIds.includes(i.id));
    }

    return icps.map(icp => {
      const filters = icp.filters as Record<string, unknown> | null;
      return {
        id: icp.id,
        name: icp.name,
        description: icp.description,
        industries: (filters?.industries as string[]) ?? [],
        keywords: (filters?.keywords as string[]) ?? [],
      };
    });
  }

  // ── LLM generation ──

  private async generateWithLLM(
    aggregated: AggregatedSignalData,
    clientContext: ClientContext,
    icpSegments: IcpSegment[],
  ): Promise<BuzzReport> {
    // Step 1: Generate trending topics (requires Sonnet for reasoning quality)
    const trendingTopics = await this.generateTrendingTopics(aggregated, clientContext, icpSegments);

    // Steps 2 & 3: Generate webinar angles + seed copy in parallel (both depend on topics, not each other)
    const [webinarResult, copyResult] = await Promise.allSettled([
      this.generateWebinarAngles(trendingTopics, clientContext, icpSegments),
      this.generateSeedCopy(trendingTopics, icpSegments),
    ]);

    const webinarAngles = webinarResult.status === 'fulfilled' ? webinarResult.value : [];
    const seedCopy = copyResult.status === 'fulfilled' ? copyResult.value : [];

    if (webinarResult.status === 'rejected') {
      this.log.error({ error: webinarResult.reason }, 'Webinar angle generation failed');
    }
    if (copyResult.status === 'rejected') {
      this.log.error({ error: copyResult.reason }, 'Seed copy generation failed');
    }

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      timeWindow: aggregated.timeWindow,
      inputSummary: {
        signalsAnalyzed: aggregated.totalSignals,
        hypothesesConsidered: aggregated.activeHypotheses.length,
        icpSegments: icpSegments.map(s => s.name),
        clientProducts: clientContext.products,
      },
      trendingTopics,
      webinarAngles,
      seedCopy,
    };
  }

  private async generateTrendingTopics(
    aggregated: AggregatedSignalData,
    clientContext: ClientContext,
    icpSegments: IcpSegment[],
  ): Promise<TrendingTopic[]> {
    let systemPrompt = TRENDING_TOPICS_PROMPT;
    if (this.promptConfig) {
      try { systemPrompt = await this.promptConfig.getPrompt('buzz.trending_topics.system'); } catch { /* default */ }
    }

    const userMessage = [
      '## Market Signal Data',
      `Time window: ${aggregated.timeWindow.days} days (${aggregated.timeWindow.from} to ${aggregated.timeWindow.to})`,
      `Total signals analyzed: ${aggregated.totalSignals}`,
      '',
      '### Source Coverage (indicates multi-outlet buzz)',
      aggregated.sourceDomainFrequency.slice(0, 15).map(d =>
        `- ${d.domain}: ${d.count} signal${d.count > 1 ? 's' : ''}`
      ).join('\n'),
      '',
      '### Signals by Category (sorted by recency-weighted relevance)',
      '> Each signal includes: recencyWeight (1.0=today, decays with age), ageDays, sourceDomain, and weightedRelevance.',
      ...aggregated.byCategory.map(cat =>
        `**${cat.category}** (${cat.count} signals, avg relevance: ${cat.avgRelevance.toFixed(2)}, avg recency: ${cat.avgRecencyWeight.toFixed(2)}):\n` +
        cat.signals.slice(0, 12).map(s =>
          `- ${s.headline}${s.summary ? ` — ${s.summary.slice(0, 120)}` : ''}` +
          ` [relevance: ${s.relevanceScore.toFixed(2)}, recency: ${s.recencyWeight}, age: ${s.ageDays}d` +
          `${s.sourceDomain ? `, source: ${s.sourceDomain}` : ''}` +
          `${s.sourceUrl ? `, url: ${s.sourceUrl}` : ''}]`
        ).join('\n'),
      ),
      '',
      '### Top Affected Segments',
      aggregated.topSegments.map(s => `- ${s.segment} (${s.mentionCount} mentions)`).join('\n'),
      '',
      '### Active Hypotheses with Evidence',
      aggregated.activeHypotheses.map(h =>
        `- ${h.hypothesis} [${h.signalCategory}] — ${h.evidenceCount} signals, segments: ${h.affectedSegments.join(', ')}`
      ).join('\n'),
      '',
      '### Company-Level Signal Trends',
      aggregated.companySignalTrends.map(t =>
        `- ${t.signalType}: ${t.count} occurrences, avg strength: ${t.avgStrength.toFixed(2)}`
      ).join('\n'),
      '',
      '## Client Capabilities',
      `Industry: ${clientContext.industry ?? 'N/A'}`,
      `Products: ${clientContext.products.join(', ') || 'N/A'}`,
      `Services: ${clientContext.services.join(', ') || 'N/A'}`,
      `Value Proposition: ${clientContext.valueProposition ?? 'N/A'}`,
      `Target Market: ${clientContext.targetMarket ?? 'N/A'}`,
      clientContext.strategicJTBD.length > 0
        ? `Strategic JTBD:\n${clientContext.strategicJTBD.map(j => `- Goal: ${j.goal}\n  Conditions: ${j.exacerbatingConditions.join(', ')}`).join('\n')}`
        : '',
      '',
      '## ICP Segments',
      icpSegments.map(s =>
        `- **${s.name}**: ${s.description ?? 'No description'}` +
        (s.industries.length > 0 ? `\n  Industries: ${s.industries.join(', ')}` : '') +
        (s.keywords.length > 0 ? `\n  Keywords: ${s.keywords.join(', ')}` : '')
      ).join('\n'),
    ].filter(Boolean).join('\n');

    const parsed = await this.callLLM('claude-sonnet-4-20250514', systemPrompt, userMessage, 8192);
    return (parsed.trendingTopics as TrendingTopic[]) ?? [];
  }

  private async generateWebinarAngles(
    trendingTopics: TrendingTopic[],
    clientContext: ClientContext,
    icpSegments: IcpSegment[],
  ): Promise<WebinarAngle[]> {
    let systemPrompt = WEBINAR_ANGLES_PROMPT;
    if (this.promptConfig) {
      try { systemPrompt = await this.promptConfig.getPrompt('buzz.webinar_angles.system'); } catch { /* default */ }
    }

    const userMessage = [
      '## Trending Topics (sorted by buzz score)',
      ...trendingTopics.map((t, i) =>
        `${i + 1}. **${t.topic}** (${t.category}, buzz: ${t.buzzScore}/100, sources: ${t.sourceCount}, overlap: ${t.clientRelevance.overlapScore.toFixed(2)})\n` +
        `   ${t.description}\n` +
        `   Segments: ${t.affectedSegments.join(', ')}\n` +
        `   Key sources: ${t.sources.slice(0, 3).map(s => `${s.title} (${s.domain})`).join('; ')}\n` +
        `   Client relevance: ${t.clientRelevance.reasoning}`,
      ),
      '',
      '## Client Capabilities',
      `Products: ${clientContext.products.join(', ') || 'N/A'}`,
      `Services: ${clientContext.services.join(', ') || 'N/A'}`,
      `Value Proposition: ${clientContext.valueProposition ?? 'N/A'}`,
      '',
      '## ICP Segments',
      icpSegments.map(s => `- ${s.name}: ${s.description ?? 'No description'}`).join('\n'),
    ].join('\n');

    const parsed = await this.callLLM('claude-sonnet-4-20250514', systemPrompt, userMessage, 4096);
    return (parsed.webinarAngles as WebinarAngle[]) ?? [];
  }

  private async generateSeedCopy(
    trendingTopics: TrendingTopic[],
    icpSegments: IcpSegment[],
  ): Promise<SeedCopy[]> {
    let systemPrompt = SEED_COPY_PROMPT;
    if (this.promptConfig) {
      try { systemPrompt = await this.promptConfig.getPrompt('buzz.seed_copy.system'); } catch { /* default */ }
    }

    const topTopics = trendingTopics.slice(0, 3);

    const userMessage = [
      '## Top Trending Topics (by buzz score)',
      ...topTopics.map((t, i) =>
        `${i + 1}. **${t.topic}** (${t.category}, buzz: ${t.buzzScore}/100)\n` +
        `   ${t.description}\n` +
        `   Segments: ${t.affectedSegments.join(', ')}\n` +
        `   Key sources: ${t.sources.slice(0, 2).map(s => s.title).join('; ')}\n` +
        `   Client angle: ${t.clientRelevance.reasoning}`,
      ),
      '',
      '## Target Segments',
      icpSegments.map(s => `- ${s.name}`).join('\n'),
    ].join('\n');

    const parsed = await this.callLLM('claude-haiku-4-5-20251001', systemPrompt, userMessage, 4096);
    return (parsed.seedCopy as SeedCopy[]) ?? [];
  }

  // ── Helpers ──

  private async callLLM(
    model: string,
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<Record<string, unknown>> {
    const message = await this.anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('Empty LLM response');

    // Strip markdown code fences if present
    const fenceMatch = textBlock.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const cleaned = (fenceMatch ? fenceMatch[1] : textBlock.text).trim();

    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      this.log.warn({ text: cleaned.slice(0, 200) }, 'Failed to parse LLM JSON, retrying');
      // Single retry
      const retry = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. No markdown, no commentary.',
        messages: [{ role: 'user', content: userMessage }],
      });
      const retryText = retry.content.find(b => b.type === 'text');
      if (!retryText?.text) throw new Error('Empty LLM response on retry');
      const retryFence = retryText.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      const retryCleaned = (retryFence ? retryFence[1] : retryText.text).trim();
      return JSON.parse(retryCleaned) as Record<string, unknown>;
    }
  }

  computeInputHash(
    aggregated: AggregatedSignalData,
    clientContext: ClientContext,
    icpSegments: IcpSegment[],
  ): string {
    const data = JSON.stringify({
      totalSignals: aggregated.totalSignals,
      categories: aggregated.byCategory.map(c => `${c.category}:${c.count}`),
      segments: aggregated.topSegments.map(s => s.segment),
      products: clientContext.products,
      icps: icpSegments.map(s => s.id),
    });
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }
}
