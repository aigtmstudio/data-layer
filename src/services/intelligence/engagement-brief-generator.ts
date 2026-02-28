import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq, and, isNull, inArray, gte } from 'drizzle-orm';
import type { EmploymentRecord } from '../../db/schema/contacts.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

// ─── Brief data structure ───────────────────────────────────────────

export interface EngagementBrief {
  version: 1;
  generatedAt: string;

  headline: string;

  whyThisPerson: {
    summary: string;
    fitFactors: { factor: string; detail: string; strength: number }[];
  };

  whyNow: {
    summary: string;
    triggers: {
      trigger: string;
      detail: string;
      strength: number;
      source: 'contact_signal' | 'company_signal' | 'market_signal';
      recency: string;
    }[];
  };

  companyContext: {
    summary: string;
    scale: string;
    relevantFactors: string[];
  };

  conversationStarters: {
    angle: string;
    opener: string;
    reasoning: string;
  }[];

  keyDataPoints: {
    contact: {
      name: string; title: string; seniority: string | null;
      email: string | null; phone: string | null;
      linkedin: string | null; location: string | null;
    };
    company: {
      name: string; domain: string | null; industry: string | null;
      employeeRange: string | null; revenueRange: string | null;
      fundingStage: string | null;
    };
    employmentArc: { title: string; company: string; period: string; isCurrent: boolean }[];
  };

  scores: {
    personaFit: number;
    signalScore: number;
    companySignalScore: number;
    icpFitScore: number;
  };

  inputHash: string;
}

export interface BriefGenerationResult {
  generated: number;
  skipped: number;
  failed: number;
  total: number;
}

// ─── LLM prompt ─────────────────────────────────────────────────────

const ENGAGEMENT_BRIEF_SYSTEM_PROMPT = `You are an expert sales intelligence analyst preparing engagement briefs for B2B sales professionals.

Rules:
1. SPECIFIC: Every claim must reference concrete data provided. Never make vague statements like "they're growing" without citing evidence.
2. ACTIONABLE: The reader should know exactly why to reach out and what to say.
3. CONCISE: Executives scan, not read. Every sentence must earn its place.
4. HONEST: If evidence is thin, say so. Never fabricate or exaggerate signals.

Generate 2-4 conversation starters, ordered by strength of supporting evidence.
For whyNow — if there are no event-based signals, focus on structural timing (e.g. "company at growth stage where this need typically emerges"). If there ARE event signals, lead with those.
For companyContext.relevantFactors — only include PESTLE dimensions with actual evidence from the website profile. Never pad with generic observations. Omit this array if no PESTLE data is available.
The headline should be specific and memorable — mention the person's title, a key signal, and the company type.

Return ONLY valid JSON matching the requested schema. No markdown fencing, no commentary.`;

registerPrompt({
  key: 'brief.engagement.system',
  label: 'Engagement Brief Generation',
  area: 'Engagement Briefs',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for generating engagement briefs from contact + company intelligence',
  defaultContent: ENGAGEMENT_BRIEF_SYSTEM_PROMPT,
});

// ─── Service ────────────────────────────────────────────────────────

export class EngagementBriefGenerator {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;
  private log = logger.child({ service: 'engagement-brief' });

  constructor(anthropicClient: Anthropic) {
    this.anthropic = anthropicClient;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  async generateBriefsForList(params: {
    listId: string;
    personaScoreThreshold?: number;
    forceRegenerate?: boolean;
  }): Promise<BriefGenerationResult> {
    const db = getDb();
    const threshold = params.personaScoreThreshold ?? 0.5;

    // Load list with persona and ICP
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, params.listId));
    if (!list) throw new Error(`List not found: ${params.listId}`);
    if (list.type !== 'contact') throw new Error('Briefs can only be generated for contact lists');
    if (!list.personaId) throw new Error('List has no persona assigned');

    // Load all active contact members with scores
    const members = await db
      .select({
        memberId: schema.listMembers.id,
        contactId: schema.listMembers.contactId,
        companyId: schema.listMembers.companyId,
        personaScore: schema.listMembers.personaScore,
        signalScore: schema.listMembers.signalScore,
        icpFitScore: schema.listMembers.icpFitScore,
        engagementBrief: schema.listMembers.engagementBrief,
      })
      .from(schema.listMembers)
      .where(and(
        eq(schema.listMembers.listId, params.listId),
        isNull(schema.listMembers.removedAt),
      ));

