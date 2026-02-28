import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { EmploymentRecord } from '../../db/schema/contacts.js';
import type { SignalData } from '../../db/schema/intelligence.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

export interface PersonaSignalResult {
  signalType: string;
  signalStrength: number;
  evidence: string;
  source: 'rule_based' | 'llm_analysis';
  details?: Record<string, unknown>;
}

interface PersonaContext {
  name: string;
  titlePatterns: string[];
  seniorityLevels: string[];
  departments: string[];
}

interface ContactData {
  id: string;
  title: string | null;
  seniority: string | null;
  department: string | null;
  employmentHistory: EmploymentRecord[];
}

export const CAREER_ANALYSIS_PROMPT = `Analyze this contact's career trajectory against the target persona and detect person-specific buying signals.

Return a JSON array of signals. Only include signals with signalStrength >= 0.5.

[{
  "signalType": "job_change" | "title_match" | "seniority_match" | "tenure_signal",
  "signalStrength": 0.0-1.0,
  "evidence": "Brief explanation of why this is a signal"
}]

Return ONLY valid JSON. Return empty array [] if no strong signals.`;

registerPrompt({
  key: 'signal.persona.career.system',
  label: 'Persona Career Analysis',
  area: 'Signal Detection',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for analysing contact career trajectory against target persona',
  defaultContent: CAREER_ANALYSIS_PROMPT,
});

export class PersonaSignalDetector {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(anthropicClient: Anthropic) {
    this.anthropic = anthropicClient;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  async detectSignals(
    clientId: string,
    contactId: string,
    contact: ContactData,
    persona: PersonaContext,
  ): Promise<PersonaSignalResult[]> {
    const signals: PersonaSignalResult[] = [];

    // Rule-based signals from enrichment data
    signals.push(...this.detectRuleBasedSignals(contact, persona));

    // LLM-based analysis if employment history is available
    if (contact.employmentHistory?.length > 1) {
      const llmSignals = await this.detectLlmSignals(contact, persona);
      signals.push(...llmSignals);
    }

    // Persist detected signals to contact_signals table
    await this.persistSignals(clientId, contactId, signals);

    return signals;
  }

  private detectRuleBasedSignals(
    contact: ContactData,
    persona: PersonaContext,
  ): PersonaSignalResult[] {
    const signals: PersonaSignalResult[] = [];

    // 1. Title match — fuzzy match contact title against persona patterns
    if (contact.title && persona.titlePatterns.length > 0) {
      const titleLower = contact.title.toLowerCase();
      const matchedPattern = persona.titlePatterns.find(pattern => {
        const patternLower = pattern.toLowerCase();
        // Support wildcards: "VP*" matches "VP of Engineering"
        if (patternLower.includes('*')) {
          const regex = new RegExp('^' + patternLower.replace(/\*/g, '.*') + '$', 'i');
          return regex.test(titleLower);
        }
        return titleLower.includes(patternLower) || patternLower.includes(titleLower);
      });

      if (matchedPattern) {
        // Exact match = higher strength, partial = lower
        const isExact = contact.title.toLowerCase() === matchedPattern.toLowerCase();
        signals.push({
          signalType: 'title_match',
          signalStrength: isExact ? 0.9 : 0.6,
          evidence: `Title "${contact.title}" matches persona pattern "${matchedPattern}"`,
          source: 'rule_based',
          details: { matchedPattern, contactTitle: contact.title },
        });
      }
    }

    // 2. Seniority match
    if (contact.seniority && persona.seniorityLevels.length > 0) {
      const seniorityLower = contact.seniority.toLowerCase();
      const matched = persona.seniorityLevels.some(
        level => level.toLowerCase() === seniorityLower,
      );
      if (matched) {
        signals.push({
          signalType: 'seniority_match',
          signalStrength: 0.6,
          evidence: `Seniority "${contact.seniority}" matches target levels`,
          source: 'rule_based',
          details: { contactSeniority: contact.seniority, targetLevels: persona.seniorityLevels },
        });
      }
    }

    // 3. Job change — recently started role (< 6 months = "new broom" effect)
    if (contact.employmentHistory?.length > 0) {
      const currentRole = contact.employmentHistory.find(e => e.isCurrent);
      if (currentRole?.startDate) {
        const startDate = new Date(currentRole.startDate);
        const monthsInRole = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

        if (monthsInRole < 6) {
          signals.push({
            signalType: 'job_change',
            signalStrength: monthsInRole < 3 ? 0.8 : 0.7,
            evidence: `Started current role ${Math.round(monthsInRole)} months ago — likely building their stack`,
            source: 'rule_based',
            details: { monthsInRole: Math.round(monthsInRole), startDate: currentRole.startDate },
          });
        }
      }
    }

    // 4. Tenure signal — recently promoted + seniority match = high intent
    if (contact.employmentHistory?.length > 1) {
      const current = contact.employmentHistory.find(e => e.isCurrent);
      const previous = contact.employmentHistory.find(e => !e.isCurrent);

      if (current && previous && current.company === previous.company) {
        // Same company, different title = promotion
        if (current.title !== previous.title && current.startDate) {
          const monthsSincePromo = (Date.now() - new Date(current.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSincePromo < 12) {
            signals.push({
              signalType: 'tenure_signal',
              signalStrength: monthsSincePromo < 6 ? 0.8 : 0.6,
              evidence: `Recently promoted from "${previous.title}" to "${current.title}" — likely looking to make impact`,
              source: 'rule_based',
              details: {
                previousTitle: previous.title,
                currentTitle: current.title,
                monthsSincePromotion: Math.round(monthsSincePromo),
              },
            });
          }
        }
      }
    }

    return signals;
  }

  private async detectLlmSignals(
    contact: ContactData,
    persona: PersonaContext,
  ): Promise<PersonaSignalResult[]> {
    const contactSummary = [
      `Title: ${contact.title ?? 'Unknown'}`,
      `Seniority: ${contact.seniority ?? 'Unknown'}`,
      `Department: ${contact.department ?? 'Unknown'}`,
      `Employment History:`,
      ...contact.employmentHistory.map(e =>
        `  - ${e.title} at ${e.company}${e.startDate ? ` (${e.startDate}${e.endDate ? ' - ' + e.endDate : ' - present'})` : ''}`,
      ),
    ].join('\n');

    const personaSummary = [
      `Target Persona: ${persona.name}`,
      `Title Patterns: ${persona.titlePatterns.join(', ')}`,
      `Seniority: ${persona.seniorityLevels.join(', ')}`,
      `Departments: ${persona.departments.join(', ')}`,
    ].join('\n');

    let careerPrompt = CAREER_ANALYSIS_PROMPT;
    if (this.promptConfig) {
      try { careerPrompt = await this.promptConfig.getPrompt('signal.persona.career.system'); } catch { /* use default */ }
    }

    let message;
    try {
      message = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: careerPrompt,
        messages: [{
          role: 'user',
          content: `${personaSummary}\n\n## Contact\n${contactSummary}`,
        }],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn({ contactId: contact.id, err: error, errorMessage: msg }, 'Anthropic API call failed for persona signal detection');
      return [];
    }

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) return [];

    try {
      // Extract JSON from between code fences if present, otherwise use raw text.
      // The LLM sometimes appends reasoning text after the closing fence.
      const fenceMatch = textBlock.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      const cleaned = (fenceMatch ? fenceMatch[1] : textBlock.text).trim();
      const parsed = JSON.parse(cleaned) as Array<{
        signalType: string;
        signalStrength: number;
        evidence: string;
      }>;

      const validTypes = ['job_change', 'title_match', 'seniority_match', 'tenure_signal'];
      return parsed
        .filter(s => s.signalStrength >= 0.5 && validTypes.includes(s.signalType))
        .map(s => ({
          signalType: s.signalType,
          signalStrength: Math.min(1, Math.max(0, s.signalStrength)),
          evidence: s.evidence,
          source: 'llm_analysis' as const,
        }));
    } catch (error) {
      logger.warn({ contactId: contact.id, err: error, rawText: textBlock.text.slice(0, 200) }, 'Failed to parse LLM persona signal response');
      return [];
    }
  }

