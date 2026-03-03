import { buildApp } from './api/index.js';
import { initDb, closeDb } from './db/index.js';
import { config } from './config/index.js';
import { Scheduler } from './services/scheduler/index.js';
import { SourceOrchestrator } from './services/source-orchestrator/index.js';
import { CreditManager } from './services/credit-manager/index.js';
import { EnrichmentPipeline } from './services/enrichment/index.js';
import { ListBuilder } from './services/list-builder/index.js';
import { ExportEngine } from './services/export/index.js';
import { IcpParser } from './services/icp-engine/parser.js';
import { SourceProcessor } from './services/icp-engine/source-processor.js';
import { DocumentExtractor } from './lib/document-extractor.js';
import {
  ProviderPerformanceTracker,
  ClientProfileService,
  SignalDetector,
  IntelligenceScorer,
  StrategyGenerator,
  DynamicOrchestrator,
  HypothesisGenerator,
  MarketSignalProcessor,
  PersonaSignalDetector,
  DeepEnrichmentService,
  MarketSignalSearcher,
  EngagementBriefGenerator,
  MarketBuzzGenerator,
} from './services/intelligence/index.js';
import { ApolloProvider } from './providers/apollo/index.js';
import { LeadMagicProvider } from './providers/leadmagic/index.js';
import { ProspeoProvider } from './providers/prospeo/index.js';
import { ExaProvider } from './providers/exa/index.js';
import { TavilyProvider } from './providers/tavily/index.js';
import { ApifyProvider } from './providers/apify/index.js';
import { ParallelProvider } from './providers/parallel/index.js';
import { ValyuProvider } from './providers/valyu/index.js';
import { DiffbotProvider } from './providers/diffbot/index.js';
import { BrowserbaseProvider } from './providers/browserbase/index.js';
import { AgentQlProvider } from './providers/agentql/index.js';
import { FirecrawlProvider } from './providers/firecrawl/index.js';
import { ScrapeGraphProvider } from './providers/scrapegraph/index.js';
import { JinaProvider } from './providers/jina/index.js';
import { CompanyDiscoveryService } from './services/company-discovery/index.js';
import { InfluencerMonitorService } from './services/intelligence/influencer-monitor.js';
import { CompetitorMonitorService } from './services/intelligence/competitor-monitor.js';
import { MarketBuilderService } from './services/intelligence/market-builder.js';
import { UptimeRobotProvider } from './providers/uptimerobot/index.js';
import { PromptConfigService } from './services/prompt-config/index.js';
import { createTrackedAnthropicClient } from './lib/llm-tracker.js';
import { logger } from './lib/logger.js';

export interface ServiceContainer {
  creditManager: CreditManager;
  orchestrator: SourceOrchestrator;
  enrichmentPipeline: EnrichmentPipeline;
  listBuilder: ListBuilder;
  exportEngine: ExportEngine;
  icpParser: IcpParser;
  sourceProcessor: SourceProcessor;
  scheduler: Scheduler;
  promptConfigService: PromptConfigService;
  // Intelligence layer
  performanceTracker: ProviderPerformanceTracker;
  clientProfileService: ClientProfileService;
  signalDetector: SignalDetector;
  intelligenceScorer: IntelligenceScorer;
  strategyGenerator: StrategyGenerator;
  dynamicOrchestrator: DynamicOrchestrator;
  // Signal pipeline
  hypothesisGenerator: HypothesisGenerator;
  marketSignalProcessor: MarketSignalProcessor;
  personaSignalDetector: PersonaSignalDetector;
  // Deep enrichment + evidence search (optional — depend on provider API keys)
  deepEnrichmentService?: DeepEnrichmentService;
  marketSignalSearcher?: MarketSignalSearcher;
  // Engagement briefs
  engagementBriefGenerator: EngagementBriefGenerator;
  // Market buzz
  marketBuzzGenerator: MarketBuzzGenerator;
  // Company discovery (already exists, expose for discovery routes)
  companyDiscovery: CompanyDiscoveryService;
  // Influencer monitoring (optional — requires Apify)
  influencerMonitor?: InfluencerMonitorService;
  // Competitor downtime monitoring (optional — requires UptimeRobot)
  competitorMonitor?: CompetitorMonitorService;
  // Market builder AI strategist
  marketBuilder: MarketBuilderService;
}

let container: ServiceContainer;

export function getServiceContainer(): ServiceContainer {
  if (!container) throw new Error('Service container not initialized');
  return container;
}

