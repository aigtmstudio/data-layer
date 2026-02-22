import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and, gte } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';

const updateProfileBody = z.object({
  industry: z.string().optional(),
  products: z.array(z.string()).optional(),
  targetMarket: z.string().optional(),
  competitors: z.array(z.string()).optional(),
  valueProposition: z.string().optional(),
});

const autoEnrichBody = z.object({
  websiteUrl: z.string().min(1),
});

const generateStrategyBody = z.object({
  clientId: z.string().uuid(),
  icpId: z.string().uuid(),
  personaId: z.string().uuid().optional(),
});

const buildIntelligentListBody = z.object({
  clientId: z.string().uuid(),
  listId: z.string().uuid(),
  icpId: z.string().uuid(),
  personaId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(10000).optional(),
});

interface IntelligenceRouteOpts {
  container: ServiceContainer;
}

export const intelligenceRoutes: FastifyPluginAsync<IntelligenceRouteOpts> = async (app, opts) => {
  const { container } = opts;

  // ── Client Profile ──

  // GET /api/intelligence/profile/:clientId
  app.get<{ Params: { clientId: string } }>('/profile/:clientId', async (request) => {
    const profile = await container.clientProfileService.getOrCreateProfile(request.params.clientId);
    return { data: profile };
  });

  // PATCH /api/intelligence/profile/:clientId
  app.patch<{ Params: { clientId: string } }>('/profile/:clientId', async (request) => {
    const body = updateProfileBody.parse(request.body);
    const profile = await container.clientProfileService.updateProfile(request.params.clientId, body);
    return { data: profile };
  });

  // POST /api/intelligence/profile/:clientId/auto-enrich
  app.post<{ Params: { clientId: string } }>('/profile/:clientId/auto-enrich', async (request) => {
    const body = autoEnrichBody.parse(request.body);
    const profile = await container.clientProfileService.autoEnrichFromWebsite(
      request.params.clientId,
      body.websiteUrl,
    );
    return { data: profile };
  });

  // ── Strategy ──

  // POST /api/intelligence/strategy/generate
  app.post('/strategy/generate', async (request) => {
    const body = generateStrategyBody.parse(request.body);
    const strategy = await container.strategyGenerator.generateStrategy(
      body.clientId,
      body.icpId,
      body.personaId,
    );
    return { data: strategy };
  });

  // ── Signals ──

  // GET /api/intelligence/signals/:companyId
  app.get<{ Params: { companyId: string }; Querystring: { clientId: string } }>(
    '/signals/:companyId',
    async (request) => {
      const db = getDb();
      const now = new Date();
      const signals = await db
        .select()
        .from(schema.companySignals)
        .where(and(
          eq(schema.companySignals.companyId, request.params.companyId),
          eq(schema.companySignals.clientId, request.query.clientId),
          gte(schema.companySignals.expiresAt, now),
        ));
      return { data: signals };
    },
  );

  // ── Intelligent List Building ──

  // POST /api/intelligence/lists/build
  app.post('/lists/build', async (request) => {
    const body = buildIntelligentListBody.parse(request.body);
    const result = await container.dynamicOrchestrator.buildIntelligentList(body);
    return { data: result };
  });

  // ── Provider Performance ──

  // GET /api/intelligence/performance/:clientId
  app.get<{ Params: { clientId: string } }>('/performance/:clientId', async (request) => {
    const stats = await container.performanceTracker.getProviderStats(request.params.clientId);
    return { data: stats };
  });
};
