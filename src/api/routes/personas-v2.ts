import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';

const createPersonaBody = z.object({
  clientId: z.string().uuid(),
  icpId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  titlePatterns: z.array(z.string()).optional(),
  seniorityLevels: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  yearsExperienceMin: z.number().optional(),
  yearsExperienceMax: z.number().optional(),
  excludeTitlePatterns: z.array(z.string()).optional(),
});

const updatePersonaBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  titlePatterns: z.array(z.string()).optional(),
  seniorityLevels: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  yearsExperienceMin: z.number().optional(),
  yearsExperienceMax: z.number().optional(),
  excludeTitlePatterns: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

interface PersonaV2RouteOpts {
  container: ServiceContainer;
}

export const personaV2Routes: FastifyPluginAsync<PersonaV2RouteOpts> = async (app, opts) => {
  // GET /api/personas?clientId=...
  app.get<{
    Querystring: { clientId?: string };
  }>('/', async (request, reply) => {
    if (!request.query.clientId) {
      return reply.status(400).send({ error: 'clientId is required' });
    }
    const db = getDb();
    const personas = await db
      .select()
      .from(schema.personas)
      .where(and(
        eq(schema.personas.clientId, request.query.clientId),
        eq(schema.personas.isActive, true),
      ));
    return { data: personas };
  });

  // GET /api/personas/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [persona] = await db
      .select()
      .from(schema.personas)
      .where(eq(schema.personas.id, request.params.id));
    if (!persona) return reply.status(404).send({ error: 'Persona not found' });
    return { data: persona };
  });

  // POST /api/personas
  app.post('/', async (request, reply) => {
    const body = createPersonaBody.parse(request.body);
    const db = getDb();
    const [persona] = await db
      .insert(schema.personas)
      .values({
        clientId: body.clientId,
        icpId: body.icpId,
        name: body.name,
        description: body.description,
        titlePatterns: body.titlePatterns ?? [],
        seniorityLevels: body.seniorityLevels ?? [],
        departments: body.departments ?? [],
        countries: body.countries,
        states: body.states,
        yearsExperienceMin: body.yearsExperienceMin,
        yearsExperienceMax: body.yearsExperienceMax,
        excludeTitlePatterns: body.excludeTitlePatterns,
      })
      .returning();
    return reply.status(201).send({ data: persona });
  });

  // PATCH /api/personas/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updatePersonaBody.parse(request.body);
    const db = getDb();
    const [updated] = await db
      .update(schema.personas)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.personas.id, request.params.id))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Persona not found' });
    return { data: updated };
  });

  // DELETE /api/personas/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [deleted] = await db
      .delete(schema.personas)
      .where(eq(schema.personas.id, request.params.id))
      .returning();
    if (!deleted) return reply.status(404).send({ error: 'Persona not found' });
    return { data: deleted };
  });
};
