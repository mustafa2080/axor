import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { AdminContext } from '../../database/repositories/catalog-admin.repository.js';
import type { SubscriptionsRepository } from '../../database/repositories/subscriptions.repository.js';
import { subscriptionStatuses } from '../../database/schema/index.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import type { Permission } from '../authz/permissions.js';
import { authorize } from '../authz/permissions.js';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const idParams = z.strictObject({ id: uuid });
const listQuery = z.strictObject({
  status: z.enum(subscriptionStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const activateBody = z.strictObject({ currentPeriodEnd: z.iso.datetime() });
const extendBody = z.strictObject({ days: z.number().int().min(1).max(90) });

/**
 * /admin/subscriptions: subscription management for platform staff (ADR-0007).
 * Reading needs `platform:subscriptions:read` (owner, admin, support); changing anything needs
 * `platform:subscriptions:manage` (owner, admin). Company users always get 403.
 */
export function subscriptionsAdminRoutes(auth: AuthService, subscriptions: SubscriptionsRepository) {
  const authenticate = createAuthenticate(auth);

  function contextOf(request: FastifyRequest, permission: Permission): AdminContext {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    if (principal.kind !== 'platform') throw forbidden();
    authorize(principal, permission);
    return { actorUserId: principal.userId, requestId: request.id };
  }

  return async function registerSubscriptionsAdminRoutes(app: FastifyInstance): Promise<void> {
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

    app.get('/admin/subscriptions', async (request) => {
      contextOf(request, 'platform:subscriptions:read');
      const query = parseInput(listQuery, request.query);
      const items = await subscriptions.adminList({
        limit: query.limit,
        offset: query.offset,
        ...(query.status !== undefined && { status: query.status }),
      });
      return ok(items, { limit: query.limit, offset: query.offset });
    });

    app.post('/admin/subscriptions/:id/activate', async (request) => {
      const ctx = contextOf(request, 'platform:subscriptions:manage');
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(activateBody, request.body);
      return ok(await subscriptions.adminActivate(ctx, id, new Date(body.currentPeriodEnd)));
    });

    app.post('/admin/subscriptions/:id/cancel', async (request) => {
      const ctx = contextOf(request, 'platform:subscriptions:manage');
      const { id } = parseInput(idParams, request.params);
      return ok(await subscriptions.adminCancel(ctx, id));
    });

    app.post('/admin/subscriptions/:id/extend-trial', async (request) => {
      const ctx = contextOf(request, 'platform:subscriptions:manage');
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(extendBody, request.body);
      return ok(await subscriptions.adminExtendTrial(ctx, id, body.days));
    });
  };
}
