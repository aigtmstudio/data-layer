import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import type { ServiceContainer } from '../../index.js';
import { JOB_TYPES } from '../../services/scheduler/index.js';
import { withLlmContext } from '../../lib/llm-tracker.js';

const enrichCompaniesBody = z.object({
  clientId: z.string().uuid(),
  domains: z.array(z.string()).min(1).max(1000),
  discoverContacts: z.boolean().default(true),
  findEmails: z.boolean().default(true),
  verifyEmails: z.boolean().default(true),
  personaFilters: z.object({
    titlePatterns: z.array(z.string()).optional(),
    seniorityLevels: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional(),
  }).optional(),
});

export const enrichmentRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  // POST /api/enrichment/companies
  app.post('/companies', async (request, reply) => {
    const body = enrichCompaniesBody.parse(request.body);
    const db = getDb();

    // Create job record
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: body.clientId,
        type: 'full_enrichment_pipeline',
        status: 'pending',
        totalItems: body.domains.length,
        input: {
          domains: body.domains,
          discoverContacts: body.discoverContacts,
          findEmails: body.findEmails,
          verifyEmails: body.verifyEmails,
          personaFilters: body.personaFilters,
        },
      })
      .returning();

    // Enqueue for async processing
    await withLlmContext({ clientId: body.clientId, jobId: job.id }, () =>
      opts.container.scheduler.enqueue(JOB_TYPES.ENRICHMENT, {
        clientId: body.clientId,
        domains: body.domains,
        jobId: job.id,
        options: {
          discoverContacts: body.discoverContacts,
          findEmails: body.findEmails,
          verifyEmails: body.verifyEmails,
          personaFilters: body.personaFilters,
        },
      })
    );

    return reply.status(202).send({ data: job });
  });
};
