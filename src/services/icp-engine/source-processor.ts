import { parse } from 'csv-parse/sync';
import { DocumentExtractor } from '../../lib/document-extractor.js';
import type { IcpFilters } from '../../db/schema/icps.js';
import { logger } from '../../lib/logger.js';

// ── Types ──

export interface ProcessedSource {
  sourceType: 'document' | 'transcript' | 'classic' | 'crm_csv';
  rawText?: string;
  structuredData?: Partial<IcpFilters>;
  crmInsights?: CrmInsights;
  metadata: Record<string, unknown>;
}

export interface CrmDeal {
  companyName?: string;
  industry?: string;
  employeeCount?: number;
  country?: string;
  dealSize?: number;
  contactTitle?: string;
  contactDepartment?: string;
  contactSeniority?: string;
  notes?: string;
}

export interface CrmInsights {
  deals: CrmDeal[];
  totalDeals: number;
  commonIndustries: string[];
  commonCompanySizes: { min: number; max: number } | null;
  commonCountries: string[];
  topTitles: string[];
  topDepartments: string[];
  topSeniorityLevels: string[];
  averageDealSize: number | null;
  patterns: string; // NL summary for LLM
}

// ── Column name aliases for flexible CSV mapping ──

const COLUMN_ALIASES: Record<string, string[]> = {
  companyName: ['company', 'company_name', 'companyname', 'account', 'account_name', 'organization', 'org'],
  industry: ['industry', 'sector', 'vertical', 'market'],
  employeeCount: ['employees', 'employee_count', 'employeecount', 'company_size', 'headcount', 'num_employees'],
  country: ['country', 'location', 'region', 'hq_country', 'headquarters'],
  dealSize: ['deal_size', 'dealsize', 'amount', 'deal_amount', 'value', 'revenue', 'arr', 'contract_value', 'deal_value'],
  contactTitle: ['title', 'job_title', 'jobtitle', 'role', 'position', 'contact_title'],
  contactDepartment: ['department', 'dept', 'team', 'function', 'business_unit'],
  contactSeniority: ['seniority', 'level', 'seniority_level', 'job_level'],
  notes: ['notes', 'description', 'comments', 'details'],
};

export class SourceProcessor {
  constructor(private documentExtractor: DocumentExtractor) {}

  async processDocument(buffer: Buffer, mimeType: string, fileName?: string): Promise<ProcessedSource> {
    const extracted = await this.documentExtractor.extract(buffer, mimeType);
    return {
      sourceType: 'document',
      rawText: extracted.text,
      metadata: {
        fileName,
        ...extracted.metadata,
      },
    };
  }

  processTranscript(text: string): ProcessedSource {
    // Clean up common transcript artifacts
    const cleaned = text
      .replace(/\[(\d{1,2}:\d{2}(:\d{2})?)\]/g, '') // timestamps like [00:15]
      .replace(/^(Speaker \d+|Interviewer|Interviewee|Host|Guest):\s*/gm, '') // speaker labels
      .replace(/\n{3,}/g, '\n\n') // excessive newlines
      .trim();

    return {
      sourceType: 'transcript',
      rawText: cleaned,
      metadata: {
        originalLength: text.length,
        cleanedLength: cleaned.length,
      },
    };
  }

  processClassicSelectors(filters: Partial<IcpFilters>): ProcessedSource {
    return {
      sourceType: 'classic',
      structuredData: filters,
      metadata: {
        fieldCount: Object.values(filters).filter(v =>
          v != null && (Array.isArray(v) ? v.length > 0 : true),
        ).length,
      },
    };
  }