    const qualifying = members.filter(m => {
      if (!m.contactId) return false;
      const persona = parseFloat(String(m.personaScore ?? '0'));
      const signal = parseFloat(String(m.signalScore ?? '0'));
      return persona >= threshold && (signal > 0 || persona >= 0.8);
    });

    this.log.info({ listId: params.listId, total: members.length, qualifying: qualifying.length }, 'Starting brief generation');

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const member of qualifying) {
      try {
        const brief = await this.generateSingleBrief({
          clientId: list.clientId,
          listMemberId: member.memberId,
          contactId: member.contactId!,
          companyId: member.companyId,
          personaId: list.personaId,
          icpId: list.icpId,
          existingBrief: member.engagementBrief as EngagementBrief | null,
          forceRegenerate: params.forceRegenerate,
          scores: {
            personaFit: parseFloat(String(member.personaScore ?? '0')),
            signalScore: parseFloat(String(member.signalScore ?? '0')),
            icpFitScore: parseFloat(String(member.icpFitScore ?? '0')),
          },
        });

        if (brief === null) {
          skipped++;
        } else {
          generated++;
        }
      } catch (err) {
        failed++;
        this.log.warn({ err, memberId: member.memberId }, 'Failed to generate brief for member');
      }
    }

    this.log.info({ listId: params.listId, generated, skipped, failed }, 'Brief generation complete');
    return { generated, skipped, failed, total: qualifying.length };
  }

  private async generateSingleBrief(params: {
    clientId: string;
    listMemberId: string;
    contactId: string;
    companyId: string | null;
    personaId: string;
    icpId: string | null;
    existingBrief: EngagementBrief | null;
    forceRegenerate?: boolean;
    scores: { personaFit: number; signalScore: number; icpFitScore: number };
  }): Promise<EngagementBrief | null> {
    const db = getDb();
    const now = new Date();

    // 1. Load contact
    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, params.contactId));
    if (!contact) throw new Error(`Contact not found: ${params.contactId}`);

    // 2. Load company (if linked)
    let company = null;
    if (params.companyId) {
      const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, params.companyId));
      company = c ?? null;
    }
    // Fall back to contact's companyId
    if (!company && contact.companyId) {
      const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, contact.companyId));
      company = c ?? null;
    }

    // 3. Load persona
    const [persona] = await db.select().from(schema.personas).where(eq(schema.personas.id, params.personaId));
    if (!persona) throw new Error(`Persona not found: ${params.personaId}`);

    // 4. Load ICP (optional)
    let icp = null;
    if (params.icpId) {
      const [i] = await db.select().from(schema.icps).where(eq(schema.icps.id, params.icpId));
      icp = i ?? null;
    }

    // 5. Load contact signals (non-expired)
    const contactSignals = await db
      .select()
      .from(schema.contactSignals)
      .where(and(
        eq(schema.contactSignals.contactId, params.contactId),
        eq(schema.contactSignals.clientId, params.clientId),
        gte(schema.contactSignals.expiresAt, now),
      ));

    // 6. Load company signals (non-expired)
    let companySignals: typeof schema.companySignals.$inferSelect[] = [];
    const companyId = params.companyId ?? contact.companyId;
    if (companyId) {
      companySignals = await db
        .select()
        .from(schema.companySignals)
        .where(and(
          eq(schema.companySignals.companyId, companyId),
          eq(schema.companySignals.clientId, params.clientId),
          gte(schema.companySignals.expiresAt, now),
        ));
    }

    // 7. Compute input hash and check staleness
    const inputHash = this.computeInputHash(contact, company, contactSignals, companySignals);
    if (!params.forceRegenerate && params.existingBrief?.inputHash === inputHash) {
      return null; // skip — data hasn't changed
    }

    // 8. Assemble LLM input
    const userMessage = this.buildUserMessage(contact, company, persona, icp, contactSignals, companySignals);

    // 9. Call Haiku
    let systemPrompt = ENGAGEMENT_BRIEF_SYSTEM_PROMPT;
    if (this.promptConfig) {
      try { systemPrompt = await this.promptConfig.getPrompt('brief.engagement.system'); } catch { /* use default */ }
    }

    const message = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('Empty LLM response');

    // 10. Parse JSON
    const fenceMatch = textBlock.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const cleaned = (fenceMatch ? fenceMatch[1] : textBlock.text).trim();
    const parsed = JSON.parse(cleaned) as Omit<EngagementBrief, 'version' | 'generatedAt' | 'keyDataPoints' | 'scores' | 'inputHash'>;

    // 11. Build full brief with factual data (not LLM-generated)
    const employmentHistory = (contact.employmentHistory as EmploymentRecord[]) ?? [];
    const companySignalScore = company ? parseFloat(String(company.signalScore ?? '0')) : 0;

    const brief: EngagementBrief = {
      version: 1,
      generatedAt: now.toISOString(),
      headline: parsed.headline,
      whyThisPerson: parsed.whyThisPerson,
      whyNow: parsed.whyNow,
      companyContext: parsed.companyContext,
      conversationStarters: parsed.conversationStarters,
      keyDataPoints: {
        contact: {
          name: contact.fullName ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
          title: contact.title ?? 'Unknown',
          seniority: contact.seniority,
          email: contact.workEmail,
          phone: contact.phone ?? contact.mobilePhone,
          linkedin: contact.linkedinUrl,
          location: [contact.city, contact.state, contact.country].filter(Boolean).join(', ') || null,
        },
        company: {
          name: company?.name ?? contact.companyName ?? 'Unknown',
          domain: company?.domain ?? contact.companyDomain,
          industry: company?.industry ?? null,
          employeeRange: company?.employeeRange ?? null,
          revenueRange: company?.revenueRange ?? null,
          fundingStage: company?.latestFundingStage ?? null,
        },
        employmentArc: employmentHistory.slice(0, 5).map(e => ({
          title: e.title,
          company: e.company,
          period: e.startDate
            ? `${e.startDate}${e.endDate ? ' – ' + e.endDate : ' – present'}`
            : 'Unknown',
          isCurrent: e.isCurrent,
        })),
      },
      scores: {
        personaFit: params.scores.personaFit,
        signalScore: params.scores.signalScore,
        companySignalScore,
        icpFitScore: params.scores.icpFitScore,
      },
      inputHash,
    };

    // 12. Persist
    await db.update(schema.listMembers).set({
      engagementBrief: brief,
      briefGeneratedAt: now,
    }).where(eq(schema.listMembers.id, params.listMemberId));

    this.log.info({ memberId: params.listMemberId, contactName: brief.keyDataPoints.contact.name }, 'Brief generated');
    return brief;
  }

  private buildUserMessage(
    contact: typeof schema.contacts.$inferSelect,
    company: typeof schema.companies.$inferSelect | null,
    persona: typeof schema.personas.$inferSelect,
    icp: typeof schema.icps.$inferSelect | null,
    contactSignals: typeof schema.contactSignals.$inferSelect[],
    companySignals: typeof schema.companySignals.$inferSelect[],
  ): string {
    const employmentHistory = (contact.employmentHistory as EmploymentRecord[]) ?? [];
    const sections: string[] = [];

    // Persona context
    sections.push(`## Target Persona: ${persona.name}
Title Patterns: ${(persona.titlePatterns as string[]).join(', ') || 'Any'}
Seniority Levels: ${(persona.seniorityLevels as string[]).join(', ') || 'Any'}
Departments: ${(persona.departments as string[]).join(', ') || 'Any'}`);

    // Contact profile
    sections.push(`## Contact Profile
Name: ${contact.fullName ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()}
Title: ${contact.title ?? 'Unknown'}
Seniority: ${contact.seniority ?? 'Unknown'}
Department: ${contact.department ?? 'Unknown'}
Location: ${[contact.city, contact.state, contact.country].filter(Boolean).join(', ') || 'Unknown'}`);

    // Employment history
    if (employmentHistory.length > 0) {
      const lines = employmentHistory.map(e =>
        `- ${e.title} at ${e.company}${e.startDate ? ` (${e.startDate}${e.endDate ? ' – ' + e.endDate : ' – present'})` : ''}`,
      );
      sections.push(`## Employment History\n${lines.join('\n')}`);
    }

    // Contact signals
    if (contactSignals.length > 0) {
      const FIT_TYPES = new Set(['title_match', 'seniority_match']);
      const fitLines = contactSignals.filter(s => FIT_TYPES.has(s.signalType)).map(s => {
        const data = s.signalData as { evidence?: string };
        return `- [FIT] ${s.signalType}: strength ${s.signalStrength}, ${data.evidence ?? ''}`;
      });
      const eventLines = contactSignals.filter(s => !FIT_TYPES.has(s.signalType)).map(s => {
        const data = s.signalData as { evidence?: string };
        return `- [SIGNAL] ${s.signalType}: strength ${s.signalStrength}, ${data.evidence ?? ''} (detected ${s.detectedAt.toISOString().slice(0, 10)})`;
      });
      sections.push(`## Contact Signals\n${[...fitLines, ...eventLines].join('\n')}`);
    }

    // Company profile
    if (company) {
      const companyLines = [
        `Name: ${company.name}`,
        company.domain && `Domain: ${company.domain}`,
        company.industry && `Industry: ${company.industry}${company.subIndustry ? ' / ' + company.subIndustry : ''}`,
        company.employeeCount && `Employees: ${company.employeeCount}${company.employeeRange ? ' (' + company.employeeRange + ')' : ''}`,
        company.revenueRange && `Revenue: ${company.revenueRange}`,
        company.totalFunding && `Total Funding: $${Number(company.totalFunding).toLocaleString()}`,
        company.latestFundingStage && `Latest Funding: ${company.latestFundingStage}${company.latestFundingDate ? ' (' + company.latestFundingDate.toISOString().slice(0, 10) + ')' : ''}`,
        company.techStack && (company.techStack as string[]).length > 0 && `Tech Stack: ${(company.techStack as string[]).join(', ')}`,
        company.description && `Description: ${company.description}`,
        `Location: ${[company.city, company.state, company.country].filter(Boolean).join(', ') || 'Unknown'}`,
      ].filter(Boolean);
      sections.push(`## Company: ${company.name}\n${companyLines.join('\n')}`);
    }

    // Company signals
    if (companySignals.length > 0) {
      const lines = companySignals.map(s => {
        const data = s.signalData as { evidence?: string };
        return `- ${s.signalType}: strength ${s.signalStrength}, ${data.evidence ?? ''} (expires ${s.expiresAt.toISOString().slice(0, 10)})`;
      });
      sections.push(`## Company Signals\n${lines.join('\n')}`);
    }

    // PESTLE analysis
    if (company?.websiteProfile) {
      sections.push(`## Website PESTLE Analysis\n${company.websiteProfile}`);
    }

    // ICP context (brief summary)
    if (icp) {
      const filters = icp.filters as Record<string, unknown>;
      const icpLines = [
        filters.industries && `Target Industries: ${(filters.industries as string[]).join(', ')}`,
        filters.employeeCountMin && `Min Employees: ${filters.employeeCountMin}`,
        filters.employeeCountMax && `Max Employees: ${filters.employeeCountMax}`,
        filters.techStack && `Target Tech: ${(filters.techStack as string[]).join(', ')}`,
      ].filter(Boolean);
      if (icpLines.length > 0) {
        sections.push(`## ICP Context\n${icpLines.join('\n')}`);
      }
    }

    // JSON schema for output
    sections.push(`## Required Output Schema
Return JSON with these fields:
{
  "headline": "One compelling sentence",
  "whyThisPerson": {
    "summary": "2-3 sentences",
    "fitFactors": [{"factor": "string", "detail": "string", "strength": 0.0-1.0}]
  },
  "whyNow": {
    "summary": "2-3 sentences",
    "triggers": [{"trigger": "string", "detail": "string", "strength": 0.0-1.0, "source": "contact_signal|company_signal|market_signal", "recency": "when"}]
  },
  "companyContext": {
    "summary": "2-3 sentences",
    "scale": "one phrase",
    "relevantFactors": ["PESTLE-derived bullets, only if evidence exists"]
  },
  "conversationStarters": [{"angle": "string", "opener": "string", "reasoning": "string"}]
}`);

    return sections.join('\n\n');
  }

  private computeInputHash(
    contact: typeof schema.contacts.$inferSelect,
    company: typeof schema.companies.$inferSelect | null,
    contactSignals: typeof schema.contactSignals.$inferSelect[],
    companySignals: typeof schema.companySignals.$inferSelect[],
  ): string {
    const data = JSON.stringify({
      c: { title: contact.title, seniority: contact.seniority, emp: contact.employmentHistory },
      co: company ? { name: company.name, wp: company.websiteProfile, ts: company.techStack, f: company.totalFunding } : null,
      cs: contactSignals.map(s => ({ t: s.signalType, str: s.signalStrength })),
      cos: companySignals.map(s => ({ t: s.signalType, str: s.signalStrength })),
    });
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }
}
