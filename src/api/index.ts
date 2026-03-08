import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { clientRoutes } from './routes/clients.js';
import { icpRoutes } from './routes/icps.js';
import { icpDirectRoutes } from './routes/icps-direct.js';
import { personaRoutes } from './routes/personas.js';
import { listRoutes } from './routes/lists.js';
import { enrichmentRoutes } from './routes/enrichment.js';
import { creditRoutes } from './routes/credits.js';
import { jobRoutes } from './routes/jobs.js';
import { exportRoutes } from './routes/exports.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { hypothesisRoutes } from './routes/hypotheses.js';
import { marketSignalRoutes } from './routes/market-signals.js';
import { personaV2Routes } from './routes/personas-v2.js';
import { settingsRoutes } from './routes/settings.js';
import { llmUsageRoutes } from './routes/llm-usage.js';
import { marketBuzzRoutes } from './routes/market-buzz.js';
import { influencerRoutes } from './routes/influencers.js';
import { competitorMonitoringRoutes } from './routes/competitor-monitoring.js';
import { discoveryRoutes } from './routes/discovery.js';
import { marketBuilderRoutes } from './routes/market-builder.js';
import { webinarSpeakerRoutes } from './routes/webinar-speakers.js';
import { discoveryTestRoutes } from './routes/discovery-test.js';
import { demoRoutes } from './routes/demo.js';
import type { ServiceContainer } from '../index.js';

interface BuildAppOpts {
  apiKey: string;
  clerkSecretKey?: string;
  corsOrigin?: string;
}

export async function buildApp(opts: BuildAppOpts, container: ServiceContainer) {
  const app = Fastify({
    logger: true,
  });

  // Plugins
  const corsOrigin = opts.corsOrigin ? opts.corsOrigin.split(',') : true;
  await app.register(cors, { origin: corsOrigin, credentials: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max
  await app.register(authPlugin, { apiKey: opts.apiKey, clerkSecretKey: opts.clerkSecretKey });
  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(clientRoutes, { prefix: '/api/clients' });
  await app.register(icpRoutes, { prefix: '/api/clients', container });
  await app.register(personaRoutes, { prefix: '/api/clients', container });
  await app.register(listRoutes, { prefix: '/api/lists', container });
  await app.register(enrichmentRoutes, { prefix: '/api/enrichment', container });
  await app.register(creditRoutes, { prefix: '/api/credits', container });
  await app.register(jobRoutes, { prefix: '/api/jobs' });
  await app.register(exportRoutes, { prefix: '/api/exports', container });
  await app.register(intelligenceRoutes, { prefix: '/api/intelligence', container });
  await app.register(hypothesisRoutes, { prefix: '/api/hypotheses', container });
  await app.register(marketSignalRoutes, { prefix: '/api/market-signals', container });
  await app.register(icpDirectRoutes, { prefix: '/api/icps', container });
  await app.register(personaV2Routes, { prefix: '/api/personas', container });
  await app.register(settingsRoutes, { prefix: '/api/settings', container });
  await app.register(llmUsageRoutes, { prefix: '/api/llm-usage' });
  await app.register(marketBuzzRoutes, { prefix: '/api/market-buzz', container });
  await app.register(influencerRoutes, { prefix: '/api/influencers', container });
  await app.register(competitorMonitoringRoutes, { prefix: '/api/competitors', container });
  await app.register(discoveryRoutes, { prefix: '/api/discovery', container });
  await app.register(marketBuilderRoutes, { prefix: '/api/market-builder', container });
  await app.register(webinarSpeakerRoutes, { prefix: '/api/webinar-speakers', container });
  await app.register(discoveryTestRoutes, {
    prefix: '/api/discovery-test',
    container,
    providers: container._providers ?? {},
  });

  // Demo routes (public-facing, with own auth + rate limiting)
  await app.register(demoRoutes, { prefix: '/api/demo', container });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
