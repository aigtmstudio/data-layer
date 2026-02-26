import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and, isNull, desc, sql, inArray } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';

const createListBody = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['company', 'contact', 'mixed']).default('contact'),
  icpId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
});

const updateScheduleBody = z.object({
  refreshEnabled: z.boolean(),
  refreshCron: z.string().optional(),
});

export const listRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  // GET /api/lists
  app.get<{ Querystring: { clientId?: string } }>('/', async (request) => {
    const db = getDb();
    const conditions = [eq(schema.lists.isActive, true)];
    if (request.query.clientId) {
      conditions.push(eq(schema.lists.clientId, request.query.clientId));
    }
    const lists = await db.select().from(schema.lists).where(and(...conditions));
    return { data: lists };
  });

  // GET /api/lists/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, request.params.id));
    if (!list) return reply.status(404).send({ error: 'List not found' });
    return { data: list };
  });

  // POST /api/lists
  app.post('/', async (request, reply) => {
    const body = createListBody.parse(request.body);
    const db = getDb();
    const [list] = await db.insert(schema.lists).values(body).returning();
    return reply.status(201).send({ data: list });
  });

  // POST /api/lists/:id/build
  app.post<{ Params: { id: string } }>('/:id/build', async (request, reply) => {
    const db = getDb();
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, request.params.id));
    if (!list || !list.icpId) {
      return reply.status(400).send({ error: 'List not found or has no ICP assigned' });
    }

    // Create a job to track progress
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: list.clientId,
        type: 'list_build',
        status: 'pending',
        input: { listId: list.id, icpId: list.icpId, personaId: list.personaId },
      })
      .returning();

    // Kick off build in background (fire-and-forget)
    opts.container.listBuilder
      .buildListWithDiscovery({
        clientId: list.clientId,
        listId: list.id,
        icpId: list.icpId,
        personaId: list.personaId ?? undefined,
        jobId: job.id,
      })
      .catch(async (error) => {
        logger.error({ error, listId: list.id, jobId: job.id }, 'List build with discovery failed');
        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            errors: [{ item: list.id, error: String(error), timestamp: new Date().toISOString() }],
          })
          .where(eq(schema.jobs.id, job.id));
      });

    return reply.status(202).send({ data: { jobId: job.id } });
  });

  // GET /api/lists/:id/build-status
  app.get<{ Params: { id: string } }>('/:id/build-status', async (request, reply) => {
    const db = getDb();
    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(and(
        eq(schema.jobs.type, 'list_build'),
        sql`${schema.jobs.input}->>'listId' = ${request.params.id}`,
      ))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(1);

    if (!job) {
      return reply.status(404).send({ error: 'No build job found for this list' });
    }

    return { data: job };
  });

  // POST /api/lists/:id/refresh
  app.post<{ Params: { id: string } }>('/:id/refresh', async (request) => {
    await opts.container.listBuilder.refreshList(request.params.id);
    return { data: { refreshed: true } };
  });

  // PATCH /api/lists/:id/schedule
  app.patch<{ Params: { id: string } }>('/:id/schedule', async (request) => {
    const body = updateScheduleBody.parse(request.body);
    const db = getDb();

    await db
      .update(schema.lists)
      .set({
        refreshEnabled: body.refreshEnabled,
        refreshCron: body.refreshCron,
        updatedAt: new Date(),
      })
      .where(eq(schema.lists.id, request.params.id));

    await opts.container.scheduler.updateListSchedule(
      request.params.id,
      body.refreshEnabled ? (body.refreshCron ?? null) : null,
    );

    return { data: { updated: true } };
  });

  // GET /api/lists/:id/members
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string; stage?: string } }>(
    '/:id/members',
    async (request) => {
      const db = getDb();
      const limit = parseInt(request.query.limit ?? '50', 10);
      const offset = parseInt(request.query.offset ?? '0', 10);

      const conditions = [
        eq(schema.listMembers.listId, request.params.id),
        isNull(schema.listMembers.removedAt),
      ];

      // Filter by pipeline stage if provided
      const validStages = ['tam', 'active_segment', 'qualified', 'ready_to_approach', 'in_sequence', 'converted'] as const;
      if (request.query.stage && validStages.includes(request.query.stage as typeof validStages[number])) {
        conditions.push(eq(schema.companies.pipelineStage, request.query.stage as typeof validStages[number]));
      }

      const members = await db
        .select({
          id: schema.listMembers.id,
          companyId: schema.listMembers.companyId,
          contactId: schema.listMembers.contactId,
          icpFitScore: schema.listMembers.icpFitScore,
          signalScore: schema.listMembers.signalScore,
          intelligenceScore: schema.listMembers.intelligenceScore,
          personaScore: schema.listMembers.personaScore,
          addedReason: schema.listMembers.addedReason,
          addedAt: schema.listMembers.addedAt,
          companyName: schema.companies.name,
          companyDomain: schema.companies.domain,
          companyIndustry: schema.companies.industry,
          companySource: schema.companies.primarySource,
          pipelineStage: schema.companies.pipelineStage,
          contactName: schema.contacts.fullName,
          contactTitle: schema.contacts.title,
          contactEmail: schema.contacts.workEmail,
        })
        .from(schema.listMembers)
        .leftJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
        .leftJoin(schema.contacts, eq(schema.listMembers.contactId, schema.contacts.id))
        .where(and(...conditions))
        .limit(limit)
        .offset(offset);

      return { data: members };
    },
  );

  // GET /api/lists/:id/funnel — pipeline stage counts for funnel view
  app.get<{ Params: { id: string } }>('/:id/funnel', async (request) => {
    const db = getDb();

    const rows = await db
      .select({
        stage: schema.companies.pipelineStage,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.listMembers)
      .innerJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
      .where(and(
        eq(schema.listMembers.listId, request.params.id),
        isNull(schema.listMembers.removedAt),
      ))
      .groupBy(schema.companies.pipelineStage);

    const stages: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      stages[row.stage] = row.count;
      total += row.count;
    }

    return { data: { stages, total } };
  });

  // POST /api/lists/:id/build-contacts — build a contact list from qualified companies
  app.post<{ Params: { id: string } }>('/:id/build-contacts', async (request, reply) => {
    const body = z.object({
      personaId: z.string().uuid(),
      name: z.string().min(1).optional(),
    }).parse(request.body);

    const db = getDb();
    const [sourceList] = await db.select().from(schema.lists).where(eq(schema.lists.id, request.params.id));
    if (!sourceList) {
      return reply.status(404).send({ error: 'Source list not found' });
    }
    if (sourceList.type !== 'company') {
      return reply.status(400).send({ error: 'Can only build contacts from a company list' });
    }

    // Create the contact list linked to this source list
    const [contactList] = await db
      .insert(schema.lists)
      .values({
        clientId: sourceList.clientId,
        icpId: sourceList.icpId,
        personaId: body.personaId,
        name: body.name ?? `${sourceList.name} — Contacts`,
        type: 'contact',
        sourceCompanyListId: sourceList.id,
      })
      .returning();

    // Create a job to track progress
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: sourceList.clientId,
        type: 'contact_list_build',
        status: 'running',
        input: { sourceListId: sourceList.id, contactListId: contactList.id, personaId: body.personaId },
      })
      .returning();

    // Fire-and-forget
    reply.status(202).send({ data: { jobId: job.id, contactListId: contactList.id } });

    opts.container.listBuilder
      .buildContactList({
        clientId: sourceList.clientId,
        sourceListId: sourceList.id,
        contactListId: contactList.id,
        personaId: body.personaId,
      })
      .then(async (result) => {
        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            processedItems: result.contactsAdded,
            output: result,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
      })
      .catch(async (error) => {
        logger.error({ error, jobId: job.id }, 'Contact list build failed');
        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            errors: [{ item: contactList.id, error: String(error), timestamp: new Date().toISOString() }],
          })
          .where(eq(schema.jobs.id, job.id));
      });
  });

  // POST /api/lists/:id/signals/persona — run persona signal detection on contact list
  app.post<{ Params: { id: string } }>('/:id/signals/persona', async (request, reply) => {
    const db = getDb();
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, request.params.id));
    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }
    if (list.type !== 'contact') {
      return reply.status(400).send({ error: 'Persona signals can only be run on contact lists' });
    }
    if (!list.personaId) {
      return reply.status(400).send({ error: 'List has no persona assigned' });
    }

    // Create a job to track progress
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: list.clientId,
        type: 'persona_signal_detection',
        status: 'running',
        input: { listId: list.id, personaId: list.personaId },
      })
      .returning();

    // Fire-and-forget
    reply.status(202).send({ data: { jobId: job.id } });

    opts.container.listBuilder
      .runPersonaSignals(list.id)
      .then(async (result) => {
        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            processedItems: result.processed,
            output: result,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
      })
      .catch(async (error) => {
        logger.error({ error, listId: list.id, jobId: job.id }, 'Persona signal detection failed');
        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            errors: [{ item: list.id, error: String(error), timestamp: new Date().toISOString() }],
          })
          .where(eq(schema.jobs.id, job.id));
      });
  });

  // POST /api/lists/:id/signals/company — trigger company-level signal detection
  app.post<{ Params: { id: string } }>('/:id/signals/company', async (request, reply) => {
    const db = getDb();
    const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, request.params.id));
    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    // Create a job to track progress
    const [job] = await db
      .insert(schema.jobs)
      .values({
        clientId: list.clientId,
        type: 'company_signals',
        status: 'pending',
        input: { listId: list.id },
      })
      .returning();

    // Run company signals in background
    opts.container.listBuilder
      .runCompanySignals(list.id)
      .then(async (result) => {
        await db
          .update(schema.jobs)
          .set({
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
            output: result,
          })
          .where(eq(schema.jobs.id, job.id));
      })
      .catch(async (error) => {
        logger.error({ error, listId: list.id, jobId: job.id }, 'Company signal detection failed');
        await db
          .update(schema.jobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            errors: [{ item: list.id, error: String(error), timestamp: new Date().toISOString() }],
          })
          .where(eq(schema.jobs.id, job.id));
      });

    return reply.status(202).send({ data: { jobId: job.id } });
  });
};
