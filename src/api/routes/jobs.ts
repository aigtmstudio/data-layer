import type { FastifyPluginAsync } from 'fastify';
import { getDb, schema } from '../../db/index.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

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

      // Aggregate LLM costs per job
      const jobIds = jobs.map(j => j.id);
      let costMap = new Map<string, { llmCostUsd: string; llmCalls: number }>();

      if (jobIds.length > 0) {
        const costSums = await db
          .select({
            jobId: schema.llmUsage.jobId,
            llmCostUsd: sql<string>`coalesce(sum(${schema.llmUsage.totalCostUsd}), 0)::text`,
            llmCalls: sql<number>`count(*)::int`,
          })
          .from(schema.llmUsage)
          .where(inArray(schema.llmUsage.jobId, jobIds))
          .groupBy(schema.llmUsage.jobId);

        costMap = new Map(costSums.map(c => [c.jobId!, { llmCostUsd: c.llmCostUsd, llmCalls: c.llmCalls }]));
      }

      const enrichedJobs = jobs.map(j => ({
        ...j,
        llmCostUsd: costMap.get(j.id)?.llmCostUsd ?? '0',
        llmCalls: costMap.get(j.id)?.llmCalls ?? 0,
      }));

      return { data: enrichedJobs };
    },
  );

  // GET /api/jobs/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, request.params.id));
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    // Get LLM cost for this specific job
    const [cost] = await db
      .select({
        llmCostUsd: sql<string>`coalesce(sum(${schema.llmUsage.totalCostUsd}), 0)::text`,
        llmCalls: sql<number>`count(*)::int`,
      })
      .from(schema.llmUsage)
      .where(eq(schema.llmUsage.jobId, job.id));

    return {
      data: {
        ...job,
        llmCostUsd: cost?.llmCostUsd ?? '0',
        llmCalls: cost?.llmCalls ?? 0,
      },
    };
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
