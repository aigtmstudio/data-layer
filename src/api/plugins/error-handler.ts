import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../lib/errors.js';
import { ZodError } from 'zod';

const errorHandlerPluginFn: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: error.flatten().fieldErrors,
      });
    }

    // Fastify validation errors
    const fastifyError = error as { validation?: unknown; message?: string };
    if (fastifyError.validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: fastifyError.message ?? 'Validation error',
      });
    }

    request.log.error(error, 'Unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
};

export const errorHandlerPlugin = fp(errorHandlerPluginFn, { name: 'error-handler' });
