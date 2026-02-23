import Anthropic from '@anthropic-ai/sdk';
import type { IcpFilters, ProviderSearchHints } from '../../db/schema/icps.js';
import type { ProcessedSource, CrmInsights } from './source-processor.js';
import { logger } from '../../lib/logger.js';

function extractJson(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return JSON.parse(stripped);
}

// ── Types ──

export interface MultiSourceInput {
  sources: ProcessedSource[];
  clientId: string;
  existingFilters?: Partial<IcpFilters>;
  generatePersona?: boolean;
}

export interface ParseResult {
  filters: IcpFilters;
  providerHints: ProviderSearchHints;
  suggestedPersona?: SuggestedPersona;
  confidence: number;
  sourceContributions: Record<string, string[]>;
}

export interface SuggestedPersona {
  name: string;
  titlePatterns: string[];
  seniorityLevels: string[];
  departments: string[];
  reasoning: string;
}

// ── Single-source prompt (backward compat) ──

const SINGLE_SOURCE_SYSTEM_PROMPT = `You are an ICP (Ideal Customer Profile) parser for B2B sales.
Given a natural language description of an ideal customer, extract structured filters.

Return ONLY valid JSON matching this schema:
{
  "industries": string[],
  "employeeCountMin": number | null,
  "employeeCountMax": number | null,
  "revenueMin": number | null,
  "revenueMax": number | null,
  "fundingStages": string[],
  "countries": string[],
  "states": string[],
  "cities": string[],
  "techStack": string[],
  "techCategories": string[],
  "signals": string[],
  "keywords": string[],
  "foundedAfter": number | null,
  "foundedBefore": number | null
}

Rules:
- Revenue values in USD (convert if described as "millions" or "billions")
- Employee count: interpret "mid-market" as 100-1000, "enterprise" as 1000+, "SMB" as 1-100, "startup" as 1-50
- Countries as ISO 2-letter codes (US, GB, DE, etc.)
- For tech stack, list specific product names (e.g., "Salesforce" not "CRM")
- For signals, use snake_case descriptors (e.g., "recent_funding", "hiring_engineering", "new_product_launch")
- Only include fields that are explicitly or strongly implied by the input
- Omit fields that cannot be determined (set to null or empty array)`;

// ── Multi-source prompt ──

const MULTI_SOURCE_SYSTEM_PROMPT = `You are an advanced ICP (Ideal Customer Profile) builder for B2B sales intelligence.
You will receive data from multiple sources (documents, call transcripts, manual selectors, CRM deal data).
Your job is to synthesize all sources into a unified ICP definition that is optimized for data provider searches.

Return ONLY valid JSON matching this exact schema:
{
  "filters": {
    "industries": string[],
    "employeeCountMin": number | null,
    "employeeCountMax": number | null,
    "revenueMin": number | null,
    "revenueMax": number | null,
    "fundingStages": string[],
    "countries": string[],
    "states": string[],
    "cities": string[],
    "techStack": string[],
    "techCategories": string[],
    "signals": string[],
    "keywords": string[],
    "foundedAfter": number | null,
    "foundedBefore": number | null
  },
  "providerHints": {
    "semanticSearchQuery": string,
    "keywordSearchTerms": string[],
    "industryNaicsMapping": string[],
    "naturalLanguageDescription": string
  },
  "suggestedPersona": {
    "name": string,
    "titlePatterns": string[],
    "seniorityLevels": string[],
    "departments": string[],
    "reasoning": string
  } | null,
  "sourceContributions": {
    "document": string[],
    "transcript": string[],
    "classic": string[],
    "crm_csv": string[]
  },
  "confidence": number
}

Source priority rules:
1. "Classic selectors" are HARD CONSTRAINTS — the user explicitly chose these values. Always include them.
2. "CRM deal data" is PATTERN EVIDENCE — derive ICP criteria from what deals closed successfully.
3. "Documents" and "Transcripts" are CONTEXT CLUES — extract implied ICP criteria from the content.
4. When sources conflict, classic selectors win. Then CRM patterns. Then docs/transcripts.

Provider optimization rules:
- "semanticSearchQuery": Write a natural language search query (2-3 sentences) describing the ideal company, suitable for web/content search engines like Exa, Tavily, or Valyu. Be specific and descriptive.
- "keywordSearchTerms": Extract 5-15 highly specific keyword phrases that differentiate this ICP. Use terms that appear in company descriptions, not generic industry words.
- "industryNaicsMapping": If possible, map the industries to 2-6 digit NAICS codes. Include both broad and narrow codes.
- "naturalLanguageDescription": Write a 2-3 sentence human-readable summary of who this ICP targets.

suggestedPersona rules:
- Only generate if explicitly requested OR if call transcripts or CRM data clearly reveal buyer personas.
- titlePatterns: Use wildcard patterns like "VP of *", "Director of Engineering", "Head of *".
- seniorityLevels: One or more of: "c_suite", "vp", "director", "manager", "senior", "entry".
- departments: Functional areas like "Engineering", "Marketing", "Sales", "IT", "Operations", "Finance".
- Set to null if there isn't enough signal to suggest a persona.

General rules:
- Revenue values in USD (convert "millions"/"billions")
- Employee count: "mid-market" = 100-1000, "enterprise" = 1000+, "SMB" = 1-100, "startup" = 1-50
- Countries as ISO 2-letter codes (US, GB, DE, etc.)
- techStack: specific product names (e.g., "Salesforce" not "CRM")
- signals: snake_case descriptors (e.g., "recent_funding", "hiring_engineering")
- confidence: 0-1 based on how much supporting evidence exists across sources
- sourceContributions: list which fields each source type influenced (e.g., ["industries", "employeeCountMin"])
- Omit fields that cannot be determined (null or empty array)`;

