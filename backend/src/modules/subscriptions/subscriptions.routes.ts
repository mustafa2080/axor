import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { SubscriptionsRepository } from '../../database/repositories/subscriptions.repository.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import type { Permission } from '../authz/permissions.js';
import { authorize } from '../authz/permissions.js';
import { requireTenantScope } from '../authz/tenant-scope.js';

const code = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/, 'Use lowercase letters, digits, - or _');

// Strict: the company says WHICH plan it wants. Status, dates, tenant and trial length are never
// accepted from the client (ADR-0007); they are decided by the server.
const trialBody = z.strictObject({ productCode: code, planCode: code });
const cancelParams = z.strictObject({ productCode: code });

/**
 * /subscriptions: a company's own trials and subscriptions (ADR-0007).
 * The company comes from the signed-in user, never from the request. Reading needs
 * `subscription:read`; starting a trial or canceling needs `subscription:manage` (company owner).
 */
export function subscriptionsRoutes(auth: AuthService, subscriptions: SubscriptionsRepository) {
  const authenticate = createAuthenticate(auth);

  function scopeOf(request: FastifyRequest, permission: Permission) {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    const scope = requireTenantScope(principal);
    authorize(principal, permission);
    return scope;
  }

  return async function registerSubscriptionRoutes(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) => tooManyRequests(Math.ceil(context.ttl / 1000)),
    });
    app.addHook('preHandler', authenticate);
    app.addHook('onSend', async (_request, reply, payload) => {
      void reply.header('cache-control', 'no-store');
      return payload;
    });

    app.get('/subscriptions', async (request) => {
      const scope = scopeOf(request, 'subscription:read');
      return ok(await subscriptions.listForTenant(scope));
    });

    app.post('/subscriptions/trial', async (request, reply) => {
      const scope = scopeOf(request, 'subscription:manage');
      const body = parseInput(trialBody, request.body);
      void reply.code(201);
      return ok(await subscriptions.startTrial(scope, body, request.id));
    });

    app.post('/subscriptions/:productCode/cancel', async (request) => {
      const scope = scopeOf(request, 'subscription:manage');
      const { productCode } = parseInput(cancelParams, request.params);
      return ok(await subscriptions.cancelForTenant(scope, productCode, request.id));
    });
  };
}
