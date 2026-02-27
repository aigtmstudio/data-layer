import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, gte, inArray } from 'drizzle-orm';
import type { UnifiedCompany } from '../../providers/types.js';
import type { SignalData } from '../../db/schema/intelligence.js';
import { SIGNAL_DEFINITIONS } from './provider-knowledge.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

export interface DetectedSignal {
  signalType: string;
  signalStrength: number;
  evidence: string;
  source: string;
  details?: Record<string, unknown>;
}

export const LLM_SIGNAL_PROMPT = `You are analyzing company data to detect buying signals. The data comes from multiple sources, each labelled with its provenance (e.g. [enrichment provider], [company website: domain.com]).

CRITICAL: You may ONLY cite facts that appear in a verifiable data source — labelled as [enrichment provider] or [company website: domain.com]. If the only source for a claim is [AI-generated analysis], you must NOT treat it as evidence. AI-generated analyses are background context only, not factual evidence.

Signal types to detect:
- "expansion": New locations, markets, venues, or revenue streams — must cite specific evidence (e.g. a new site mentioned on their website)
- "pain_point_detected": Operational challenges or technology gaps visible from their actual tech stack or website content
- "competitive_displacement": Outdated tech stack (verifiable from enrichment data) or website content indicating dissatisfaction
- "new_product_launch": New products, services, or concepts mentioned on their website
- "growth_momentum": Multiple verifiable indicators (hiring pages on website, multiple locations, awards mentioned on site)

For each signal, return JSON array:
[{
  "signalType": "expansion" | "pain_point_detected" | "competitive_displacement" | "new_product_launch" | "growth_momentum",
  "signalStrength": 0.0-1.0,
  "evidence": "1-2 sentences citing the SPECIFIC fact and its source tag",
  "sourceTag": "enrichment provider" | "company website" | "funding data"
}]

Rules:
- ONLY include signals backed by verifiable facts from tagged sources
- NEVER restate claims from [AI-generated analysis] as if they were evidence
- Every evidence statement MUST reference what was found and where (e.g. "Website lists 5 venue locations [company website]" or "Tech stack includes WordPress, Google Maps [enrichment provider]")
- Generic industry observations are NOT signals — evidence must be specific to THIS company

signalStrength guide:
- 0.7-0.8: Clear specific evidence from a verifiable source
- 0.9-1.0: Strong evidence from multiple verifiable sources
- Below 0.7: Do not include — not strong enough

Return empty array [] if no verifiable signals detected. Return ONLY valid JSON.`;

registerPrompt({
  key: 'signal.company.detection.system',
  label: 'Company Signal Detection',
  area: 'Signal Detection',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for detecting buying signals from company data',
  defaultContent: LLM_SIGNAL_PROMPT,
});

export class SignalDetector {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  /**
   * Detect buying signals from an enriched company.
   * Combines rule-based detection from structured data with
   * LLM-based detection for subtle intent signals.
   */
  async detectSignals(
    clientId: string,
    company: UnifiedCompany,
    companyId: string,
    clientContext?: { products?: string[]; industry?: string },
  ): Promise<DetectedSignal[]> {
    const signals: DetectedSignal[] = [];

    // Rule-based signals from structured data
    signals.push(...this.detectRuleBasedSignals(company, clientContext));

    // LLM-based signals from PESTLE profiles, descriptions, and unstructured data
    const hasProfile = company.websiteProfile && company.websiteProfile.length > 100;
    const hasDescription = company.description && company.description.length > 50;
    if (hasProfile || hasDescription) {
      const llmSignals = await this.detectLlmSignals(company, clientContext);
      signals.push(...llmSignals);
    }

    // Persist detected signals
    await this.persistSignals(clientId, companyId, signals);

    return signals;
  }

