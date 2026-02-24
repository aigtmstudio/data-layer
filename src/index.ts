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
import { CompanyDiscoveryService } from './services/company-discovery/index.js';
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

  // 2. Initialize services
  const creditManager = new CreditManager();
  const orchestrator = new SourceOrchestrator(creditManager);

  // Register providers (ordered by priority — cheapest first)
  orchestrator.registerProvider(new ApolloProvider(config.apolloApiKey), 1);
  orchestrator.registerProvider(new LeadMagicProvider(config.leadmagicApiKey), 2);
  orchestrator.registerProvider(new ProspeoProvider(config.prospeoApiKey), 3);
  if (config.exaApiKey) orchestrator.registerProvider(new ExaProvider(config.exaApiKey), 4);
  if (config.tavilyApiKey) orchestrator.registerProvider(new TavilyProvider(config.tavilyApiKey), 5);
  if (config.apifyApiKey) orchestrator.registerProvider(new ApifyProvider(config.apifyApiKey), 6);
  if (config.parallelApiKey) orchestrator.registerProvider(new ParallelProvider(config.parallelApiKey), 7);
  if (config.valyuApiKey) orchestrator.registerProvider(new ValyuProvider(config.valyuApiKey), 8);
  if (config.diffbotApiKey) orchestrator.registerProvider(new DiffbotProvider(config.diffbotApiKey), 9);
  if (config.browserbaseApiKey && config.browserbaseProjectId) orchestrator.registerProvider(new BrowserbaseProvider(config.browserbaseApiKey, config.browserbaseProjectId), 10);
  if (config.agentqlApiKey) orchestrator.registerProvider(new AgentQlProvider(config.agentqlApiKey), 11);
  if (config.firecrawlApiKey) orchestrator.registerProvider(new FirecrawlProvider(config.firecrawlApiKey), 12);
  if (config.scrapegraphApiKey) orchestrator.registerProvider(new ScrapeGraphProvider(config.scrapegraphApiKey), 13);

  const enrichmentPipeline = new EnrichmentPipeline(orchestrator);
  const discoveryService = new CompanyDiscoveryService(orchestrator, enrichmentPipeline, config.anthropicApiKey);
  const listBuilder = new ListBuilder();
  listBuilder.setDiscoveryService(discoveryService);
  const exportEngine = new ExportEngine();
  const icpParser = new IcpParser(config.anthropicApiKey);
  const documentExtractor = new DocumentExtractor();
  const sourceProcessor = new SourceProcessor(documentExtractor);
  const scheduler = new Scheduler(config.databaseUrl);

  // Intelligence layer
  const performanceTracker = new ProviderPerformanceTracker();
  orchestrator.setPerformanceTracker(performanceTracker);

  const clientProfileService = new ClientProfileService(orchestrator, config.anthropicApiKey);
  const signalDetector = new SignalDetector(config.anthropicApiKey);
  const intelligenceScorer = new IntelligenceScorer();
  const strategyGenerator = new StrategyGenerator(config.anthropicApiKey, clientProfileService, performanceTracker);
  const dynamicOrchestrator = new DynamicOrchestrator(
    orchestrator, strategyGenerator, signalDetector, intelligenceScorer, clientProfileService,
  );

  // Signal pipeline
  const hypothesisGenerator = new HypothesisGenerator(config.anthropicApiKey, clientProfileService);
  const marketSignalProcessor = new MarketSignalProcessor(config.anthropicApiKey);

  // 3. Store in container
  container = {
    creditManager,
    orchestrator,
    enrichmentPipeline,
    listBuilder,
    exportEngine,
    icpParser,
    sourceProcessor,
    scheduler,
    performanceTracker,
    clientProfileService,
    signalDetector,
    intelligenceScorer,
    strategyGenerator,
    dynamicOrchestrator,
    hypothesisGenerator,
    marketSignalProcessor,
  };

  // 4. Start scheduler with handlers
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

  // 5. Start API server
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
