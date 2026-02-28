import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';
import { withLlmContext } from '../../lib/llm-tracker.js';

const ingestBody = z.object({
  clientId: z.string().uuid(),
  headline: z.string().min(1),
  summary: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceName: z.string().optional(),
  rawData: z.record(z.unknown()).optional(),
  detectedAt: z.string().optional(),
});

const webhookBody = z.object({
  clientId: z.string().uuid(),
  signals: z.array(z.object({
    headline: z.string().min(1),
    summary: z.string().optional(),
    sourceUrl: z.string().optional(),
    sourceName: z.string().optional(),
    rawData: z.record(z.unknown()).optional(),
    detectedAt: z.string().optional(),
  })),
});

const processBody = z.object({
  clientId: z.string().uuid().optional(),
  batchSize: z.number().int().min(1).max(200).optional(),
});

export const marketSignalRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const { marketSignalProcessor } = opts.container;

  // GET /api/market-signals?clientId=...&category=...&processed=...&limit=...&offset=...
  app.get<{
    Querystring: {
      clientId?: string;
      category?: string;
      processed?: string;
      hypothesisId?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }
    const result = await marketSignalProcessor.getSignalFeed({
      clientId: request.query.clientId,
      category: request.query.category,
      processed: request.query.processed !== undefined ? request.query.processed === 'true' : undefined,
      hypothesisId: request.query.hypothesisId,
      limit: request.query.limit ? parseInt(request.query.limit) : undefined,
      offset: request.query.offset ? parseInt(request.query.offset) : undefined,
    });
    return { data: result.signals, total: result.total };
  });

  // GET /api/market-signals/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const signal = await marketSignalProcessor.getSignalById(request.params.id);
    if (!signal) return reply.status(404).send({ error: 'Signal not found' });
    return { data: signal };
  });

  // POST /api/market-signals/ingest — single signal
  app.post('/ingest', async (request, reply) => {
    const body = ingestBody.parse(request.body);
    const signal = await marketSignalProcessor.ingestSignal(body);
    return reply.status(201).send({ data: signal });
  });

  // POST /api/market-signals/webhook — batch ingestion (for n8n, Zapier, etc.)
  app.post('/webhook', async (request, reply) => {
    const body = webhookBody.parse(request.body);
    const log = logger.child({ clientId: body.clientId, count: body.signals.length });
    log.info('Webhook batch signal ingestion');

    const signals = await marketSignalProcessor.ingestBatch(
      body.signals.map(s => ({ ...s, clientId: body.clientId })),
    );

    return reply.status(202).send({
      data: { ingested: signals.length, message: 'Signals queued for classification' },
    });
  });

  // POST /api/market-signals/search-evidence — automated evidence search from hypotheses
  app.post('/search-evidence', async (request, reply) => {
    const body = z.object({
      clientId: z.string().uuid(),
      hypothesisIds: z.array(z.string().uuid()).optional(),
      maxSearchesPerHypothesis: z.number().int().min(1).max(3).optional(),
    }).parse(request.body);

    if (!opts.container.marketSignalSearcher) {
      return reply.status(503).send({ error: 'Market signal searcher not configured (missing search providers)' });
    }

    const db = getDb();
    const log = logger.child({ clientId: body.clientId });
    log.info('Evidence search triggered');

    // Create a job to track progress
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: body.clientId,
        type: 'market_signal_search',
        status: 'running',
        input: { hypothesisIds: body.hypothesisIds, maxSearchesPerHypothesis: body.maxSearchesPerHypothesis },
      })
      .returning();

    reply.status(202).send({ data: { jobId: job.id, message: 'Evidence search started' } });

    withLlmContext({ clientId: body.clientId, jobId: job.id }, () =>
      opts.container.marketSignalSearcher!
        .searchForEvidence(body.clientId, {
          hypothesisIds: body.hypothesisIds,
          maxSearchesPerHypothesis: body.maxSearchesPerHypothesis,
        })
    ).then(async (result) => {
        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            processedItems: result.signalsIngested,
            output: result as unknown as Record<string, unknown>,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
        log.info(result, 'Evidence search complete');
      })
      .catch(async (error) => {
        log.error({ error }, 'Evidence search failed');
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

  // POST /api/market-signals/process — trigger classification
  app.post('/process', async (request, reply) => {
    const body = processBody.parse(request.body ?? {});
    const log = logger.child({ clientId: body.clientId });
    log.info('Manual signal processing triggered');

    // Return 202 immediately, process in background
    reply.status(202).send({ data: { message: 'Signal processing started' } });

    withLlmContext({ clientId: body.clientId }, async () => {
      try {
        const processed = await marketSignalProcessor.processUnclassifiedSignals(
          body.clientId,
          body.batchSize,
        );
        log.info({ processed }, 'Signal processing complete');
      } catch (error) {
        log.error({ error }, 'Signal processing failed');
      }
    });
  });
};
