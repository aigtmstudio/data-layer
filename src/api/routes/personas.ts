import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

const createPersonaBody = z.object({
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

const updatePersonaBody = createPersonaBody.partial().extend({
  isActive: z.boolean().optional(),
});

export const personaRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/clients/:clientId/icps/:icpId/personas
  app.get<{ Params: { clientId: string; icpId: string } }>(
    '/:clientId/icps/:icpId/personas',
    async (request) => {
      const db = getDb();
      const personas = await db
        .select()
        .from(schema.personas)
        .where(and(eq(schema.personas.icpId, request.params.icpId), eq(schema.personas.isActive, true)));
      return { data: personas };
    },
  );

  // POST /api/clients/:clientId/icps/:icpId/personas
  app.post<{ Params: { clientId: string; icpId: string } }>(
    '/:clientId/icps/:icpId/personas',
    async (request, reply) => {
      const body = createPersonaBody.parse(request.body);
      const db = getDb();
      const [persona] = await db
        .insert(schema.personas)
        .values({
          icpId: request.params.icpId,
          ...body,
        })
        .returning();
      return reply.status(201).send({ data: persona });
    },
  );

  // PATCH /api/clients/:clientId/icps/:icpId/personas/:id
  app.patch<{ Params: { clientId: string; icpId: string; id: string } }>(
    '/:clientId/icps/:icpId/personas/:id',
    async (request) => {
      const body = updatePersonaBody.parse(request.body);
      const db = getDb();
      const [updated] = await db
        .update(schema.personas)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(schema.personas.id, request.params.id))
        .returning();
      return { data: updated };
    },
  );
};
