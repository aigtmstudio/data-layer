import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';

const addCompetitorBody = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  url: z.string().url(),
});

const checkBody = z.object({
  clientId: z.string().uuid(),
});

const dismissBody = z.object({
  clientId: z.string().uuid(),
});

export const competitorMonitoringRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const log = logger.child({ route: 'competitor-monitoring' });

  // GET /api/competitors?clientId=...
  app.get<{
    Querystring: { clientId?: string };
  }>('/', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }

    const db = getDb();
    const competitors = await db
      .select()
      .from(schema.monitoredCompetitors)
      .where(and(
        eq(schema.monitoredCompetitors.clientId, request.query.clientId),
        eq(schema.monitoredCompetitors.isActive, true),
      ))
      .orderBy(schema.monitoredCompetitors.createdAt);

    return { data: competitors };
  });

  // POST /api/competitors — add a competitor to monitor
  app.post('/', async (request, reply) => {
    const body = addCompetitorBody.parse(request.body);

    if (!opts.container.competitorMonitor) {
      return reply.status(503).send({ error: 'Competitor monitoring not configured (missing UptimeRobot API key)' });
    }

    const competitor = await opts.container.competitorMonitor.addCompetitor(body);
    return reply.status(201).send({ data: competitor });
  });

  // DELETE /api/competitors/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    if (!opts.container.competitorMonitor) {
      return reply.status(503).send({ error: 'Competitor monitoring not configured' });
    }

    await opts.container.competitorMonitor.removeCompetitor(request.params.id);
    return reply.status(204).send();
  });

  // GET /api/competitor-alerts?clientId=...&status=...
  app.get<{
    Querystring: { clientId?: string; status?: string; includeDismissed?: string };
  }>('/alerts', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }

    if (!opts.container.competitorMonitor) {
      return { data: [] };
    }

    const alerts = await opts.container.competitorMonitor.getAlerts({
      clientId: request.query.clientId,
      status: request.query.status,
      includeDismissed: request.query.includeDismissed === 'true',
    });

    return { data: alerts };
  });

  // POST /api/competitor-alerts/:id/dismiss
  app.post<{ Params: { id: string } }>('/alerts/:id/dismiss', async (request, reply) => {
    if (!opts.container.competitorMonitor) {
      return reply.status(503).send({ error: 'Competitor monitoring not configured' });
    }

    await opts.container.competitorMonitor.dismissAlert(request.params.id);
    return { data: { message: 'Alert dismissed' } };
  });

  // POST /api/competitors/alerts/check — poll UptimeRobot for all competitors
  app.post('/alerts/check', async (request, reply) => {
    const body = checkBody.parse(request.body);

    if (!opts.container.competitorMonitor) {
      return reply.status(503).send({ error: 'Competitor monitoring not configured' });
    }

    log.info({ clientId: body.clientId }, 'Downtime check triggered');

    const result = await opts.container.competitorMonitor.checkDowntime(body.clientId);

    log.info({ clientId: body.clientId, ...result }, 'Downtime check complete');

    return {
      data: {
        checked: result.competitorsChecked,
        newAlerts: result.activeDowntimes,
        resolved: result.resolvedDowntimes,
      },
    };
  });
};
