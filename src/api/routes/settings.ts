import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ServiceContainer } from '../../index.js';
import { config } from '../../config/index.js';

interface SettingsOpts {
  container: ServiceContainer;
}

export interface DataSourceInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  capabilities: string[];
  priority: number | null;
  required: boolean;
  active: boolean;
  envVars: string[]; // env var name(s) needed to activate this source
}

export const settingsRoutes: FastifyPluginAsync<SettingsOpts> = async (app, { container }) => {
  const { promptConfigService } = container;

  // GET /api/settings/data-sources — live status of every configured data source
  app.get('/data-sources', async (): Promise<{ data: DataSourceInfo[] }> => {
    const registeredProviders = new Set(container.orchestrator.getRegisteredProviders());

    const sources: DataSourceInfo[] = [
      // ── AI ─────────────────────────────────────────────────────────────
      {
        name: 'anthropic',
        displayName: 'Anthropic Claude',
        description: 'LLM backbone: signal detection, ICP scoring, hypothesis generation, engagement briefs, and market buzz analysis',
        category: 'AI',
        capabilities: ['LLM inference'],
        priority: null,
        required: true,
        active: true,
        envVars: ['ANTHROPIC_API_KEY'],
      },

      // ── Company & Contact Data (waterfall) ─────────────────────────────
      {
        name: 'apollo',
        displayName: 'Apollo.io',
        description: 'Primary source for company search, company enrichment, and contact (people) search and enrichment',
        category: 'Company & Contact Data',
        capabilities: ['company_search', 'company_enrich', 'people_search', 'people_enrich'],
        priority: 1,
        required: true,
        active: registeredProviders.has('apollo'),
        envVars: ['APOLLO_API_KEY'],
      },
      {
        name: 'leadmagic',
        displayName: 'LeadMagic',
        description: 'Company enrichment, contact discovery, and email finding',
        category: 'Company & Contact Data',
        capabilities: ['company_enrich', 'people_enrich', 'email_find'],
        priority: 2,
        required: true,
        active: registeredProviders.has('leadmagic'),
        envVars: ['LEADMAGIC_API_KEY'],
      },
      {
        name: 'prospeo',
        displayName: 'Prospeo',
        description: 'Email finding and verification, people search and enrichment',
        category: 'Company & Contact Data',
        capabilities: ['email_find', 'email_verify', 'people_search', 'people_enrich'],
        priority: 3,
        required: true,
        active: registeredProviders.has('prospeo'),
        envVars: ['PROSPEO_API_KEY'],
      },
      {
        name: 'exa',
        displayName: 'Exa.ai',
        description: 'Semantic company search and enrichment; primary news and tweet search for market signals',
        category: 'Company & Contact Data',
        capabilities: ['company_search', 'company_enrich', 'news_search', 'tweet_search'],
        priority: 4,
        required: false,
        active: registeredProviders.has('exa'),
        envVars: ['EXA_API_KEY'],
      },
      {
        name: 'tavily',
        displayName: 'Tavily',
        description: 'Web search for company discovery; fallback news search for market signals when Exa is unavailable',
        category: 'Company & Contact Data',
        capabilities: ['company_search', 'company_enrich', 'news_search'],
        priority: 5,
        required: false,
        active: registeredProviders.has('tavily'),
        envVars: ['TAVILY_API_KEY'],
      },
      {
        name: 'apify',
        displayName: 'Apify',
        description: 'Social media scraping, LinkedIn data extraction, and influencer monitoring',
        category: 'Company & Contact Data',
        capabilities: ['company_enrich', 'people_enrich', 'social_monitoring'],
        priority: 6,
        required: false,
        active: registeredProviders.has('apify'),
        envVars: ['APIFY_API_KEY'],
      },
      {
        name: 'parallel',
        displayName: 'Parallel.ai',
        description: 'Company and contact enrichment',
        category: 'Company & Contact Data',
        capabilities: ['company_enrich', 'people_enrich'],
        priority: 7,
        required: false,
        active: registeredProviders.has('parallel'),
        envVars: ['PARALLEL_API_KEY'],
      },
      {
        name: 'valyu',
        displayName: 'Valyu',
        description: 'Company search and enrichment',
        category: 'Company & Contact Data',
        capabilities: ['company_search', 'company_enrich'],
        priority: 8,
        required: false,
        active: registeredProviders.has('valyu'),
        envVars: ['VALYU_API_KEY'],
      },
      {
        name: 'diffbot',
        displayName: 'Diffbot',
        description: 'Company and contact search and enrichment via knowledge graph; email finding',
        category: 'Company & Contact Data',
        capabilities: ['company_search', 'company_enrich', 'people_search', 'people_enrich', 'email_find'],
        priority: 9,
        required: false,
        active: registeredProviders.has('diffbot'),
        envVars: ['DIFFBOT_API_KEY'],
      },

      // ── Web Enrichment ─────────────────────────────────────────────────
      {
        name: 'jina',
        displayName: 'Jina Reader',
        description: 'Website content extraction for deep company profile enrichment (primary deep-enrich provider)',
        category: 'Web Enrichment',
        capabilities: ['company_enrich'],
        priority: null,
        required: false,
        active: !!container.deepEnrichmentService,
        envVars: ['JINA_API_KEY'],
      },
      {
        name: 'firecrawl',
        displayName: 'Firecrawl',
        description: 'Web scraping for company search, enrichment, and deep website analysis (fallback to Jina)',
        category: 'Web Enrichment',
        capabilities: ['company_search', 'company_enrich'],
        priority: 12,
        required: false,
        active: registeredProviders.has('firecrawl'),
        envVars: ['FIRECRAWL_API_KEY'],
      },
      {
        name: 'browserbase',
        displayName: 'Browserbase',
        description: 'Headless cloud browser for enriching JavaScript-heavy or auth-gated websites',
        category: 'Web Enrichment',
        capabilities: ['company_enrich'],
        priority: 10,
        required: false,
        active: registeredProviders.has('browserbase'),
        envVars: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'],
      },
      {
        name: 'agentql',
        displayName: 'AgentQL',
        description: 'AI-powered web data extraction and structured company enrichment',
        category: 'Web Enrichment',
        capabilities: ['company_enrich'],
        priority: 11,
        required: false,
        active: registeredProviders.has('agentql'),
        envVars: ['AGENTQL_API_KEY'],
      },
      {
        name: 'scrapegraph',
        displayName: 'ScrapeGraphAI',
        description: 'AI-powered web scraping for company search and enrichment',
        category: 'Web Enrichment',
        capabilities: ['company_search', 'company_enrich'],
        priority: 13,
        required: false,
        active: registeredProviders.has('scrapegraph'),
        envVars: ['SCRAPEGRAPH_API_KEY'],
      },

      // ── Monitoring ─────────────────────────────────────────────────────
      {
        name: 'uptimerobot',
        displayName: 'UptimeRobot',
        description: 'Competitor website uptime monitoring — detects outages as competitive intelligence signals',
        category: 'Monitoring',
        capabilities: ['competitor_monitoring'],
        priority: null,
        required: false,
        active: !!container.competitorMonitor,
        envVars: ['UPTIMEROBOT_API_KEY'],
      },

      // ── Exports ────────────────────────────────────────────────────────
      {
        name: 'google_sheets',
        displayName: 'Google Sheets',
        description: 'Export lists and contacts directly to a Google Sheets spreadsheet via service account',
        category: 'Exports',
        capabilities: ['export'],
        priority: null,
        required: false,
        active: !!(config.googleSheets.email && config.googleSheets.privateKey),
        envVars: ['GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SHEETS_PRIVATE_KEY'],
      },
    ];

    return { data: sources };
  });

  // GET /api/settings/prompts — list all prompts with current content
  app.get('/prompts', async () => {
    const prompts = await promptConfigService.listAll();
    return { data: prompts };
  });

  // PATCH /api/settings/prompts/:key — update a single prompt
  app.patch<{
    Params: { key: string };
    Body: { content: string };
  }>('/prompts/:key', async (request, reply) => {
    const { key } = request.params;
    const body = z.object({ content: z.string().min(1) }).parse(request.body);

    const updated = await promptConfigService.updatePrompt(key, body.content);
    return { data: updated };
  });

  // DELETE /api/settings/prompts/:key — reset a prompt to default
  app.delete<{
    Params: { key: string };
  }>('/prompts/:key', async (request) => {
    const { key } = request.params;
    const reset = await promptConfigService.resetPrompt(key);
    return { data: reset };
  });
};
