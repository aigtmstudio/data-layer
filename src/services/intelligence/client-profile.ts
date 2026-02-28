import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import type { SourceOrchestrator } from '../source-orchestrator/index.js';
import type { ClientProfileWebsiteData } from '../../db/schema/intelligence.js';
import { logger } from '../../lib/logger.js';
import { registerPrompt, type PromptConfigService } from '../prompt-config/index.js';

export const WEBSITE_ANALYSIS_PROMPT = `Analyze this company's website content and extract structured information.
Return ONLY valid JSON with these fields:
{
  "products": string[] (main products or services offered),
  "services": string[] (if different from products),
  "industries": string[] (industries the company operates in),
  "targetAudience": {
    "description": string (who they sell to — be specific about company types, sizes, verticals),
    "evidenceFromCaseStudies": string[] (names or descriptions of companies from case studies, testimonials, or logos sections — these reveal who actually buys from them),
    "buyerPersonas": string[] (job titles or roles mentioned in testimonials, case studies, or "built for" language)
  },
  "competitors": string[] (mentioned or implied competitors),
  "valueProposition": string (their main value prop / what makes them different),
  "techStack": string[] (any technologies mentioned),
  "geographies": string[] (countries, regions, or markets they serve — look for office locations, "serving customers in...", language/currency options, or geographic references in case studies),
  "strategicJTBD": [
    {
      "goal": string (high-level strategic challenge or goal they help companies achieve),
      "exacerbatingConditions": string[] (market conditions, events, or trends that would make this goal more urgent)
    }
  ] (2-4 items: what high-level business challenges does this company solve for their market? Think about what macro events or conditions would make companies desperately need this),
  "companyTriggers": string[] (internal company events that would make a prospect more likely to need this product — e.g. "rapid headcount growth", "new CTO hire", "migrating to cloud", "post-acquisition integration", "expanding into new markets". Be specific to what this company actually does),
  "personaJTBD": [
    {
      "persona": string (the type of person / role this applies to),
      "goals": string[] (what this persona is trying to achieve day-to-day that the product helps with),
      "painPoints": string[] (specific frustrations or challenges the product alleviates for this persona)
    }
  ] (1-3 items: what individual-level challenges does this company help their target personas with?)
}

Important guidance:
- For targetAudience: look beyond "About" pages. Case studies, testimonials, customer logos, and "trusted by" sections reveal who actually buys. Note specific company names, industries, and the job titles of people quoted in testimonials.
- For strategicJTBD: think about what would make an entire market segment urgently need this product. What regulatory changes, economic shifts, competitive pressures, or industry trends would exacerbate the problems this company solves?
- For companyTriggers: think about observable, detectable events inside a company (hiring patterns, technology changes, leadership changes, expansion, funding) that would create a buying need for this specific product.
- For personaJTBD: focus on the daily reality of the people who use or buy this product. What are they measured on? What frustrates them?

Use null for fields you cannot determine. Be thorough but concise.`;

export interface ClientProfileData {
  industry?: string;
  products?: string[];
  targetMarket?: string;
  competitors?: string[];
  valueProposition?: string;
}

registerPrompt({
  key: 'client.website.analysis.system',
  label: 'Website Analysis',
  area: 'Client Profile',
  promptType: 'system',
  model: 'claude-haiku-4-5-20251001',
  description: 'System prompt for extracting structured company info, JTBD, triggers, and geographies from website content',
  defaultContent: WEBSITE_ANALYSIS_PROMPT,
});

export class ClientProfileService {
  private anthropic: Anthropic;
  private promptConfig?: PromptConfigService;

  constructor(
    private orchestrator: SourceOrchestrator,
    anthropicClient: Anthropic,
  ) {
    this.anthropic = anthropicClient;
  }

  setPromptConfig(promptConfig: PromptConfigService) {
    this.promptConfig = promptConfig;
  }

