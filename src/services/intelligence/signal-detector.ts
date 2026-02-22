import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, gte, inArray } from 'drizzle-orm';
import type { UnifiedCompany } from '../../providers/types.js';
import type { SignalData } from '../../db/schema/intelligence.js';
import { SIGNAL_DEFINITIONS } from './provider-knowledge.js';
import { logger } from '../../lib/logger.js';

export interface DetectedSignal {
  signalType: string;
  signalStrength: number;
  evidence: string;
  source: string;
  details?: Record<string, unknown>;
}

const LLM_SIGNAL_PROMPT = `Analyze this company data and detect buying signals that suggest the company may need or be ready to purchase B2B services.

For each signal detected, return JSON array:
[{
  "signalType": "pain_point_detected" | "competitive_displacement" | "expansion" | "new_product_launch",
  "signalStrength": 0.0-1.0 (how strong the signal is),
  "evidence": "Brief explanation of why this is a signal"
}]

Only include signals with signalStrength >= 0.5. Return empty array [] if no strong signals detected. Return ONLY valid JSON.`;

export class SignalDetector {
  private anthropic: Anthropic;

  constructor(anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
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

    // LLM-based signals from descriptions and unstructured data
    if (company.description && company.description.length > 50) {
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
        evidence: `Funding stage: ${company.latestFundingStage ?? 'Unknown'}, Total: $${company.totalFunding ?? 'Unknown'}`,
        source: 'rule_based',
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
          evidence: `Uses related tech: ${relevantTech.join(', ')}`,
          source: 'rule_based',
          details: { matchedTech: relevantTech },
        });
      }
    }

    // Hiring surge — indicated by large employee count with recent enrichment
    // In production, compare to previous employee count
    if (company.employeeCount && company.employeeCount > 50) {
      const growthIndicators = [
        company.employeeRange?.includes('+'),
        company.description?.toLowerCase().includes('hiring'),
        company.description?.toLowerCase().includes('growing'),
        company.description?.toLowerCase().includes('expanding'),
      ].filter(Boolean).length;

      if (growthIndicators >= 2) {
        signals.push({
          signalType: 'hiring_surge',
          signalStrength: 0.6 + growthIndicators * 0.1,
          evidence: `Employee count: ${company.employeeCount}, growth indicators detected`,
          source: 'rule_based',
        });
      }
    }

    // Expansion signals from multi-location data
    if (company.address && company.country) {
      const expansionKeywords = ['new office', 'expansion', 'new market', 'opened'];
      const hasExpansion = expansionKeywords.some(kw =>
        company.description?.toLowerCase().includes(kw),
      );
      if (hasExpansion) {
        signals.push({
          signalType: 'expansion',
          signalStrength: 0.7,
          evidence: `Expansion indicators in company description`,
          source: 'rule_based',
        });
      }
    }

    return signals;
  }

  private async detectLlmSignals(
    company: UnifiedCompany,
    clientContext?: { products?: string[]; industry?: string },
  ): Promise<DetectedSignal[]> {
    try {
      const companyInfo = [
        `Company: ${company.name}`,
        company.industry ? `Industry: ${company.industry}` : null,
        company.description ? `Description: ${company.description.slice(0, 500)}` : null,
        company.employeeCount ? `Employees: ${company.employeeCount}` : null,
        company.techStack?.length ? `Tech stack: ${company.techStack.join(', ')}` : null,
        company.latestFundingStage ? `Funding: ${company.latestFundingStage}` : null,
        clientContext?.products?.length
          ? `\nClient sells: ${clientContext.products.join(', ')}`
          : null,
        clientContext?.industry
          ? `Client industry: ${clientContext.industry}`
          : null,
      ].filter(Boolean).join('\n');

      const message = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: LLM_SIGNAL_PROMPT,
        messages: [{ role: 'user', content: companyInfo }],
      });

      const textBlock = message.content.find(b => b.type === 'text');
      if (!textBlock?.text) return [];

      const parsed = JSON.parse(textBlock.text);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((s: Record<string, unknown>) =>
          s.signalType && typeof s.signalStrength === 'number' && s.signalStrength >= 0.5,
        )
        .map((s: Record<string, unknown>) => ({
          signalType: s.signalType as string,
          signalStrength: s.signalStrength as number,
          evidence: (s.evidence as string) ?? 'Detected by AI analysis',
          source: 'llm_analysis',
        }));
    } catch (error) {
      logger.warn({ error, company: company.name }, 'LLM signal detection failed');
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
