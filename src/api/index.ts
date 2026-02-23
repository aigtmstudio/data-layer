import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { clientRoutes } from './routes/clients.js';
import { icpRoutes } from './routes/icps.js';
import { personaRoutes } from './routes/personas.js';
import { listRoutes } from './routes/lists.js';
import { enrichmentRoutes } from './routes/enrichment.js';
import { creditRoutes } from './routes/credits.js';
import { jobRoutes } from './routes/jobs.js';
import { exportRoutes } from './routes/exports.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import type { ServiceContainer } from '../index.js';

export async function buildApp(apiKey: string, container: ServiceContainer) {
  const app = Fastify({
    logger: true,
  });

  // Plugins
  await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max
  await app.register(authPlugin, { apiKey });
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

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