  async processCrmCsv(buffer: Buffer): Promise<ProcessedSource> {
    const csvText = buffer.toString('utf-8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    logger.info({ rowCount: records.length }, 'Parsing CRM CSV');

    // Map columns to our schema
    const headers = Object.keys(records[0]);
    const columnMap = mapColumns(headers);

    // Extract deals
    const deals: CrmDeal[] = records.map(row => ({
      companyName: getField(row, columnMap.companyName),
      industry: getField(row, columnMap.industry),
      employeeCount: parseOptionalNumber(getField(row, columnMap.employeeCount)),
      country: getField(row, columnMap.country),
      dealSize: parseOptionalNumber(getField(row, columnMap.dealSize)),
      contactTitle: getField(row, columnMap.contactTitle),
      contactDepartment: getField(row, columnMap.contactDepartment),
      contactSeniority: getField(row, columnMap.contactSeniority),
      notes: getField(row, columnMap.notes),
    }));

    const insights = analyzeDeals(deals);

    return {
      sourceType: 'crm_csv',
      crmInsights: insights,
      metadata: {
        rowCount: records.length,
        columnsDetected: Object.entries(columnMap)
          .filter(([, v]) => v != null)
          .map(([k]) => k),
      },
    };
  }
}

// ── Helpers ──

function mapColumns(headers: string[]): Record<string, string | null> {
  const normalized = headers.map(h => h.toLowerCase().replace(/[\s-]/g, '_'));
  const result: Record<string, string | null> = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const matchIdx = normalized.findIndex(h => aliases.includes(h));
    result[field] = matchIdx >= 0 ? headers[matchIdx] : null;
  }

  return result;
}

function getField(row: Record<string, string>, column: string | null): string | undefined {
  if (!column) return undefined;
  const val = row[column]?.trim();
  return val || undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? undefined : num;
}

function analyzeDeals(deals: CrmDeal[]): CrmInsights {
  const industries = countBy(deals.map(d => d.industry).filter(Boolean) as string[]);
  const countries = countBy(deals.map(d => d.country).filter(Boolean) as string[]);
  const titles = countBy(deals.map(d => d.contactTitle).filter(Boolean) as string[]);
  const departments = countBy(deals.map(d => d.contactDepartment).filter(Boolean) as string[]);
  const seniorityLevels = countBy(deals.map(d => d.contactSeniority).filter(Boolean) as string[]);

  const employeeCounts = deals.map(d => d.employeeCount).filter(Boolean) as number[];
  const dealSizes = deals.map(d => d.dealSize).filter(Boolean) as number[];

  const commonCompanySizes = employeeCounts.length >= 2
    ? { min: Math.min(...employeeCounts), max: Math.max(...employeeCounts) }
    : null;

  const averageDealSize = dealSizes.length > 0
    ? dealSizes.reduce((a, b) => a + b, 0) / dealSizes.length
    : null;

  // Build NL patterns summary
  const patternParts: string[] = [];
  if (industries.length > 0) {
    patternParts.push(`Top industries: ${industries.slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  }
  if (commonCompanySizes) {
    patternParts.push(`Company sizes range from ${commonCompanySizes.min} to ${commonCompanySizes.max} employees`);
  }
  if (countries.length > 0) {
    patternParts.push(`Countries: ${countries.slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  }
  if (titles.length > 0) {
    patternParts.push(`Common buyer titles: ${titles.slice(0, 8).map(([k]) => k).join(', ')}`);
  }
  if (departments.length > 0) {
    patternParts.push(`Departments: ${departments.slice(0, 5).map(([k]) => k).join(', ')}`);
  }
  if (averageDealSize != null) {
    patternParts.push(`Average deal size: $${Math.round(averageDealSize).toLocaleString()}`);
  }

  return {
    deals,
    totalDeals: deals.length,
    commonIndustries: industries.slice(0, 10).map(([k]) => k),
    commonCompanySizes,
    commonCountries: countries.slice(0, 10).map(([k]) => k),
    topTitles: titles.slice(0, 10).map(([k]) => k),
    topDepartments: departments.slice(0, 10).map(([k]) => k),
    topSeniorityLevels: seniorityLevels.slice(0, 5).map(([k]) => k),
    averageDealSize,
    patterns: patternParts.join('. ') || 'No clear patterns detected from CSV data.',
  };
}

function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const normalized = v.trim();
    if (normalized) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
