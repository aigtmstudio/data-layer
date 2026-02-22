import type { FastifyPluginAsync } from 'fastify';
import { getDb, schema } from '../../db/index.js';
import { eq, and, desc } from 'drizzle-orm';

export const jobRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/jobs
  app.get<{ Querystring: { clientId?: string; status?: string; limit?: string } }>(
    '/',
    async (request) => {
      const db = getDb();
      const limit = parseInt(request.query.limit ?? '50', 10);

      const conditions = [];
      if (request.query.clientId) {
        conditions.push(eq(schema.jobs.clientId, request.query.clientId));
      }
      if (request.query.status) {
        conditions.push(
          eq(schema.jobs.status, request.query.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'),
        );
      }

      const jobs = await db
        .select()
        .from(schema.jobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.jobs.createdAt))
        .limit(limit);

      return { data: jobs };
    },
  );

  // GET /api/jobs/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, request.params.id));
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return { data: job };
  });

  // POST /api/jobs/:id/cancel
  app.post<{ Params: { id: string } }>('/:id/cancel', async (request) => {
    const db = getDb();
    const [updated] = await db
      .update(schema.jobs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.jobs.id, request.params.id))
      .returning();
    return { data: updated };
  });
};
