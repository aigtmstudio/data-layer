import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';

const platforms = ['instagram', 'twitter', 'youtube', 'linkedin', 'reddit'] as const;
const categories = ['industry_expert', 'journalist', 'competitor_exec', 'customer', 'other'] as const;

const createBody = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  platform: z.enum(platforms),
  handle: z.string().min(1),
  profileUrl: z.string().url().optional(),
  category: z.enum(categories).optional(),
  notes: z.string().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).optional(),
  handle: z.string().min(1).optional(),
  profileUrl: z.string().url().optional(),
  category: z.enum(categories).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const fetchPostsBody = z.object({
  clientId: z.string().uuid(),
  postsPerInfluencer: z.number().int().min(1).max(50).optional(),
  forceRefresh: z.boolean().optional(),
});

export const influencerRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const log = logger.child({ route: 'influencers' });

  // GET /api/influencers?clientId=...
  app.get<{
    Querystring: { clientId?: string; platform?: string; isActive?: string };
  }>('/', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }

    const db = getDb();
    const conditions = [eq(schema.influencers.clientId, request.query.clientId)];
    if (request.query.isActive !== undefined) {
      conditions.push(eq(schema.influencers.isActive, request.query.isActive === 'true'));
    }

    const results = await db
      .select()
      .from(schema.influencers)
      .where(and(...conditions))
      .orderBy(schema.influencers.createdAt);

    return { data: results };
  });

  // POST /api/influencers
  app.post('/', async (request, reply) => {
    const body = createBody.parse(request.body);
    const db = getDb();

    const [influencer] = await db
      .insert(schema.influencers)
      .values(body)
      .returning();

    return reply.status(201).send({ data: influencer });
  });

  // PATCH /api/influencers/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateBody.parse(request.body);
    const db = getDb();

    const [updated] = await db
      .update(schema.influencers)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.influencers.id, request.params.id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Influencer not found' });
    return { data: updated };
  });

  // DELETE /api/influencers/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [deleted] = await db
      .delete(schema.influencers)
      .where(eq(schema.influencers.id, request.params.id))
      .returning();

    if (!deleted) return reply.status(404).send({ error: 'Influencer not found' });
    return reply.status(204).send();
  });

  // POST /api/influencers/fetch-posts — trigger post fetch and signal ingestion
  app.post('/fetch-posts', async (request, reply) => {
    const body = fetchPostsBody.parse(request.body);

    if (!opts.container.influencerMonitor) {
      return reply.status(503).send({ error: 'Influencer monitor not configured (missing Apify API key)' });
    }

    log.info({ clientId: body.clientId }, 'Influencer post fetch triggered');

    const result = await opts.container.influencerMonitor.fetchAndIngestPosts(body.clientId, {
      postsPerInfluencer: body.postsPerInfluencer,
      forceRefresh: body.forceRefresh,
    });

    log.info({ clientId: body.clientId, ...result }, 'Influencer post fetch complete');

    // Classify newly ingested posts in the background
    if (result.signalsIngested > 0) {
      opts.container.marketSignalProcessor
        .processUnclassifiedSignals(body.clientId)
        .catch((err) => log.error({ err, clientId: body.clientId }, 'Background signal classification failed'));
    }

    return { data: result };
  });
};
