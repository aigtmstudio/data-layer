import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';

const findBody = z.object({
  clientId: z.string().uuid(),
  buzzReportId: z.string().uuid(),
  angleIndex: z.number().int().min(0),
});

export const webinarSpeakerRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const { webinarSpeakerFinder } = opts.container;

  // GET /api/webinar-speakers?buzzReportId=&angleIndex=
  app.get<{
    Querystring: { buzzReportId?: string; angleIndex?: string };
  }>('/', async (request, reply) => {
    const { buzzReportId, angleIndex } = request.query;
    if (!buzzReportId) return reply.status(400).send({ error: 'buzzReportId is required' });

    if (angleIndex !== undefined) {
      const speakers = await webinarSpeakerFinder.getSpeakers(buzzReportId, parseInt(angleIndex));
      return { data: speakers };
    }
    const speakers = await webinarSpeakerFinder.getSpeakersByReport(buzzReportId);
    return { data: speakers };
  });

  // POST /api/webinar-speakers/find
  app.post('/find', async (request, reply) => {
    const body = findBody.parse(request.body);
    const log = logger.child({ clientId: body.clientId, buzzReportId: body.buzzReportId, angleIndex: body.angleIndex });
    log.info('Webinar speaker discovery requested');

    const db = getDb();

    // Create job
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: body.clientId,
        type: 'webinar_speaker_find',
        status: 'running',
        input: {
          buzzReportId: body.buzzReportId,
          angleIndex: body.angleIndex,
        },
      })
      .returning();

    reply.status(202).send({
      data: { jobId: job.id, buzzReportId: body.buzzReportId, angleIndex: body.angleIndex },
    });

    // Run in background
    webinarSpeakerFinder
      .findSpeakers(body.clientId, body.buzzReportId, body.angleIndex, job.id)
      .then(async (speakers) => {
        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            output: { speakerCount: speakers.length },
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
        log.info({ speakerCount: speakers.length }, 'Webinar speaker discovery complete');
      })
      .catch(async (error) => {
        log.error({ error }, 'Webinar speaker discovery failed');
        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            errors: [{ item: body.buzzReportId, error: String(error), timestamp: new Date().toISOString() }],
          })
          .where(eq(schema.jobs.id, job.id));
      });
  });

  // DELETE /api/webinar-speakers/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await webinarSpeakerFinder.deleteSpeaker(request.params.id);
    return reply.status(204).send();
  });
};
