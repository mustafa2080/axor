import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  checkDatabase: () => Promise<void>;
}

/**
 * /health       liveness: the process is up.
 * /health/ready readiness: dependencies (database) are reachable. Never exposes error details.
 */
export function healthRoutes(deps: HealthDeps) {
  return async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async () => ({ status: 'ok' }));

    app.get('/health/ready', async (request, reply) => {
      try {
        await deps.checkDatabase();
        return { status: 'ready' };
      } catch (error) {
        request.log.error({ err: error }, 'readiness check failed');
        return reply.code(503).send({ status: 'unavailable' });
      }
    });
  };
}
