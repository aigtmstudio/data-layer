import Anthropic from '@anthropic-ai/sdk';
import type { IcpFilters, ProviderSearchHints } from '../../db/schema/icps.js';
import type { ProcessedSource, CrmInsights } from './source-processor.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

function extractJson(text: string): Record<string, unknown> {
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

export const SINGLE_SOURCE_SYSTEM_PROMPT = `You are an ICP (Ideal Customer Profile) parser for B2B sales.
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

CRITICAL — Logical consistency:
Every filter must be internally consistent. Before outputting, review ALL filters and ask: "Would a real company matching this description actually have these attributes?"
- Do NOT include funding stages unless the description explicitly mentions venture-backed or funded companies.
- Do NOT include enterprise-only tools (Gong, Outreach, 6Sense) for ICPs targeting solopreneurs or micro-businesses.
- Do NOT include countries beyond what is stated. "English-speaking" = US, GB, CA, AU, NZ, IE only.
- Revenue should be proportional to employee count (solopreneurs: $0-$500K, not millions).

Employee count interpretation:
- "solopreneur" / "freelancer" / "self-employed" / "independent" = 1 (min and max both 1)
- "micro-business" = 1-5
- "small business" / "SMB" = 1-100
- "startup" = 1-50
- "mid-market" = 100-1000
- "enterprise" = 1000+

Revenue interpretation (proportional to company size):
- Solopreneurs/freelancers: $0-$500K
- Micro-businesses (1-10): $100K-$5M
- Small businesses (10-50): $1M-$25M
- Mid-market (100-1000): $10M-$500M
- Enterprise (1000+): $100M+
- Omit revenue (null) if the description doesn't provide enough signal.

Rules:
- Revenue values in USD (convert if described as "millions" or "billions")
- Countries as ISO 2-letter codes (US, GB, CA, AU, etc.)
- For tech stack, list specific product names that companies of this size would realistically use and pay for.
- For signals, use snake_case descriptors (e.g., "recent_funding", "hiring_engineering", "new_product_launch")
- ONLY include fields that are explicitly or strongly implied by the input
- Omit fields that cannot be determined (set to null or empty array) — do not guess

Industry naming rules (CRITICAL):
- Use LinkedIn's standard industry taxonomy names. These are used by data providers for exact matching.
- Common examples: "restaurants", "hospitality", "food & beverages", "information technology & services", "computer software", "financial services", "banking", "insurance", "real estate", "construction", "retail", "wholesale", "telecommunications", "pharmaceuticals", "medical devices", "health, wellness & fitness", "hospitals & health care", "education management", "e-learning", "automotive", "aviation & aerospace", "oil & energy", "mining & metals", "utilities", "logistics & supply chain", "warehousing", "marketing & advertising", "human resources", "staffing & recruiting", "accounting", "legal services", "management consulting", "mechanical or industrial engineering", "consumer electronics", "sporting goods", "furniture", "textiles", "food production", "dairy", "farming", "entertainment", "gambling & casinos", "leisure, travel & tourism", "broadcast media", "newspapers", "online media"
- Do NOT invent compound or descriptive industries like "restaurant technology" or "hospitality SaaS" — use the standard name and put the specificity in keywords instead.

Funding stage naming rules:
- Use lowercase_underscore codes: "seed", "angel", "venture", "series_a", "series_b", "series_c", "series_d", "series_e", "series_f", "pre_ipo", "ipo", "private_equity", "debt_financing", "grant"
- Do NOT use "Series A" or "Pre-IPO" — use the underscore form.`;

// ── Multi-source prompt ──

export const MULTI_SOURCE_SYSTEM_PROMPT = `You are an advanced ICP (Ideal Customer Profile) builder for B2B sales intelligence.
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

CRITICAL — Logical consistency:
Every filter must be internally consistent with the ICP description. Before outputting, review ALL filters together and ask: "Would a real company matching this ICP actually have these attributes?"
- If the ICP targets solopreneurs, freelancers, or self-employed individuals: employee count should be 1-1 or 1-2 max, revenue should be proportional (typically $0-$500K), funding stages should be EMPTY (solopreneurs don't raise VC), and tech stack should only include tools an individual would realistically use and pay for.
- If the ICP targets small agencies or consultancies: employee count 2-25, revenue $100K-$5M, no VC funding unless explicitly stated.
- If the ICP targets startups: employee count 1-50, revenue $0-$10M, funding stages only if growth-stage is mentioned.
- Do NOT include funding stages unless the ICP explicitly involves venture-backed or funded companies.
- Do NOT include tech tools that are only used by mid-market/enterprise companies (e.g., Gong, Outreach, 6Sense) for ICPs targeting solopreneurs or micro-businesses.
- Do NOT include countries beyond what the sources actually indicate. If the ICP mentions "English-speaking" markets, only include countries where English is the primary business language (US, GB, CA, AU, NZ, IE). Do not add DE, FR, NL, etc.

Employee count interpretation:
- "solopreneur" / "freelancer" / "self-employed" / "independent" = 1 (set both min and max to 1)
- "micro-business" / "1-person shop" = 1-5
- "small business" / "SMB" = 1-100
- "startup" = 1-50
- "mid-market" = 100-1000
- "enterprise" = 1000+
- Always match the employee range to what the source material actually describes. Do not default to broad ranges.

Revenue interpretation:
- Revenue should be proportional to employee count and company type.
- Solopreneurs/freelancers: typically $0-$500K (may be higher for consultants, but rarely above $1M)
- Micro-businesses (1-10): $100K-$5M
- Small businesses (10-50): $1M-$25M
- Mid-market (100-1000): $10M-$500M
- Enterprise (1000+): $100M+
- Only set revenue if the sources provide enough signal. When in doubt, omit it (set to null).

Provider optimization rules:
- "semanticSearchQuery": Write a natural language search query (2-3 sentences) describing the ideal company, suitable for web/content search engines like Exa, Tavily, or Valyu. Be specific and descriptive.
- "keywordSearchTerms": Extract 5-15 highly specific keyword phrases that differentiate this ICP. Use terms that appear in company descriptions, not generic industry words.
- "industryNaicsMapping": If possible, map the industries to 2-6 digit NAICS codes. Include both broad and narrow codes.
- "naturalLanguageDescription": Write a 2-3 sentence human-readable summary of who this ICP targets.

suggestedPersona rules:
- Only generate if explicitly requested via "Generate persona: YES".
- The persona MUST be the decision-maker or buyer at the ICP's target companies. It must be someone who works AT the type of company described by the ICP, not a random senior title.
- For solopreneurs/freelancers: the persona IS the solopreneur themselves (e.g., "Independent Consultant", "Freelance Designer"). They don't have departments or hierarchies.
- titlePatterns: Use wildcard patterns like "VP of *", "Director of Engineering", "Head of *".
- seniorityLevels: One or more of: "c_suite", "vp", "director", "manager", "senior", "entry", "owner".
- departments: Functional areas like "Engineering", "Marketing", "Sales", "IT", "Operations", "Finance". Leave empty for solopreneurs.
- Set to null if "Generate persona: NO" or there isn't enough signal.

General rules:
- Revenue values in USD (convert "millions"/"billions")
- Countries as ISO 2-letter codes (US, GB, CA, AU, etc.)
- techStack: specific product names that companies in this ICP would realistically use and pay for. Consider the company size — solopreneurs use tools like Calendly, Notion, Canva, not enterprise tools like Gong or Outreach.
- signals: snake_case descriptors (e.g., "recent_funding", "hiring_engineering")
- confidence: 0-1 based on how much supporting evidence exists across sources
- sourceContributions: list which fields each source type influenced (e.g., ["industries", "employeeCountMin"])
- ONLY include fields with actual evidence from the sources. Do not guess or pad with plausible-sounding values. When unsure, omit (null or empty array).

Industry naming rules (CRITICAL):
- Use LinkedIn's standard industry taxonomy names. These are used by data providers for exact matching.
- Common examples: "restaurants", "hospitality", "food & beverages", "information technology & services", "computer software", "financial services", "banking", "insurance", "real estate", "construction", "retail", "wholesale", "telecommunications", "pharmaceuticals", "medical devices", "health, wellness & fitness", "hospitals & health care", "education management", "e-learning", "automotive", "aviation & aerospace", "oil & energy", "mining & metals", "utilities", "logistics & supply chain", "warehousing", "marketing & advertising", "human resources", "staffing & recruiting", "accounting", "legal services", "management consulting", "mechanical or industrial engineering", "consumer electronics", "sporting goods", "furniture", "textiles", "food production", "dairy", "farming", "entertainment", "gambling & casinos", "leisure, travel & tourism", "broadcast media", "newspapers", "online media"
- Do NOT invent compound or descriptive industries like "restaurant technology" or "hospitality SaaS" — use the standard name and put the specificity in keywords instead.

Funding stage naming rules:
- Use lowercase_underscore codes: "seed", "angel", "venture", "series_a", "series_b", "series_c", "series_d", "series_e", "series_f", "pre_ipo", "ipo", "private_equity", "debt_financing", "grant"
- Do NOT use "Series A" or "Pre-IPO" — use the underscore form.`;

// ── Register prompts ──

registerPrompt({
  key: 'icp.single.system',
  label: 'ICP Single-Source Parsing',
  area: 'ICP Engine',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for parsing a natural language ICP description into structured filters',
  defaultContent: SINGLE_SOURCE_SYSTEM_PROMPT,
});

registerPrompt({
  key: 'icp.multi.system',
  label: 'ICP Multi-Source Parsing',
  area: 'ICP Engine',
  promptType: 'system',
  model: 'claude-sonnet-4-20250514',
  description: 'System prompt for synthesising multiple sources (docs, transcripts, CRM, selectors) into a unified ICP',
  defaultContent: MULTI_SOURCE_SYSTEM_PROMPT,
});

// ── Parser class ──

export class IcpParser {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(anthropicClient: Anthropic) {
    this.anthropic = anthropicClient;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  /**
   * Original single-text parsing. Kept for backward compatibility.
   */
  async parseNaturalLanguage(input: string): Promise<{ filters: IcpFilters; confidence: number }> {
    logger.info({ inputLength: input.length }, 'Parsing ICP from natural language');

    let singlePrompt = SINGLE_SOURCE_SYSTEM_PROMPT;
    if (this.promptConfig) {
      try { singlePrompt = await this.promptConfig.getPrompt('icp.single.system'); } catch { /* use default */ }
    }

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: singlePrompt,
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

    let multiPrompt = MULTI_SOURCE_SYSTEM_PROMPT;
    if (this.promptConfig) {
      try { multiPrompt = await this.promptConfig.getPrompt('icp.multi.system'); } catch { /* use default */ }
    }

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: multiPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    const content = textBlock?.text;
    if (!content) throw new Error('Empty response from LLM');

    const parsed = extractJson(content);

    // Clean and validate output
    const filters = cleanFilters((parsed.filters ?? parsed) as Record<string, unknown>);

    // Merge classic selectors as hard constraints (override LLM output)
    const classicSource = input.sources.find(s => s.sourceType === 'classic');
    if (classicSource?.structuredData) {
      mergeClassicSelectors(filters, classicSource.structuredData);
    }

    // Also merge existing filters if provided
    if (input.existingFilters) {
      mergeClassicSelectors(filters, input.existingFilters);
    }

    const providerHints = cleanProviderHints((parsed.providerHints ?? {}) as Record<string, unknown>);
    const suggestedPersona = input.generatePersona !== false
      ? cleanPersona(parsed.suggestedPersona)
      : undefined;

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : calculateConfidence(filters, input.sources.length);

    const sourceContributions = (parsed.sourceContributions ?? {}) as Record<string, string[]>;

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
