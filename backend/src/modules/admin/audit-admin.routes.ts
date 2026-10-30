import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { AuditAdminRepository } from '../../database/repositories/audit-admin.repository.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { authorize } from '../authz/permissions.js';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const listQuery = z.strictObject({
  action: z
    .string()
    .max(100)
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, 'Invalid action')
    .optional(),
  tenantId: uuid.optional(),
  actorUserId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/**
 * GET /admin/audit-logs: the audit trail for platform staff (ADR-0010).
 * Needs `platform:audit:read` (platform owner and admin; support does not have it). Company users
 * always get 403. Read-only: there is no way to change or delete an entry through the API.
 */
export function auditAdminRoutes(auth: AuthService, audit: AuditAdminRepository) {
  const authenticate = createAuthenticate(auth);

  function requireAuditReader(request: FastifyRequest): void {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    if (principal.kind !== 'platform') throw forbidden();
    authorize(principal, 'platform:audit:read');
  }

  return async function registerAuditAdminRoutes(app: FastifyInstance): Promise<void> {
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

    app.get('/admin/audit-logs', async (request) => {
      requireAuditReader(request);
      const query = parseInput(listQuery, request.query);
      const items = await audit.list({
        limit: query.limit,
        offset: query.offset,
        ...(query.action !== undefined && { action: query.action }),
        ...(query.tenantId !== undefined && { tenantId: query.tenantId }),
        ...(query.actorUserId !== undefined && { actorUserId: query.actorUserId }),
      });
      return ok(items, { limit: query.limit, offset: query.offset });
    });
  };
}