  private async persistSignals(
    clientId: string,
    contactId: string,
    signals: PersonaSignalResult[],
  ) {
    if (signals.length === 0) return;

    const db = getDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    // Clear previous signals for this contact to avoid duplicates on re-run
    await db.delete(schema.contactSignals).where(
      and(
        eq(schema.contactSignals.contactId, contactId),
        eq(schema.contactSignals.clientId, clientId),
      ),
    );

    await db.insert(schema.contactSignals).values(
      signals.map(s => ({
        contactId,
        clientId,
        signalType: s.signalType,
        signalStrength: String(s.signalStrength.toFixed(2)),
        signalData: {
          evidence: s.evidence,
          details: s.details,
        } as SignalData,
        source: s.source,
        detectedAt: now,
        expiresAt,
      })),
    );
  }

  static readonly FIT_TYPES = new Set(['title_match', 'seniority_match']);

  /**
   * Compute persona fit score from static attribute matches (title, seniority).
   * Returns 0.00-1.00.
   */
  computeFitScore(signals: PersonaSignalResult[]): number {
    const fitSignals = signals.filter(s => PersonaSignalDetector.FIT_TYPES.has(s.signalType));
    if (fitSignals.length === 0) return 0;

    const weights: Record<string, number> = {
      title_match: 0.60,
      seniority_match: 0.40,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of fitSignals) {
      const weight = weights[signal.signalType] ?? 0.1;
      weightedSum += signal.signalStrength * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.min(1, weightedSum / totalWeight) : 0;
  }

  /**
   * Compute buying signal score from event-based signals (job change, promotion).
   * Returns 0.00-1.00.
   */
  computeSignalScore(signals: PersonaSignalResult[]): number {
    const eventSignals = signals.filter(s => !PersonaSignalDetector.FIT_TYPES.has(s.signalType));
    if (eventSignals.length === 0) return 0;

    const weights: Record<string, number> = {
      job_change: 0.65,
      tenure_signal: 0.35,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of eventSignals) {
      const weight = weights[signal.signalType] ?? 0.1;
      weightedSum += signal.signalStrength * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.min(1, weightedSum / totalWeight) : 0;
  }
}
