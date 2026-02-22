import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ServiceContainer } from '../../index.js';

const addCreditsBody = z.object({
  amount: z.number().positive(),
  type: z.enum(['purchase', 'adjustment', 'refund']),
  description: z.string().min(1),
});

export const creditRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  // GET /api/credits/:clientId
  app.get<{ Params: { clientId: string } }>('/:clientId', async (request) => {
    const balance = await opts.container.creditManager.getBalance(request.params.clientId);
    const transactions = await opts.container.creditManager.getTransactions(request.params.clientId, 20);
    return { data: { balance, recentTransactions: transactions } };
  });

  // POST /api/credits/:clientId/add
  app.post<{ Params: { clientId: string } }>('/:clientId/add', async (request) => {
    const body = addCreditsBody.parse(request.body);
    const result = await opts.container.creditManager.addCredits(
      request.params.clientId,
      body.amount,
      body.type,
      body.description,
    );
    return { data: result };
  });

  // GET /api/credits/:clientId/usage
  app.get<{ Params: { clientId: string }; Querystring: { limit?: string } }>(
    '/:clientId/usage',
    async (request) => {
      const limit = parseInt(request.query.limit ?? '100', 10);
      const transactions = await opts.container.creditManager.getTransactions(
        request.params.clientId,
        limit,
      );
      return { data: transactions };
    },
  );
};
