import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';
import { withLlmContext } from '../../lib/llm-tracker.js';

const generateBody = z.object({
  clientId: z.string().uuid(),
  timeWindowDays: z.number().int().min(1).max(90).optional(),
  icpIds: z.array(z.string().uuid()).optional(),
  forceRegenerate: z.boolean().optional(),
});

export const marketBuzzRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const { marketBuzzGenerator } = opts.container;

  // GET /api/market-buzz?clientId=...&limit=...
  app.get<{
    Querystring: { clientId?: string; limit?: string };
  }>('/', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }
    const reports = await marketBuzzGenerator.getReports(
      request.query.clientId,
      request.query.limit ? parseInt(request.query.limit) : undefined,
    );
    return { data: reports };
  });

  // GET /api/market-buzz/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const report = await marketBuzzGenerator.getReportById(request.params.id);
    if (!report) return reply.status(404).send({ error: 'Report not found' });
    return { data: report };
  });

  // POST /api/market-buzz/generate
  app.post('/generate', async (request, reply) => {
    const body = generateBody.parse(request.body);
    const log = logger.child({ clientId: body.clientId });
    log.info('Buzz report generation requested');

    const db = getDb();

    // Create job
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: body.clientId,
        type: 'buzz_generation',
        status: 'running',
        input: {
          timeWindowDays: body.timeWindowDays,
          icpIds: body.icpIds,
          forceRegenerate: body.forceRegenerate,
        },
      })
      .returning();

    // Create report row
    const [reportRow] = await db
      .insert(schema.buzzReports)
      .values({
        clientId: body.clientId,
        timeWindowDays: body.timeWindowDays ?? 30,
        icpIds: body.icpIds ?? null,
        jobId: job.id,
        status: 'generating',
      })
      .returning();

    reply.status(202).send({
      data: { jobId: job.id, reportId: reportRow.id },
    });

    // Generate in background
    withLlmContext({ clientId: body.clientId, jobId: job.id }, () =>
      marketBuzzGenerator.generateBuzzReport({
        clientId: body.clientId,
        timeWindowDays: body.timeWindowDays,
        icpIds: body.icpIds,
        forceRegenerate: body.forceRegenerate,
      }),
    )
      .then(async (report) => {
        await db
          .update(schema.buzzReports)
          .set({
            report,
            signalsAnalyzed: report.inputSummary.signalsAnalyzed,
            topicsCount: report.trendingTopics.length,
            webinarAnglesCount: report.webinarAngles.length,
            copySnippetsCount: report.seedCopy.length,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(schema.buzzReports.id, reportRow.id));

        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            output: { reportId: reportRow.id, topicsCount: report.trendingTopics.length },
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));

        log.info({ reportId: reportRow.id }, 'Buzz report generation complete');
      })
      .catch(async (error) => {
        log.error({ error }, 'Buzz report generation failed');

        await db
          .update(schema.buzzReports)
          .set({ status: 'failed' })
          .where(eq(schema.buzzReports.id, reportRow.id));

        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            errors: [{ item: body.clientId, error: String(error), timestamp: new Date().toISOString() }],
          })
          .where(eq(schema.jobs.id, job.id));
      });
  });

  // DELETE /api/market-buzz/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await marketBuzzGenerator.deleteReport(request.params.id);
    return reply.status(204).send();
  });
};
