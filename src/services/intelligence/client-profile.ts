import Anthropic from '@anthropic-ai/sdk';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import type { SourceOrchestrator } from '../source-orchestrator/index.js';
import type { ClientProfileWebsiteData } from '../../db/schema/intelligence.js';
import { logger } from '../../lib/logger.js';

const WEBSITE_ANALYSIS_PROMPT = `Analyze this company's website content and extract structured information.
Return ONLY valid JSON with these fields:
{
  "products": string[] (main products or services offered),
  "services": string[] (if different from products),
  "industries": string[] (industries the company operates in),
  "targetAudience": string (who they sell to),
  "competitors": string[] (mentioned or implied competitors),
  "valueProposition": string (their main value prop / what makes them different),
  "techStack": string[] (any technologies mentioned)
}

Use null for fields you cannot determine. Be concise.`;

export interface ClientProfileData {
  industry?: string;
  products?: string[];
  targetMarket?: string;
  competitors?: string[];
  valueProposition?: string;
}

export class ClientProfileService {
  private anthropic: Anthropic;

  constructor(
    private orchestrator: SourceOrchestrator,
    anthropicApiKey: string,
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
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
        const message = await this.anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: WEBSITE_ANALYSIS_PROMPT,
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
      targetAudience: analysisResult.targetAudience as string | undefined,
      competitors: analysisResult.competitors as string[] | undefined,
      valueProposition: analysisResult.valueProposition as string | undefined,
      techStack: companyData?.techStack ?? analysisResult.techStack as string[] | undefined,
    };

    // Update the profile with scraped data
    const db = getDb();
    const profile = await this.getOrCreateProfile(clientId);

    await db
      .update(schema.clientProfiles)
      .set({
        industry: profile.industry ?? companyData?.industry,
        products: (websiteData.products?.length ? websiteData.products : profile.products) ?? [],
        targetMarket: profile.targetMarket ?? websiteData.targetAudience,
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
