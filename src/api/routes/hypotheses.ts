import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/index.js';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';
import { withLlmContext } from '../../lib/llm-tracker.js';

const signalLevels = ['market', 'company', 'persona'] as const;
const signalCategories = [
  // Market
  'regulatory', 'economic', 'industry', 'competitive',
  // Company
  'funding', 'hiring', 'tech_adoption', 'expansion', 'leadership', 'product_launch',
  // Persona
  'job_change', 'title_match', 'seniority_match', 'tenure_signal',
] as const;
const hypothesisStatuses = ['active', 'paused', 'retired'] as const;
const validationTypes = ['llm_generated', 'human_validated', 'human_created'] as const;

const createBody = z.object({
  clientId: z.string().uuid(),
  icpId: z.string().uuid().optional(),
  hypothesis: z.string().min(1),
  signalLevel: z.enum(signalLevels),
  signalCategory: z.enum(signalCategories),
  monitoringSources: z.array(z.string()).optional(),
  affectedSegments: z.array(z.string()).optional(),
  priority: z.number().int().min(1).max(10).optional(),
});

const updateBody = z.object({
  hypothesis: z.string().min(1).optional(),
  signalCategory: z.enum(signalCategories).optional(),
  monitoringSources: z.array(z.string()).optional(),
  affectedSegments: z.array(z.string()).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  status: z.enum(hypothesisStatuses).optional(),
  validatedBy: z.enum(validationTypes).optional(),
});

const generateBody = z.object({
  clientId: z.string().uuid(),
  icpId: z.string().uuid().optional(),
  signalLevel: z.enum(signalLevels),
  personaId: z.string().uuid().optional(),
});

const bulkStatusBody = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(hypothesisStatuses),
});

export const hypothesisRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const { hypothesisGenerator } = opts.container;

  // GET /api/hypotheses?clientId=...&status=...&category=...&signalLevel=...
  app.get<{
    Querystring: { clientId?: string; status?: string; category?: string; icpId?: string; signalLevel?: string };
  }>('/', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }
    const hypotheses = await hypothesisGenerator.getHypotheses(request.query.clientId, {
      status: request.query.status as typeof hypothesisStatuses[number] | undefined,
      signalCategory: request.query.category as typeof signalCategories[number] | undefined,
      signalLevel: request.query.signalLevel as typeof signalLevels[number] | undefined,
      icpId: request.query.icpId,
    });
    return { data: hypotheses };
  });

  // GET /api/hypotheses/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const hypothesis = await hypothesisGenerator.getHypothesisById(request.params.id);
    if (!hypothesis) return reply.status(404).send({ error: 'Hypothesis not found' });
    return { data: hypothesis };
  });

  // POST /api/hypotheses — manual creation
  app.post('/', async (request, reply) => {
    const body = createBody.parse(request.body);
    const hypothesis = await hypothesisGenerator.createHypothesis(body);
    return reply.status(201).send({ data: hypothesis });
  });

  // POST /api/hypotheses/generate — AI bulk generation
  app.post('/generate', async (request, reply) => {
    const body = generateBody.parse(request.body);
    const log = logger.child({ clientId: body.clientId, icpId: body.icpId, signalLevel: body.signalLevel });

    // Create a job to track the generation
    const db = getDb();
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: body.clientId,
        type: 'signal_hypothesis_generation',
        status: 'running',
        input: body,
      })
      .returning();

    // Fire and forget — return 202 immediately
    reply.status(202).send({ data: { jobId: job.id, message: 'Hypothesis generation started' } });

    // Run generation in background — dispatch to the right method based on signalLevel
    withLlmContext({ clientId: body.clientId, jobId: job.id }, async () => {
      try {
        let hypotheses: typeof schema.signalHypotheses.$inferSelect[];
        switch (body.signalLevel) {
          case 'market':
            hypotheses = await hypothesisGenerator.generateMarketHypotheses(body.clientId, body.icpId);
            break;
          case 'company':
            hypotheses = await hypothesisGenerator.generateCompanyHypotheses(body.clientId, body.icpId);
            break;
          case 'persona':
            if (!body.personaId) {
              throw new Error('personaId is required for persona-level hypothesis generation');
            }
            hypotheses = await hypothesisGenerator.generatePersonaHypotheses(body.clientId, body.icpId, body.personaId);
            break;
        }
        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            processedItems: hypotheses.length,
            output: { hypothesisCount: hypotheses.length, signalLevel: body.signalLevel },
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
        log.info({ jobId: job.id, count: hypotheses.length }, 'Hypothesis generation completed');
      } catch (error) {
        log.error({ error, jobId: job.id }, 'Hypothesis generation failed');
        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            errors: [{ item: 'generation', error: String(error), timestamp: new Date().toISOString() }],
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
      }
    });
  });

  // PATCH /api/hypotheses/bulk-status
  app.patch('/bulk-status', async (request) => {
    const body = bulkStatusBody.parse(request.body);
    await hypothesisGenerator.bulkUpdateStatus(body.ids, body.status);
    return { data: { updated: body.ids.length } };
  });

  // PATCH /api/hypotheses/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateBody.parse(request.body);
    const updated = await hypothesisGenerator.updateHypothesis(request.params.id, body);
    if (!updated) return reply.status(404).send({ error: 'Hypothesis not found' });
    return { data: updated };
  });

  // DELETE /api/hypotheses/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    await hypothesisGenerator.deleteHypothesis(request.params.id);
    return { data: { deleted: true } };
  });
};
