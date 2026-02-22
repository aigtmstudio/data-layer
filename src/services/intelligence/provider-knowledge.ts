// Static knowledge base mapping each provider's strengths, data characteristics,
// and signal detection capabilities. This is code (not DB) for speed and version control.

export interface ProviderProfile {
  name: string;
  displayName: string;
  /** 0-1: how commonly used this provider's data is by SDR tools (higher = more saturated) */
  commonalityScore: number;
  /** Industries where this provider excels */
  strongIndustries: string[];
  /** Operations this provider is best at, ranked by effectiveness */
  bestOperations: string[];
  /** Signal types this provider's data can help detect */
  detectableSignals: string[];
  /** Relative cost tier: 'low' | 'medium' | 'high' */
  costTier: 'low' | 'medium' | 'high';
  /** Average data freshness in days */
  dataFreshnessDays: number;
  /** What makes this provider's data unique */
  uniqueStrengths: string[];
}

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  apollo: {
    name: 'apollo',
    displayName: 'Apollo.io',
    commonalityScore: 0.95,
    strongIndustries: ['technology', 'saas', 'software', 'fintech', 'healthcare'],
    bestOperations: ['people_search', 'company_search', 'people_enrich', 'company_enrich'],
    detectableSignals: ['hiring_surge', 'recent_funding', 'tech_adoption'],
    costTier: 'low',
    dataFreshnessDays: 30,
    uniqueStrengths: ['Large contact database', 'Good email coverage', 'Intent signals'],
  },
  leadmagic: {
    name: 'leadmagic',
    displayName: 'LeadMagic',
    commonalityScore: 0.4,
    strongIndustries: ['technology', 'ecommerce', 'marketing'],
    bestOperations: ['email_find', 'company_enrich', 'people_enrich'],
    detectableSignals: ['tech_adoption'],
    costTier: 'low',
    dataFreshnessDays: 14,
    uniqueStrengths: ['Real-time email verification', 'Technographic data', 'IP-based enrichment'],
  },
  prospeo: {
    name: 'prospeo',
    displayName: 'Prospeo',
    commonalityScore: 0.3,
    strongIndustries: ['technology', 'consulting', 'professional_services'],
    bestOperations: ['email_find', 'email_verify', 'people_search'],
    detectableSignals: [],
    costTier: 'low',
    dataFreshnessDays: 7,
    uniqueStrengths: ['High email accuracy', 'LinkedIn scraping', 'Real-time verification'],
  },
  exa: {
    name: 'exa',
    displayName: 'Exa.ai',
    commonalityScore: 0.1,
    strongIndustries: ['technology', 'ai_ml', 'biotech', 'cleantech', 'deep_tech'],
    bestOperations: ['company_search', 'company_enrich'],
    detectableSignals: ['expansion', 'new_product_launch', 'recent_funding', 'leadership_change'],
    costTier: 'medium',
    dataFreshnessDays: 1,
    uniqueStrengths: ['Semantic search understands intent', 'Finds emerging companies', 'Real-time web data'],
  },
  tavily: {
    name: 'tavily',
    displayName: 'Tavily',
    commonalityScore: 0.1,
    strongIndustries: ['technology', 'media', 'finance', 'healthcare'],
    bestOperations: ['company_search', 'company_enrich'],
    detectableSignals: ['recent_funding', 'expansion', 'new_product_launch', 'leadership_change'],
    costTier: 'medium',
    dataFreshnessDays: 1,
    uniqueStrengths: ['AI-optimized search results', 'Real-time news and events', 'Good for recent signals'],
  },
  apify: {
    name: 'apify',
    displayName: 'Apify',
    commonalityScore: 0.2,
    strongIndustries: ['technology', 'ecommerce', 'retail', 'media'],
    bestOperations: ['company_enrich', 'people_enrich'],
    detectableSignals: ['hiring_surge', 'tech_adoption', 'expansion'],
    costTier: 'low',
    dataFreshnessDays: 1,
    uniqueStrengths: ['LinkedIn data scraping', 'Custom actor flexibility', 'Real-time scraping'],
  },
  parallel: {
    name: 'parallel',
    displayName: 'Parallel.ai',
    commonalityScore: 0.15,
    strongIndustries: ['technology', 'finance', 'consulting'],
    bestOperations: ['company_enrich', 'people_enrich'],
    detectableSignals: ['tech_adoption', 'hiring_surge'],
    costTier: 'medium',
    dataFreshnessDays: 7,
    uniqueStrengths: ['AI-powered deep enrichment', 'Multi-source aggregation', 'Structured output'],
  },
  valyu: {
    name: 'valyu',
    displayName: 'Valyu',
    commonalityScore: 0.05,
    strongIndustries: ['technology', 'ai_ml', 'research', 'academia'],
    bestOperations: ['company_search', 'company_enrich'],
    detectableSignals: ['new_product_launch', 'expansion'],
    costTier: 'low',
    dataFreshnessDays: 3,
    uniqueStrengths: ['Proprietary + web data blend', 'Very low cost', 'Good for niche/emerging companies'],
  },
  diffbot: {
    name: 'diffbot',
    displayName: 'Diffbot',
    commonalityScore: 0.15,
    strongIndustries: ['technology', 'enterprise', 'manufacturing', 'finance'],
    bestOperations: ['company_enrich', 'people_enrich', 'company_search', 'email_find'],
    detectableSignals: ['leadership_change', 'hiring_surge', 'recent_funding', 'tech_adoption', 'expansion'],
    costTier: 'high',
    dataFreshnessDays: 7,
    uniqueStrengths: ['Knowledge Graph with entity relationships', 'Structured web-wide data', 'Comprehensive org charts'],
  },
  browserbase: {
    name: 'browserbase',
    displayName: 'Browserbase',
    commonalityScore: 0.02,
    strongIndustries: ['technology', 'ecommerce', 'retail'],
    bestOperations: ['company_enrich'],
    detectableSignals: ['tech_adoption', 'new_product_launch'],
    costTier: 'medium',
    dataFreshnessDays: 0,
    uniqueStrengths: ['Real-time website scraping', 'Handles JS-rendered content', 'Bypasses bot protection'],
  },
  agentql: {
    name: 'agentql',
    displayName: 'AgentQL',
    commonalityScore: 0.02,
    strongIndustries: ['technology', 'saas'],
    bestOperations: ['company_enrich'],
    detectableSignals: ['tech_adoption'],
    costTier: 'low',
    dataFreshnessDays: 0,
    uniqueStrengths: ['AI-powered semantic extraction', 'Structured data from any page', 'Low cost'],
  },
  firecrawl: {
    name: 'firecrawl',
    displayName: 'Firecrawl',
    commonalityScore: 0.05,
    strongIndustries: ['technology', 'saas', 'ecommerce'],
    bestOperations: ['company_search', 'company_enrich'],
    detectableSignals: ['tech_adoption', 'new_product_launch'],
    costTier: 'medium',
    dataFreshnessDays: 0,
    uniqueStrengths: ['Schema-driven extraction', 'Multi-URL crawling', 'Clean markdown output'],
  },
  scrapegraph: {
    name: 'scrapegraph',
    displayName: 'ScrapeGraphAI',
    commonalityScore: 0.02,
    strongIndustries: ['technology', 'saas'],
    bestOperations: ['company_search', 'company_enrich'],
    detectableSignals: ['tech_adoption'],
    costTier: 'medium',
    dataFreshnessDays: 0,
    uniqueStrengths: ['AI-driven extraction', 'Natural language queries', 'Search + scrape combo'],
  },
};

