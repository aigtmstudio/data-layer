import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';

const createIcpBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  naturalLanguageInput: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
});

const updateIcpBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  naturalLanguageInput: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const icpRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  // GET /api/clients/:clientId/icps
  app.get<{ Params: { clientId: string } }>('/:clientId/icps', async (request) => {
    const db = getDb();
    const icps = await db
      .select()
      .from(schema.icps)
      .where(and(eq(schema.icps.clientId, request.params.clientId), eq(schema.icps.isActive, true)));
    return { data: icps };
  });

  // POST /api/clients/:clientId/icps
  app.post<{ Params: { clientId: string } }>('/:clientId/icps', async (request, reply) => {
    const body = createIcpBody.parse(request.body);
    const db = getDb();

    let filters: Record<string, unknown> = body.filters ?? {};
    let confidence: number | undefined;

    // If natural language input provided, parse it
    if (body.naturalLanguageInput && !body.filters) {
      const parsed = await opts.container.icpParser.parseNaturalLanguage(body.naturalLanguageInput);
      filters = parsed.filters as unknown as Record<string, unknown>;
      confidence = parsed.confidence;
    }

    const [icp] = await db
      .insert(schema.icps)
      .values({
        clientId: request.params.clientId,
        name: body.name,
        description: body.description,
        naturalLanguageInput: body.naturalLanguageInput,
        filters,
        aiParsingConfidence: confidence != null ? String(confidence) : undefined,
        lastParsedAt: confidence != null ? new Date() : undefined,
      })
      .returning();

    return reply.status(201).send({ data: icp });
  });

  // PATCH /api/clients/:clientId/icps/:id
  app.patch<{ Params: { clientId: string; id: string } }>('/:clientId/icps/:id', async (request) => {
    const body = updateIcpBody.parse(request.body);
    const db = getDb();
    const [updated] = await db
      .update(schema.icps)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.icps.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // POST /api/clients/:clientId/icps/:id/parse — re-parse NL to structured
  app.post<{ Params: { clientId: string; id: string } }>('/:clientId/icps/:id/parse', async (request) => {
    const db = getDb();
    const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, request.params.id));
    if (!icp || !icp.naturalLanguageInput) {
      return { error: 'ICP not found or has no natural language input' };
    }

    const parsed = await opts.container.icpParser.parseNaturalLanguage(icp.naturalLanguageInput);

    const [updated] = await db
      .update(schema.icps)
      .set({
        filters: parsed.filters,
        aiParsingConfidence: String(parsed.confidence),
        lastParsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.icps.id, request.params.id))
      .returning();

    return { data: updated };
  });
};
