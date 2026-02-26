import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import type { IcpFilters } from '../../db/schema/icps.js';
import type { ProcessedSource } from '../../services/icp-engine/source-processor.js';

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

interface PersonaRouteOpts {
  container: ServiceContainer;
}

export const personaRoutes: FastifyPluginAsync<PersonaRouteOpts> = async (app, opts) => {
  const { container } = opts;

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
          clientId: request.params.clientId,
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

  // DELETE /api/clients/:clientId/icps/:icpId/personas/:id
  app.delete<{ Params: { clientId: string; icpId: string; id: string } }>(
    '/:clientId/icps/:icpId/personas/:id',
    async (request, reply) => {
      const db = getDb();
      const [deleted] = await db
        .delete(schema.personas)
        .where(eq(schema.personas.id, request.params.id))
        .returning();
      if (!deleted) return reply.status(404).send({ error: 'Persona not found' });
      return { data: deleted };
    },
  );

  // POST /api/clients/:clientId/icps/:icpId/personas/auto-generate
  app.post<{ Params: { clientId: string; icpId: string } }>(
    '/:clientId/icps/:icpId/personas/auto-generate',
    async (request, reply) => {
      const db = getDb();

      // Load ICP with its sources
      const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, request.params.icpId));
      if (!icp) return reply.status(404).send({ error: 'ICP not found' });

      // Build a minimal source from existing ICP data for persona generation
      const sources: ProcessedSource[] = [{
        sourceType: 'classic',
        structuredData: icp.filters as Partial<IcpFilters>,
        metadata: { regeneration: true },
      }];

      // If the ICP has a natural language input, include it as context
      if (icp.naturalLanguageInput) {
        sources.push({
          sourceType: 'transcript',
          rawText: icp.naturalLanguageInput,
          metadata: { fromNaturalLanguageInput: true },
        });
      }

      const result = await container.icpParser.parseFromSources({
        sources,
        clientId: request.params.clientId,
        existingFilters: icp.filters as Partial<IcpFilters>,
        generatePersona: true,
      });

      if (!result.suggestedPersona) {
        return reply.status(422).send({
          error: 'Not enough data to auto-generate a persona. Add more sources (transcripts, CRM data) to the ICP first.',
        });
      }

      const [persona] = await db
        .insert(schema.personas)
        .values({
          clientId: request.params.clientId,
          icpId: request.params.icpId,
          name: result.suggestedPersona.name,
          description: result.suggestedPersona.reasoning,
          titlePatterns: result.suggestedPersona.titlePatterns,
          seniorityLevels: result.suggestedPersona.seniorityLevels,
          departments: result.suggestedPersona.departments,
          isAutoGenerated: true,
          generatedFromIcpId: request.params.icpId,
        })
        .returning();

      // Link persona to ICP
      await db
        .update(schema.icps)
        .set({ suggestedPersonaId: persona.id, updatedAt: new Date() })
        .where(eq(schema.icps.id, request.params.icpId));

      return reply.status(201).send({ data: persona });
    },
  );
};