/** Signal types the system can detect, with default weights and decay */
export const SIGNAL_DEFINITIONS: Record<string, {
  displayName: string;
  defaultWeight: number;
  decayDays: number;
  description: string;
}> = {
  recent_funding: {
    displayName: 'Recent Funding',
    defaultWeight: 0.9,
    decayDays: 180,
    description: 'Company received funding in the last 6 months',
  },
  hiring_surge: {
    displayName: 'Hiring Surge',
    defaultWeight: 0.8,
    decayDays: 90,
    description: 'Significant increase in job postings or headcount',
  },
  leadership_change: {
    displayName: 'Leadership Change',
    defaultWeight: 0.85,
    decayDays: 120,
    description: 'New C-suite or VP-level hire detected',
  },
  tech_adoption: {
    displayName: 'Technology Adoption',
    defaultWeight: 0.7,
    decayDays: 90,
    description: 'Company adopted new technology relevant to client offering',
  },
  expansion: {
    displayName: 'Geographic Expansion',
    defaultWeight: 0.75,
    decayDays: 120,
    description: 'Company expanding to new markets or opening new offices',
  },
  new_product_launch: {
    displayName: 'New Product/Service',
    defaultWeight: 0.65,
    decayDays: 90,
    description: 'Company launched a new product or service line',
  },
  pain_point_detected: {
    displayName: 'Pain Point Detected',
    defaultWeight: 0.95,
    decayDays: 60,
    description: 'AI detected a pain point matching client solution',
  },
  competitive_displacement: {
    displayName: 'Competitive Displacement',
    defaultWeight: 0.9,
    decayDays: 90,
    description: 'Company may be looking to switch from a competitor',
  },
};

/** Get originality weight for a provider (1 = very unique, 0 = very common) */
export function getProviderOriginalityWeight(providerName: string): number {
  const profile = PROVIDER_PROFILES[providerName];
  if (!profile) return 0.5;
  return 1 - profile.commonalityScore;
}

/** Get providers ranked by effectiveness for a specific industry + operation */
export function rankProvidersForContext(
  industry: string,
  operation: string,
  availableProviders: string[],
): string[] {
  return availableProviders
    .map(name => {
      const profile = PROVIDER_PROFILES[name];
      if (!profile) return { name, score: 0 };

      let score = 0;
      // Industry match bonus
      if (profile.strongIndustries.some(i => industry.toLowerCase().includes(i))) {
        score += 3;
      }
      // Operation effectiveness
      const opIndex = profile.bestOperations.indexOf(operation);
      if (opIndex >= 0) {
        score += 2 - (opIndex * 0.3);
      }
      // Originality bonus
      score += (1 - profile.commonalityScore) * 1.5;
      // Cost efficiency
      if (profile.costTier === 'low') score += 1;
      else if (profile.costTier === 'medium') score += 0.5;

      return { name, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(p => p.name);
}
