import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const authPluginFn: FastifyPluginAsync<{ apiKey: string }> = async (app, opts) => {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;

    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token || token !== opts.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
};

export const authPlugin = fp(authPluginFn, { name: 'auth' });
