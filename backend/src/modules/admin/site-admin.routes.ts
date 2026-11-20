import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { AdminContext } from '../../database/repositories/catalog-admin.repository.js';
import type { SiteSettingsRepository } from '../../database/repositories/site-settings.repository.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { authorize } from '../authz/permissions.js';
import { homeContentSchema } from '../site/home-content.js';
import { HOME_KEY } from '../site/site.routes.js';

// `content: null` puts the built-in default back. `expectedVersion` is the version the editor
// loaded (0 = nothing saved yet): a save from an out-of-date editor is a 409, never an overwrite.
const updateBody = z.strictObject({
  expectedVersion: z.number().int().min(0).max(1_000_000),
  content: homeContentSchema.nullable(),
});

/**
 * /admin/site/home: the home page content for platform staff (ADR-0027).
 * Both routes need `platform:site:manage` (owner and admin); support and company users get 403.
 */
export function siteAdminRoutes(auth: AuthService, site: SiteSettingsRepository) {
  const authenticate = createAuthenticate(auth);

  function contextOf(request: FastifyRequest): AdminContext {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    if (principal.kind !== 'platform') throw forbidden();
    authorize(principal, 'platform:site:manage');
    return { actorUserId: principal.userId, requestId: request.id };
  }

  return async function registerSiteAdminRoutes(app: FastifyInstance): Promise<void> {
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

    app.get('/admin/site/home', async (request) => {
      contextOf(request);
      const row = await site.get(HOME_KEY);
      return ok({ content: row.content, version: row.version, updatedAt: row.updatedAt });
    });

    app.put('/admin/site/home', async (request) => {
      const ctx = contextOf(request);
      const body = parseInput(updateBody, request.body);
      const row = await site.save(ctx, HOME_KEY, body.expectedVersion, body.content);
      return ok({ content: row.content, version: row.version, updatedAt: row.updatedAt });
    });
  };
}