  private detectRuleBasedSignals(
    company: UnifiedCompany,
    clientContext?: { products?: string[]; industry?: string },
  ): DetectedSignal[] {
    const signals: DetectedSignal[] = [];

    // Recent funding (within 6 months)
    if (company.latestFundingStage || company.totalFunding) {
      // If we have a funding date, check recency
      // Otherwise, if we have funding data at all, it's a moderate signal
      signals.push({
        signalType: 'recent_funding',
        signalStrength: 0.7,
        evidence: `Funding stage: ${company.latestFundingStage ?? 'Unknown'}, Total: $${company.totalFunding ?? 'Unknown'} [funding data]`,
        source: 'funding data',
      });
    }

    // Tech adoption relevant to client's products
    if (company.techStack?.length && clientContext?.products?.length) {
      const relevantTech = company.techStack.filter(tech =>
        clientContext.products!.some(product =>
          tech.toLowerCase().includes(product.toLowerCase()) ||
          product.toLowerCase().includes(tech.toLowerCase()),
        ),
      );
      if (relevantTech.length > 0) {
        signals.push({
          signalType: 'tech_adoption',
          signalStrength: Math.min(0.6 + relevantTech.length * 0.1, 1.0),
          evidence: `Uses related tech: ${relevantTech.join(', ')} [enrichment provider]`,
          source: 'enrichment provider',
          details: { matchedTech: relevantTech },
        });
      }
    }

    // Hiring surge — indicated by large employee count with verifiable text indicators
    if (company.employeeCount && company.employeeCount > 50) {
      const textToSearch = (company.description ?? '').toLowerCase();
      const matchedKeywords: string[] = [];
      if (company.employeeRange?.includes('+')) matchedKeywords.push(`employee range "${company.employeeRange}"`);
      for (const kw of ['hiring', 'growing', 'expanding']) {
        if (textToSearch.includes(kw)) matchedKeywords.push(`mentions "${kw}"`);
      }

      if (matchedKeywords.length >= 2) {
        signals.push({
          signalType: 'hiring_surge',
          signalStrength: 0.6 + matchedKeywords.length * 0.1,
          evidence: `Employee count: ${company.employeeCount} [enrichment provider]. Indicators: ${matchedKeywords.join(', ')}.`,
          source: 'enrichment provider',
        });
      }
    }

    // Expansion signals — only from verifiable description text (not AI-generated PESTLE)
    const expansionText = company.description ?? '';
    const expansionKeywords = ['new office', 'expansion plan', 'new market', 'new location', 'new venue', 'new site', 'recently opened', 'just opened', 'opening soon'];
    const matchedExpansion = expansionKeywords.filter(kw => expansionText.toLowerCase().includes(kw));
    if (matchedExpansion.length > 0) {
      // Extract a context snippet around the first matched keyword
      const firstMatch = matchedExpansion[0];
      const idx = expansionText.toLowerCase().indexOf(firstMatch);
      const snippetStart = Math.max(0, idx - 40);
      const snippetEnd = Math.min(expansionText.length, idx + firstMatch.length + 60);
      const snippet = (snippetStart > 0 ? '...' : '') +
        expansionText.slice(snippetStart, snippetEnd).trim() +
        (snippetEnd < expansionText.length ? '...' : '');

      signals.push({
        signalType: 'expansion',
        signalStrength: 0.7,
        evidence: `Keywords found in company description: ${matchedExpansion.map(k => `"${k}"`).join(', ')}. Context: "${snippet}" [enrichment provider]`,
        source: 'rule_based',
      });
    }

    return signals;
  }