async function main() {
  // 1. Initialize database
  initDb(config.databaseUrl);
  logger.info('Database initialized');

  // 2. Initialize prompt config service
  const promptConfigService = new PromptConfigService();
  await promptConfigService.loadCache();
  logger.info('Prompt config loaded');

  // 3. Initialize services
  const creditManager = new CreditManager();
  const orchestrator = new SourceOrchestrator(creditManager);

  // Instantiate providers (shared across orchestrator + signal services)
  const exaProvider = config.exaApiKey ? new ExaProvider(config.exaApiKey) : undefined;
  const tavilyProvider = config.tavilyApiKey ? new TavilyProvider(config.tavilyApiKey) : undefined;
  const apifyProvider = config.apifyApiKey ? new ApifyProvider(config.apifyApiKey) : undefined;
  const firecrawlProvider = config.firecrawlApiKey ? new FirecrawlProvider(config.firecrawlApiKey) : undefined;

  // Register providers with orchestrator (ordered by priority — cheapest first)
  orchestrator.registerProvider(new ApolloProvider(config.apolloApiKey), 1);
  orchestrator.registerProvider(new LeadMagicProvider(config.leadmagicApiKey), 2);
  orchestrator.registerProvider(new ProspeoProvider(config.prospeoApiKey), 3);
  if (exaProvider) orchestrator.registerProvider(exaProvider, 4);
  if (tavilyProvider) orchestrator.registerProvider(tavilyProvider, 5);
  if (apifyProvider) orchestrator.registerProvider(apifyProvider, 6);
  if (config.parallelApiKey) orchestrator.registerProvider(new ParallelProvider(config.parallelApiKey), 7);
  if (config.valyuApiKey) orchestrator.registerProvider(new ValyuProvider(config.valyuApiKey), 8);
  if (config.diffbotApiKey) orchestrator.registerProvider(new DiffbotProvider(config.diffbotApiKey), 9);
  if (config.browserbaseApiKey && config.browserbaseProjectId) orchestrator.registerProvider(new BrowserbaseProvider(config.browserbaseApiKey, config.browserbaseProjectId), 10);
  if (config.agentqlApiKey) orchestrator.registerProvider(new AgentQlProvider(config.agentqlApiKey), 11);
  if (firecrawlProvider) orchestrator.registerProvider(firecrawlProvider, 12);
  if (config.scrapegraphApiKey) orchestrator.registerProvider(new ScrapeGraphProvider(config.scrapegraphApiKey), 13);

  // Create tracked Anthropic clients (one per service for cost attribution)
  const llm = {
    signalDetector: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'signal-detector' }),
    marketSignalProcessor: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'market-signal-processor' }),
    marketSignalSearcher: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'market-signal-searcher' }),
    deepEnrichment: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'deep-enrichment' }),
    engagementBrief: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'engagement-brief' }),
    marketBuzz: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'market-buzz' }),
    personaSignal: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'persona-signal-detector' }),
    clientProfile: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'client-profile' }),
    strategyGenerator: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'strategy-generator' }),
    hypothesisGenerator: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'hypothesis-generator' }),
    icpParser: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'icp-parser' }),
    companyDiscovery: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'company-discovery' }),
    marketBuilder: createTrackedAnthropicClient({ apiKey: config.anthropicApiKey, service: 'market-builder' }),
  };

  const enrichmentPipeline = new EnrichmentPipeline(orchestrator);
  const discoveryService = new CompanyDiscoveryService(orchestrator, enrichmentPipeline, llm.companyDiscovery);
  discoveryService.setPromptConfig(promptConfigService);
  if (tavilyProvider) discoveryService.setTavilyProvider(tavilyProvider);
  if (apifyProvider) discoveryService.setApifyProvider(apifyProvider);
  if (exaProvider) discoveryService.setExaProvider(exaProvider);
  const listBuilder = new ListBuilder();
  listBuilder.setDiscoveryService(discoveryService);
  listBuilder.setEnrichmentPipeline(enrichmentPipeline);
  // Signal services wired below after construction (see intelligence layer section)
  const exportEngine = new ExportEngine();
  const icpParser = new IcpParser(llm.icpParser);
  icpParser.setPromptConfig(promptConfigService);
  const documentExtractor = new DocumentExtractor();
  const sourceProcessor = new SourceProcessor(documentExtractor);
  const scheduler = new Scheduler(config.databaseUrl);

  // Intelligence layer
  const performanceTracker = new ProviderPerformanceTracker();
  orchestrator.setPerformanceTracker(performanceTracker);

  const clientProfileService = new ClientProfileService(orchestrator, llm.clientProfile);
  clientProfileService.setPromptConfig(promptConfigService);
  const signalDetector = new SignalDetector(llm.signalDetector);
  signalDetector.setPromptConfig(promptConfigService);
  const intelligenceScorer = new IntelligenceScorer();
  const strategyGenerator = new StrategyGenerator(llm.strategyGenerator, clientProfileService, performanceTracker);
  strategyGenerator.setPromptConfig(promptConfigService);
  const dynamicOrchestrator = new DynamicOrchestrator(
    orchestrator, strategyGenerator, signalDetector, intelligenceScorer, clientProfileService,
  );

  // Wire signal services into list builder so builds include signal detection
  listBuilder.setSignalDetector(signalDetector);
  listBuilder.setIntelligenceScorer(intelligenceScorer);
  listBuilder.setClientProfileService(clientProfileService);

  // Signal pipeline
  const hypothesisGenerator = new HypothesisGenerator(llm.hypothesisGenerator, clientProfileService);
  hypothesisGenerator.setPromptConfig(promptConfigService);
  const marketSignalProcessor = new MarketSignalProcessor(llm.marketSignalProcessor);
  marketSignalProcessor.setPromptConfig(promptConfigService);
  const personaSignalDetector = new PersonaSignalDetector(llm.personaSignal);
  personaSignalDetector.setPromptConfig(promptConfigService);

  // Wire persona signal detector into list builder
  listBuilder.setPersonaSignalDetector(personaSignalDetector);

  // Engagement briefs
  const engagementBriefGenerator = new EngagementBriefGenerator(llm.engagementBrief);
  engagementBriefGenerator.setPromptConfig(promptConfigService);
  listBuilder.setEngagementBriefGenerator(engagementBriefGenerator);

  // Market buzz
  const marketBuzzGenerator = new MarketBuzzGenerator(llm.marketBuzz, clientProfileService);
  marketBuzzGenerator.setPromptConfig(promptConfigService);

  // Deep enrichment + evidence search (optional, depend on API keys)
  let deepEnrichmentService: DeepEnrichmentService | undefined;
  let marketSignalSearcher: MarketSignalSearcher | undefined;

  if (config.jinaApiKey) {
    const jinaProvider = new JinaProvider(config.jinaApiKey);
    deepEnrichmentService = new DeepEnrichmentService(llm.deepEnrichment, jinaProvider, firecrawlProvider, creditManager);
    deepEnrichmentService.setPromptConfig(promptConfigService);
    logger.info('Deep enrichment service initialized (Jina primary, Firecrawl fallback)');
  }

  if (exaProvider || tavilyProvider || apifyProvider) {
    marketSignalSearcher = new MarketSignalSearcher(
      llm.marketSignalSearcher, marketSignalProcessor,
      { exa: exaProvider, tavily: tavilyProvider, apify: apifyProvider },
    );
    marketSignalSearcher.setPromptConfig(promptConfigService);
    logger.info({ exa: !!exaProvider, tavily: !!tavilyProvider, apify: !!apifyProvider }, 'Market signal searcher initialized');
  }

  // Influencer monitoring (requires Apify)
  let influencerMonitor: InfluencerMonitorService | undefined;
  if (apifyProvider) {
    influencerMonitor = new InfluencerMonitorService(apifyProvider, marketSignalProcessor);
    logger.info('Influencer monitor service initialized');
  }

  // Competitor downtime monitoring (requires UptimeRobot)
  let competitorMonitor: CompetitorMonitorService | undefined;
  if (config.uptimerobotApiKey) {
    const uptimeRobotProvider = new UptimeRobotProvider(config.uptimerobotApiKey);
    competitorMonitor = new CompetitorMonitorService(uptimeRobotProvider);
    logger.info('Competitor monitor service initialized');
  }

  // Market builder AI strategist
  const marketBuilder = new MarketBuilderService(discoveryService, listBuilder, llm.marketBuilder);
  logger.info('Market builder service initialized');

  // 4. Store in container
  container = {
    creditManager,
    orchestrator,
    enrichmentPipeline,
    listBuilder,
    exportEngine,
    icpParser,
    sourceProcessor,
    scheduler,
    promptConfigService,
    performanceTracker,
    clientProfileService,
    signalDetector,
    intelligenceScorer,
    strategyGenerator,
    dynamicOrchestrator,
    hypothesisGenerator,
    marketSignalProcessor,
    personaSignalDetector,
    deepEnrichmentService,
    marketSignalSearcher,
    engagementBriefGenerator,
    marketBuzzGenerator,
    companyDiscovery: discoveryService,
    influencerMonitor,
    competitorMonitor,
    marketBuilder,
  };

  // 5. Start scheduler with handlers
  await scheduler.start({
    onListRefresh: async (data) => {
      await listBuilder.refreshList(data.listId);
    },
    onEnrichment: async (data) => {
      await enrichmentPipeline.enrichCompanies(
        data.clientId,
        data.domains,
        data.jobId,
        data.options,
      );
    },
    onExport: async (data) => {
      await exportEngine.export(data.clientId, data.listId, data.format, data.destination);
    },
    onMarketSignalProcessing: async (data) => {
      await marketSignalProcessor.processUnclassifiedSignals(data.clientId, data.batchSize);
    },
  });

  // 6. Start API server
  const app = await buildApp(config.apiKey, container);
  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  logger.info({ port: config.apiPort }, 'Data Layer API started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await scheduler.stop();
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start');
  process.exit(1);
});
