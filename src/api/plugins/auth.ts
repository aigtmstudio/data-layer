import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken } from '@clerk/backend';

interface AuthPluginOpts {
  apiKey: string;
  clerkSecretKey?: string;
}

const authPluginFn: FastifyPluginAsync<AuthPluginOpts> = async (app, opts) => {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    if (request.url.startsWith('/api/demo/')) return; // Demo routes handle their own auth

    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Fast path: static API key (server-to-server, scripts, local dev)
    if (token === opts.apiKey) {
      return;
    }

    // Slow path: Clerk JWT verification (browser sessions)
    if (opts.clerkSecretKey) {
      try {
        const payload = await verifyToken(token, {
          secretKey: opts.clerkSecretKey,
        });
        (request as any).clerkUserId = payload.sub;
        return;
      } catch {
        // Token is neither valid API key nor valid Clerk JWT
      }
    }

    return reply.status(401).send({ error: 'Unauthorized' });
  });
};

export const authPlugin = fp(authPluginFn, { name: 'auth' });
