import type { CostConfig } from '../db/schema/data-sources.js';

export interface DefaultSourceConfig {
  name: string;
  displayName: string;
  type: 'search' | 'enrichment' | 'email_finding' | 'email_verification' | 'scraping';
  priority: number;
  capabilities: string[];
  costPerOperation: CostConfig;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  apiBaseUrl: string;
}

export const DEFAULT_SOURCE_CONFIGS: DefaultSourceConfig[] = [
  {
    name: 'apollo',
    displayName: 'Apollo.io',
    type: 'enrichment',
    priority: 1,
    capabilities: ['company_search', 'company_enrich', 'people_search', 'people_enrich'],
    costPerOperation: {
      company_search: { baseCostCredits: 0, description: 'Free search (no credits consumed)' },
      company_enrich: { baseCostCredits: 1, description: '1 credit per org enrich (from API credits_consumed)' },
      people_search: { baseCostCredits: 0, description: 'Free api_search; bulk_match credits from API' },
      people_enrich: { baseCostCredits: 1, description: '1-9 credits per person match (from API credits_consumed)' },
    },
    rateLimitPerMinute: 100,
    rateLimitPerDay: 10000,
    apiBaseUrl: 'https://api.apollo.io/api/v1',
  },
  {
    name: 'leadmagic',
    displayName: 'LeadMagic',
    type: 'enrichment',
    priority: 2,
    capabilities: ['company_enrich', 'people_enrich', 'email_find'],
    costPerOperation: {
      company_enrich: { baseCostCredits: 1, description: '1 credit per company ($0.008-0.024/cr)' },
      people_enrich: { baseCostCredits: 1, description: '1 credit per profile search ($0.008-0.024/cr)' },
      email_find: { baseCostCredits: 1, description: '1 credit per email found ($0.008-0.024/cr)' },
    },
    rateLimitPerMinute: 60,
    apiBaseUrl: 'https://api.leadmagic.io/v1',
  },
  {
    name: 'prospeo',
    displayName: 'Prospeo',
    type: 'email_finding',
    priority: 3,
    capabilities: ['email_find', 'email_verify', 'people_enrich', 'people_search'],
    costPerOperation: {
      email_find: { baseCostCredits: 1, description: '1 credit per valid email found' },
      email_verify: { baseCostCredits: 0.5, description: '0.5 credit per valid verification' },
      people_enrich: { baseCostCredits: 1, description: '1 credit per person match' },
      people_search: { baseCostCredits: 1, description: '1 credit per search query' },
    },
    rateLimitPerMinute: 60,
    apiBaseUrl: 'https://api.prospeo.io',
  },
  {
    name: 'exa',
    displayName: 'Exa.ai',
    type: 'search',
    priority: 4,
    capabilities: ['company_search', 'company_enrich'],
    costPerOperation: {
      company_search: { baseCostCredits: 0.032, description: '$7/1k search + $1/1k contents (~25 results)' },
      company_enrich: { baseCostCredits: 0.008, description: '$7/1k search + $1/1k contents (1 result)' },
    },
    rateLimitPerMinute: 600,
    apiBaseUrl: 'https://api.exa.ai',
  },
  {
    name: 'tavily',
    displayName: 'Tavily',
    type: 'search',
    priority: 5,
    capabilities: ['company_search', 'company_enrich'],
    costPerOperation: {
      company_search: { baseCostCredits: 1, description: '1 credit per basic search (from API usage.credits)' },
      company_enrich: { baseCostCredits: 3, description: 'search + extract credits (from API usage.credits)' },
    },
    rateLimitPerMinute: 900,
    apiBaseUrl: 'https://api.tavily.com',
  },
  {
    name: 'apify',
    displayName: 'Apify',
    type: 'scraping',
    priority: 6,
    capabilities: ['company_enrich', 'people_enrich'],
    costPerOperation: {
      company_enrich: { baseCostCredits: 1, description: '~$0.01 per LinkedIn company scrape' },
      people_enrich: { baseCostCredits: 1, description: '~$0.01 per LinkedIn profile scrape' },
    },
    rateLimitPerMinute: 300,
    apiBaseUrl: 'https://api.apify.com/v2',
  },
  {
    name: 'parallel',
    displayName: 'Parallel.ai',
    type: 'enrichment',
    priority: 7,
    capabilities: ['company_enrich', 'people_enrich'],
    costPerOperation: {
      company_enrich: { baseCostCredits: 1, description: '~$0.20 per pro task' },
      people_enrich: { baseCostCredits: 1, description: '~$0.20 per pro task' },
    },
    rateLimitPerMinute: 2000,
    apiBaseUrl: 'https://api.parallel.ai',
  },
  {
    name: 'valyu',
    displayName: 'Valyu',
    type: 'search',
    priority: 8,
    capabilities: ['company_search', 'company_enrich'],
    costPerOperation: {
      company_search: { baseCostCredits: 0.15, description: '$1.50 per 1k web searches' },
      company_enrich: { baseCostCredits: 0.1, description: '$0.001 per URL + AI summary' },
    },
    rateLimitPerMinute: 300,
    apiBaseUrl: 'https://api.valyu.ai/v1',
  },
  {
    name: 'diffbot',
    displayName: 'Diffbot',
    type: 'enrichment',
    priority: 9,
    capabilities: ['company_search', 'company_enrich', 'people_search', 'people_enrich', 'email_find'],
    costPerOperation: {
      company_search: { baseCostCredits: 0.5, description: '~0.5 credits per DQL search result' },
      company_enrich: { baseCostCredits: 1, description: '25 KG credits per Enhance entity' },
      people_search: { baseCostCredits: 0.5, description: '~0.5 credits per DQL search result' },
      people_enrich: { baseCostCredits: 1, description: '25 KG credits per Enhance entity' },
      email_find: { baseCostCredits: 1, description: '25 KG credits via person Enhance' },
    },
    rateLimitPerMinute: 300,
    apiBaseUrl: 'https://kg.diffbot.com/kg/v3',
  },
  {
    name: 'browserbase',
    displayName: 'Browserbase',
    type: 'scraping',
    priority: 10,
    capabilities: ['company_enrich'],
    costPerOperation: {
      company_enrich: { baseCostCredits: 1, description: '~$0.10/min browser session per enrichment' },
    },
    rateLimitPerMinute: 50,
    apiBaseUrl: 'https://api.browserbase.com/v1',
  },
  {
    name: 'agentql',
    displayName: 'AgentQL',
    type: 'scraping',
    priority: 11,
    capabilities: ['company_enrich'],
    costPerOperation: {
      company_enrich: { baseCostCredits: 1, description: '~$0.015-0.02 per API call' },
    },
    rateLimitPerMinute: 50,
    apiBaseUrl: 'https://api.agentql.com/v1',
  },
  {
    name: 'firecrawl',
    displayName: 'Firecrawl',
    type: 'scraping',
    priority: 12,
    capabilities: ['company_search', 'company_enrich'],
    costPerOperation: {
      company_search: { baseCostCredits: 1, description: '2 credits per 10 search results' },
      company_enrich: { baseCostCredits: 2, description: '1-5 credits per extract job' },
    },
    rateLimitPerMinute: 100,
    apiBaseUrl: 'https://api.firecrawl.dev/v2',
  },
  {
    name: 'scrapegraph',
    displayName: 'ScrapeGraphAI',
    type: 'scraping',
    priority: 13,
    capabilities: ['company_search', 'company_enrich'],
    costPerOperation: {
      company_search: { baseCostCredits: 3, description: '30 credits per search query' },
      company_enrich: { baseCostCredits: 1, description: '10 credits per SmartScraper page' },
    },
    rateLimitPerMinute: 60,
    apiBaseUrl: 'https://api.scrapegraphai.com/v1',
  },
];
