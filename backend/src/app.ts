import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import type { Env } from './config/env.js';
import { healthRoutes } from './modules/health/health.routes.js';
import type { HealthDeps } from './modules/health/health.routes.js';

export type AppDeps = HealthDeps;

export function buildApp(env: Env, deps: AppDeps) {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    bodyLimit: 1_048_576,
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  // Unified error shape. Never expose stack traces or internal details.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (status === 500) {
      request.log.error({ err: error }, 'unhandled error');
    }
    void reply.code(status).send({
      error:
        status === 500
          ? { code: 'INTERNAL_ERROR', message: 'Internal server error' }
          : { code: 'BAD_REQUEST', message: error.message },
    });
  });

  void app.register(healthRoutes(deps), { prefix: '/api/v1' });

  return app;
}
