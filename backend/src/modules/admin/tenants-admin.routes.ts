import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { AdminContext } from '../../database/repositories/catalog-admin.repository.js';
import type { TenantsAdminRepository } from '../../database/repositories/tenants-admin.repository.js';
import { tenantStatuses } from '../../database/schema/index.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import type { Permission } from '../authz/permissions.js';
import { authorize } from '../authz/permissions.js';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const idParams = z.strictObject({ id: uuid });
const listQuery = z.strictObject({
  status: z.enum(tenantStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const reason = z.string().trim().min(3).max(500);
// Suspending needs a written reason (it goes into the audit trail); reactivating may carry one.
const suspendBody = z.strictObject({ reason });
const reactivateBody = z.strictObject({ reason: reason.optional() });

/**
 * /admin/tenants: companies for platform staff (ADR-0011).
 * Reading needs `platform:tenants:read` (owner, admin, support); suspending and reactivating need
 * `platform:tenants:manage` (owner, admin). Company users always get 403.
 */
export function tenantsAdminRoutes(auth: AuthService, tenants: TenantsAdminRepository) {
  const authenticate = createAuthenticate(auth);

  function contextOf(request: FastifyRequest, permission: Permission): AdminContext {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    if (principal.kind !== 'platform') throw forbidden();
    authorize(principal, permission);
    return { actorUserId: principal.userId, requestId: request.id };
  }

  return async function registerTenantsAdminRoutes(app: FastifyInstance): Promise<void> {
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

    app.get('/admin/tenants', async (request) => {
      contextOf(request, 'platform:tenants:read');
      const query = parseInput(listQuery, request.query);
      const items = await tenants.list({
        limit: query.limit,
        offset: query.offset,
        ...(query.status !== undefined && { status: query.status }),
      });
      return ok(items, { limit: query.limit, offset: query.offset });
    });

    app.post('/admin/tenants/:id/suspend', async (request) => {
      const ctx = contextOf(request, 'platform:tenants:manage');
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(suspendBody, request.body);
      return ok(await tenants.suspend(ctx, id, body.reason));
    });

    app.post('/admin/tenants/:id/reactivate', async (request) => {
      const ctx = contextOf(request, 'platform:tenants:manage');
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(reactivateBody, request.body ?? {});
      return ok(await tenants.reactivate(ctx, id, body.reason));
    });
  };
}