// ── Parser class ──

export class IcpParser {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Original single-text parsing. Kept for backward compatibility.
   */
  async parseNaturalLanguage(input: string): Promise<{ filters: IcpFilters; confidence: number }> {
    logger.info({ inputLength: input.length }, 'Parsing ICP from natural language');

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SINGLE_SOURCE_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: input },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    const content = textBlock?.text;
    if (!content) throw new Error('Empty response from LLM');

    const parsed = extractJson(content);
    const filters = cleanFilters(parsed);

    const fieldCount = Object.values(filters).filter(v =>
      v != null && (Array.isArray(v) ? v.length > 0 : true),
    ).length;
    const confidence = Math.min(fieldCount / 8, 1);

    logger.info({ confidence, fieldCount }, 'ICP parsed successfully');

    return { filters, confidence };
  }

  /**
   * Multi-source ICP parsing. Combines up to 4 source types and produces
   * provider-optimized output (structured filters + semantic queries + persona).
   */
  async parseFromSources(input: MultiSourceInput): Promise<ParseResult> {
    const sourceTypes = input.sources.map(s => s.sourceType);
    logger.info({ sourceTypes, generatePersona: input.generatePersona }, 'Parsing ICP from multiple sources');

    const userPrompt = buildMultiSourcePrompt(input);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: MULTI_SOURCE_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    const content = textBlock?.text;
    if (!content) throw new Error('Empty response from LLM');

    const parsed = extractJson(content);

    // Clean and validate output
    const filters = cleanFilters(parsed.filters ?? parsed);

    // Merge classic selectors as hard constraints (override LLM output)
    const classicSource = input.sources.find(s => s.sourceType === 'classic');
    if (classicSource?.structuredData) {
      mergeClassicSelectors(filters, classicSource.structuredData);
    }

    // Also merge existing filters if provided
    if (input.existingFilters) {
      mergeClassicSelectors(filters, input.existingFilters);
    }

    const providerHints = cleanProviderHints(parsed.providerHints ?? {});
    const suggestedPersona = input.generatePersona !== false
      ? cleanPersona(parsed.suggestedPersona)
      : undefined;

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : calculateConfidence(filters, input.sources.length);

    const sourceContributions = parsed.sourceContributions ?? {};

    logger.info(
      { confidence, sourceTypes, hasPersona: !!suggestedPersona },
      'Multi-source ICP parsed successfully',
    );

    return {
      filters,
      providerHints,
      suggestedPersona,
      confidence,
      sourceContributions,
    };
  }
}

// ── Prompt builder ──

function buildMultiSourcePrompt(input: MultiSourceInput): string {
  const sections: string[] = [];

  sections.push(`Generate persona: ${input.generatePersona ? 'YES' : 'ONLY if strong evidence exists'}`);
  sections.push('');

  for (const source of input.sources) {
    switch (source.sourceType) {
      case 'document': {
        const fileName = source.metadata.fileName ?? 'Unknown document';
        sections.push(`=== DOCUMENT SOURCE: ${fileName} ===`);
        sections.push('Extract ICP criteria implied by this document content:');
        sections.push(source.rawText ?? '(empty)');
        sections.push('');
        break;
      }
      case 'transcript': {
        sections.push('=== CALL TRANSCRIPT SOURCE ===');
        sections.push('Extract ICP and persona criteria from this sales/discovery call:');
        sections.push(source.rawText ?? '(empty)');
        sections.push('');
        break;
      }
      case 'classic': {
        sections.push('=== CLASSIC SELECTORS (HARD CONSTRAINTS) ===');
        sections.push('These are user-specified filters. They MUST be included in the output:');
        sections.push(JSON.stringify(source.structuredData, null, 2));
        sections.push('');
        break;
      }
      case 'crm_csv': {
        sections.push('=== CRM DEAL DATA (PATTERN EVIDENCE) ===');
        const insights = source.crmInsights;
        if (insights) {
          sections.push(`Total closed-won deals analyzed: ${insights.totalDeals}`);
          sections.push(`Patterns: ${insights.patterns}`);
          if (insights.deals.length > 0) {
            sections.push('Sample deals (first 20):');
            sections.push(JSON.stringify(insights.deals.slice(0, 20), null, 2));
          }
        } else {
          sections.push('(no CRM data)');
        }
        sections.push('');
        break;
      }
    }
  }

  if (input.existingFilters) {
    sections.push('=== EXISTING ICP FILTERS (MERGE WITH) ===');
    sections.push(JSON.stringify(input.existingFilters, null, 2));
    sections.push('');
  }

  return sections.join('\n');
}