  private async detectLlmSignals(
    company: UnifiedCompany,
    clientContext?: { products?: string[]; industry?: string },
  ): Promise<DetectedSignal[]> {
    try {
      const domainTag = company.domain ? `company website: ${company.domain}` : 'company website';

      const companyInfo = [
        `Company: ${company.name}`,
        company.domain ? `Domain: ${company.domain}` : null,

        // Verifiable data from enrichment providers
        company.industry ? `Industry: ${company.industry} [enrichment provider]` : null,
        company.employeeCount ? `Employees: ${company.employeeCount} [enrichment provider]` : null,
        company.techStack?.length
          ? `Tech stack [enrichment provider]: ${company.techStack.join(', ')}`
          : null,
        company.latestFundingStage ? `Funding stage: ${company.latestFundingStage} [funding data]` : null,
        company.totalFunding ? `Total funding: $${company.totalFunding} [funding data]` : null,

        // Verifiable data from company website
        company.description ? `Company description [${domainTag}]: ${company.description.slice(0, 500)}` : null,

        // AI-generated analysis (background context only — NOT a verifiable source)
        company.websiteProfile
          ? `\n[AI-generated analysis — DO NOT cite as evidence, use as background context only]:\n${company.websiteProfile.slice(0, 2000)}`
          : null,

        // Client context
        clientContext?.products?.length
          ? `\nClient sells: ${clientContext.products.join(', ')}`
          : null,
        clientContext?.industry
          ? `Client industry: ${clientContext.industry}`
          : null,
      ].filter(Boolean).join('\n');

      let signalPrompt = LLM_SIGNAL_PROMPT;
      if (this.promptConfig) {
        try { signalPrompt = await this.promptConfig.getPrompt('signal.company.detection.system'); } catch { /* use default */ }
      }

      const message = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: signalPrompt,
        messages: [{ role: 'user', content: companyInfo }],
      });

      const textBlock = message.content.find(b => b.type === 'text');
      if (!textBlock?.text) return [];

      // Strip markdown code fences if present
      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((s: Record<string, unknown>) =>
          s.signalType && typeof s.signalStrength === 'number' && s.signalStrength >= 0.7,
        )
        .map((s: Record<string, unknown>) => ({
          signalType: s.signalType as string,
          signalStrength: s.signalStrength as number,
          evidence: (s.evidence as string) ?? 'Detected by AI analysis',
          source: (s.sourceTag as string) ?? 'llm_analysis',
          details: s.sourceTag ? { sourceTag: s.sourceTag as string } : undefined,
        }));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ err: errMsg, company: company.name }, 'LLM signal detection failed');
      return [];
    }
  }

  private async persistSignals(
    clientId: string,
    companyId: string,
    signals: DetectedSignal[],
  ): Promise<void> {
    if (signals.length === 0) return;

    const db = getDb();
    const now = new Date();

    const values = signals.map(signal => {
      const definition = SIGNAL_DEFINITIONS[signal.signalType];
      const decayDays = definition?.decayDays ?? 90;
      const expiresAt = new Date(now.getTime() + decayDays * 24 * 60 * 60 * 1000);

      const signalData: SignalData = {
        evidence: signal.evidence,
        details: signal.details,
      };

      return {
        companyId,
        clientId,
        signalType: signal.signalType,
        signalStrength: String(signal.signalStrength),
        signalData,
        source: signal.source,
        detectedAt: now,
        expiresAt,
      };
    });

    try {
      await db.insert(schema.companySignals).values(values);
    } catch (error) {
      logger.warn({ error, companyId }, 'Failed to persist signals');
    }
  }

  /** Get active (non-expired) signals for a set of companies */
  async getSignalsForCompanies(
    clientId: string,
    companyIds: string[],
  ): Promise<Map<string, DetectedSignal[]>> {
    const db = getDb();
    const now = new Date();

    const rows = await db
      .select()
      .from(schema.companySignals)
      .where(and(
        eq(schema.companySignals.clientId, clientId),
        inArray(schema.companySignals.companyId, companyIds),
        gte(schema.companySignals.expiresAt, now),
      ));

    const result = new Map<string, DetectedSignal[]>();
    for (const row of rows) {
      const signals = result.get(row.companyId) ?? [];
      signals.push({
        signalType: row.signalType,
        signalStrength: Number(row.signalStrength),
        evidence: (row.signalData as SignalData).evidence,
        source: row.source,
        details: (row.signalData as SignalData).details,
      });
      result.set(row.companyId, signals);
    }

    return result;
  }
}
