import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { OverviewAdminRepository } from '../../database/repositories/overview-admin.repository.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { authorize } from '../authz/permissions.js';

// The route takes no input: an unknown query parameter is a 400, like everywhere else.
const noQuery = z.strictObject({});

/**
 * GET /admin/overview: platform-wide counts for the admin home.
 * It mixes companies and subscriptions, so the caller needs BOTH read permissions
 * (`platform:tenants:read` and `platform:subscriptions:read`): owner, admin and support have them.
 * Company users always get 403, and the check runs before the input is looked at.
 */
export function overviewAdminRoutes(auth: AuthService, overview: OverviewAdminRepository) {
  const authenticate = createAuthenticate(auth);

  return async function registerOverviewAdminRoutes(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) => tooManyRequests(Math.ceil(context.ttl / 1000)),
    });
    app.addHook('preHandler', authenticate);
    app.addHook('onSend', async (_request, reply, payload) => {
      void reply.header('cache-control', 'no-store');
      return payload;
    });

    app.get('/admin/overview', async (request) => {
      const principal = request.auth?.principal;
      if (principal === undefined) throw unauthorized();
      if (principal.kind !== 'platform') throw forbidden();
      authorize(principal, 'platform:tenants:read');
      authorize(principal, 'platform:subscriptions:read');
      parseInput(noQuery, request.query);
      return ok(await overview.summary());
    });
  };
}