// ── Cleaners ──

function cleanFilters(raw: Record<string, unknown>): IcpFilters {
  const filters: IcpFilters = {};

  if (isNonEmptyArray(raw.industries)) filters.industries = raw.industries as string[];
  if (isNumber(raw.employeeCountMin)) filters.employeeCountMin = raw.employeeCountMin as number;
  if (isNumber(raw.employeeCountMax)) filters.employeeCountMax = raw.employeeCountMax as number;
  if (isNumber(raw.revenueMin)) filters.revenueMin = raw.revenueMin as number;
  if (isNumber(raw.revenueMax)) filters.revenueMax = raw.revenueMax as number;
  if (isNonEmptyArray(raw.fundingStages)) filters.fundingStages = raw.fundingStages as string[];
  if (isNumber(raw.foundedAfter)) filters.foundedAfter = raw.foundedAfter as number;
  if (isNumber(raw.foundedBefore)) filters.foundedBefore = raw.foundedBefore as number;
  if (isNonEmptyArray(raw.countries)) filters.countries = raw.countries as string[];
  if (isNonEmptyArray(raw.states)) filters.states = raw.states as string[];
  if (isNonEmptyArray(raw.cities)) filters.cities = raw.cities as string[];
  if (isNonEmptyArray(raw.techStack)) filters.techStack = raw.techStack as string[];
  if (isNonEmptyArray(raw.techCategories)) filters.techCategories = raw.techCategories as string[];
  if (isNonEmptyArray(raw.signals)) filters.signals = raw.signals as string[];
  if (isNonEmptyArray(raw.keywords)) filters.keywords = raw.keywords as string[];

  return filters;
}

function cleanProviderHints(raw: Record<string, unknown>): ProviderSearchHints {
  const hints: ProviderSearchHints = {};

  if (typeof raw.semanticSearchQuery === 'string' && raw.semanticSearchQuery) {
    hints.semanticSearchQuery = raw.semanticSearchQuery;
  }
  if (isNonEmptyArray(raw.keywordSearchTerms)) {
    hints.keywordSearchTerms = raw.keywordSearchTerms as string[];
  }
  if (isNonEmptyArray(raw.industryNaicsMapping)) {
    hints.industryNaicsMapping = raw.industryNaicsMapping as string[];
  }
  if (typeof raw.naturalLanguageDescription === 'string' && raw.naturalLanguageDescription) {
    hints.naturalLanguageDescription = raw.naturalLanguageDescription;
  }

  return hints;
}

function cleanPersona(raw: unknown): SuggestedPersona | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;

  if (!p.name || !isNonEmptyArray(p.titlePatterns)) return undefined;

  return {
    name: String(p.name),
    titlePatterns: p.titlePatterns as string[],
    seniorityLevels: isNonEmptyArray(p.seniorityLevels) ? p.seniorityLevels as string[] : [],
    departments: isNonEmptyArray(p.departments) ? p.departments as string[] : [],
    reasoning: typeof p.reasoning === 'string' ? p.reasoning : '',
  };
}

function mergeClassicSelectors(filters: IcpFilters, classic: Partial<IcpFilters>): void {
  // Classic selectors are hard constraints — they override LLM output
  for (const [key, value] of Object.entries(classic)) {
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (filters as Record<string, unknown>)[key] = value;
  }
}

function calculateConfidence(filters: IcpFilters, sourceCount: number): number {
  const fieldCount = Object.values(filters).filter(v =>
    v != null && (Array.isArray(v) ? v.length > 0 : true),
  ).length;
  // More sources + more fields = higher confidence
  const fieldScore = Math.min(fieldCount / 8, 1);
  const sourceBonus = Math.min((sourceCount - 1) * 0.1, 0.2);
  return Math.min(fieldScore + sourceBonus, 1);
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function isNumber(v: unknown): boolean {
  return typeof v === 'number' && !isNaN(v);
}
