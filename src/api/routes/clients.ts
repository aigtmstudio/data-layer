import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

const createClientBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  notes: z.string().optional(),
  creditMarginPercent: z.number().min(0).max(100).optional(),
});

const updateClientBody = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  notes: z.string().optional(),
  creditMarginPercent: z.number().min(0).max(100).optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const clientRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/clients
  app.get('/', async () => {
    const db = getDb();
    const allClients = await db.select().from(schema.clients).where(eq(schema.clients.isActive, true));
    return { data: allClients };
  });

  // GET /api/clients/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, request.params.id));
    if (!client) return reply.status(404).send({ error: 'Client not found' });
    return { data: client };
  });

  // POST /api/clients
  app.post('/', async (request, reply) => {
    const body = createClientBody.parse(request.body);
    const db = getDb();
    const [client] = await db
      .insert(schema.clients)
      .values({
        ...body,
        creditMarginPercent: body.creditMarginPercent != null ? String(body.creditMarginPercent) : undefined,
      })
      .returning();
    return reply.status(201).send({ data: client });
  });

  // PATCH /api/clients/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateClientBody.parse(request.body);
    const db = getDb();
    const [updated] = await db
      .update(schema.clients)
      .set({
        ...body,
        creditMarginPercent: body.creditMarginPercent != null ? String(body.creditMarginPercent) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, request.params.id))
      .returning();
    return { data: updated };
  });
};