  async getOrCreateProfile(clientId: string) {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.clientId, clientId));

    if (existing) return existing;

    const [created] = await db
      .insert(schema.clientProfiles)
      .values({ clientId })
      .returning();

    return created;
  }

  async getProfile(clientId: string) {
    const db = getDb();
    const [profile] = await db
      .select()
      .from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.clientId, clientId));
    return profile ?? null;
  }

  async updateProfile(clientId: string, data: ClientProfileData) {
    const db = getDb();
    const profile = await this.getOrCreateProfile(clientId);

    await db
      .update(schema.clientProfiles)
      .set({
        industry: data.industry ?? profile.industry,
        products: data.products ?? profile.products,
        targetMarket: data.targetMarket ?? profile.targetMarket,
        competitors: data.competitors ?? profile.competitors,
        valueProposition: data.valueProposition ?? profile.valueProposition,
        updatedAt: new Date(),
      })
      .where(eq(schema.clientProfiles.id, profile.id));

    return this.getProfile(clientId);
  }

  async autoEnrichFromWebsite(clientId: string, websiteUrl: string) {
    const log = logger.child({ clientId, websiteUrl });
    log.info('Auto-enriching client profile from website');

    // Use the orchestrator to scrape the client's own website
    const domain = this.extractDomain(websiteUrl);
    const { result: companyData } = await this.orchestrator.enrichCompany(
      clientId,
      { domain },
      { maxProviders: 2 },
    );

    // Use Claude to analyze the enriched data and extract structured profile info
    const websiteContent = [
      companyData?.description,
      companyData?.industry ? `Industry: ${companyData.industry}` : null,
      companyData?.techStack?.length ? `Tech stack: ${companyData.techStack.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    let analysisResult: Record<string, unknown> = {};

    if (websiteContent.length > 20) {
      try {
        let websitePrompt = WEBSITE_ANALYSIS_PROMPT;
        if (this.promptConfig) {
          try { websitePrompt = await this.promptConfig.getPrompt('client.website.analysis.system'); } catch { /* use default */ }
        }

        const message = await this.anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: websitePrompt,
          messages: [{ role: 'user', content: websiteContent }],
        });

        const textBlock = message.content.find(b => b.type === 'text');
        if (textBlock?.text) {
          analysisResult = JSON.parse(textBlock.text);
        }
      } catch (error) {
        log.warn({ error }, 'Failed to analyze website content with LLM');
      }
    }

    // Build the website data record
    const websiteData: ClientProfileWebsiteData = {
      scrapedUrl: websiteUrl,
      title: companyData?.name,
      description: companyData?.description,
      products: analysisResult.products as string[] | undefined,
      services: analysisResult.services as string[] | undefined,
      industries: analysisResult.industries as string[] | undefined,
      targetAudience: analysisResult.targetAudience as ClientProfileWebsiteData['targetAudience'],
      competitors: analysisResult.competitors as string[] | undefined,
      valueProposition: analysisResult.valueProposition as string | undefined,
      techStack: companyData?.techStack ?? analysisResult.techStack as string[] | undefined,
      geographies: analysisResult.geographies as string[] | undefined,
      strategicJTBD: analysisResult.strategicJTBD as ClientProfileWebsiteData['strategicJTBD'],
      companyTriggers: analysisResult.companyTriggers as string[] | undefined,
      personaJTBD: analysisResult.personaJTBD as ClientProfileWebsiteData['personaJTBD'],
    };

    // Update the profile with scraped data
    const db = getDb();
    const profile = await this.getOrCreateProfile(clientId);

    await db
      .update(schema.clientProfiles)
      .set({
        industry: profile.industry ?? companyData?.industry,
        products: (websiteData.products?.length ? websiteData.products : profile.products) ?? [],
        targetMarket: profile.targetMarket ?? (
          typeof websiteData.targetAudience === 'string'
            ? websiteData.targetAudience
            : websiteData.targetAudience?.description
        ),
        competitors: (websiteData.competitors?.length ? websiteData.competitors : profile.competitors) ?? [],
        valueProposition: profile.valueProposition ?? websiteData.valueProposition,
        websiteData,
        lastScrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.clientProfiles.id, profile.id));

    log.info('Client profile auto-enriched from website');
    return this.getProfile(clientId);
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
}
