import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';

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

  // POST /api/market-signals/process — trigger classification
  app.post('/process', async (request, reply) => {
    const body = processBody.parse(request.body ?? {});
    const log = logger.child({ clientId: body.clientId });
    log.info('Manual signal processing triggered');

    // Return 202 immediately, process in background
    reply.status(202).send({ data: { message: 'Signal processing started' } });

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
};
