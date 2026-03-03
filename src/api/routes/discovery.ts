import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ServiceContainer } from '../../index.js';
import { logger } from '../../lib/logger.js';

const listingPlatforms = ['opentable', 'ubereats', 'justeat'] as const;

const newsBody = z.object({
  clientId: z.string().uuid(),
  queries: z.array(z.string().min(1)).min(1).max(10),
  limit: z.number().int().min(1).max(200).optional(),
});

const placesBody = z.object({
  clientId: z.string().uuid(),
  query: z.string().min(1),
  location: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
});

const reviewsBody = z.object({
  clientId: z.string().uuid(),
  location: z.string().min(1),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const listingsBody = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(listingPlatforms),
  location: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
});

export const discoveryRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const log = logger.child({ route: 'discovery' });
  const { companyDiscovery } = opts.container;

  if (!companyDiscovery) {
    // Register stubs if discovery service not available
    app.all('/*', async (_req, reply) => reply.status(503).send({ error: 'Discovery service not configured' }));
    return;
  }

  // POST /api/discovery/news
  // Find companies from news articles about openings, expansions, refurbishments
  app.post('/news', async (request, reply) => {
    const body = newsBody.parse(request.body);
    log.info({ clientId: body.clientId, queries: body.queries }, 'News discovery triggered');

    reply.status(202).send({ data: { message: 'News discovery started' } });

    companyDiscovery
      .discoverFromNews({ clientId: body.clientId, queries: body.queries, limit: body.limit })
      .then((result) => log.info({ clientId: body.clientId, ...result }, 'News discovery complete'))
      .catch((err) => log.error({ err, clientId: body.clientId }, 'News discovery failed'));
  });

  // POST /api/discovery/places
  // Find local businesses via Google Places
  app.post('/places', async (request, reply) => {
    const body = placesBody.parse(request.body);
    log.info({ clientId: body.clientId, query: body.query, location: body.location }, 'Google Places discovery triggered');

    reply.status(202).send({ data: { message: 'Google Places discovery started' } });

    companyDiscovery
      .discoverFromGooglePlaces({ clientId: body.clientId, query: body.query, location: body.location, limit: body.limit })
      .then((result) => log.info({ clientId: body.clientId, ...result }, 'Google Places discovery complete'))
      .catch((err) => log.error({ err, clientId: body.clientId }, 'Google Places discovery failed'));
  });

  // POST /api/discovery/reviews
  // Find businesses with negative payment/checkout reviews
  app.post('/reviews', async (request, reply) => {
    const body = reviewsBody.parse(request.body);
    log.info({ clientId: body.clientId, location: body.location }, 'Review discovery triggered');

    reply.status(202).send({ data: { message: 'Review discovery started' } });

    companyDiscovery
      .discoverFromReviews({ clientId: body.clientId, location: body.location, category: body.category, limit: body.limit })
      .then((result) => log.info({ clientId: body.clientId, ...result }, 'Review discovery complete'))
      .catch((err) => log.error({ err, clientId: body.clientId }, 'Review discovery failed'));
  });

  // POST /api/discovery/listings
  // Find businesses from delivery/booking platform listings
  app.post('/listings', async (request, reply) => {
    const body = listingsBody.parse(request.body);
    log.info({ clientId: body.clientId, platform: body.platform, location: body.location }, 'Listing discovery triggered');

    reply.status(202).send({ data: { message: 'Listing discovery started' } });

    companyDiscovery
      .discoverFromListings({ clientId: body.clientId, platform: body.platform, location: body.location, limit: body.limit })
      .then((result) => log.info({ clientId: body.clientId, ...result }, 'Listing discovery complete'))
      .catch((err) => log.error({ err, clientId: body.clientId }, 'Listing discovery failed'));
  });
};
