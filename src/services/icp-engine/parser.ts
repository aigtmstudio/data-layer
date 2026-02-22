import Anthropic from '@anthropic-ai/sdk';
import type { IcpFilters } from '../../db/schema/icps.js';
import { logger } from '../../lib/logger.js';

const SYSTEM_PROMPT = `You are an ICP (Ideal Customer Profile) parser for B2B sales.
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

export class IcpParser {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async parseNaturalLanguage(input: string): Promise<{ filters: IcpFilters; confidence: number }> {
    logger.info({ inputLength: input.length }, 'Parsing ICP from natural language');

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: input },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    const content = textBlock?.text;
    if (!content) throw new Error('Empty response from LLM');

    const parsed = JSON.parse(content);
    const filters = cleanFilters(parsed);

    const fieldCount = Object.values(filters).filter(v =>
      v != null && (Array.isArray(v) ? v.length > 0 : true),
    ).length;
    const confidence = Math.min(fieldCount / 8, 1);

    logger.info({ confidence, fieldCount }, 'ICP parsed successfully');

    return { filters, confidence };
  }
}

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

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function isNumber(v: unknown): boolean {
  return typeof v === 'number' && !isNaN(v);
}
