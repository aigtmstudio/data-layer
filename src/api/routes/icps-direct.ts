import type { FastifyPluginAsync } from 'fastify';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';

export const icpDirectRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app) => {
  // GET /api/icps/:id — fetch a single ICP by ID (no clientId required)
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [icp] = await db
      .select()
      .from(schema.icps)
      .where(eq(schema.icps.id, request.params.id));
    if (!icp) return reply.status(404).send({ error: 'ICP not found' });
    return { data: icp };
  });
};
