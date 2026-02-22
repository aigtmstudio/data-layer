import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ServiceContainer } from '../../index.js';

const exportBody = z.object({
  clientId: z.string().uuid(),
  listId: z.string().uuid(),
  format: z.enum(['csv', 'excel', 'google_sheets', 'salesforce', 'hubspot']),
  destination: z.record(z.unknown()).optional(),
});

export const exportRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  // POST /api/exports
  app.post('/', async (request) => {
    const body = exportBody.parse(request.body);
    const result = await opts.container.exportEngine.export(
      body.clientId,
      body.listId,
      body.format,
      body.destination,
    );
    return { data: result };
  });
};
