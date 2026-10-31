import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { MembersRepository } from '../../database/repositories/members.repository.js';
import { tenantRoles } from '../../database/schema/index.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import type { Permission } from '../authz/permissions.js';
import { authorize } from '../authz/permissions.js';
import { requireTenantScope } from '../authz/tenant-scope.js';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const idParams = z.strictObject({ id: uuid });
const listQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
// The company and the user's id come from the session and the URL; the body only ever names the role.
const roleBody = z.strictObject({ role: z.enum(tenantRoles) });

/**
 * /members: the people of the signed-in user's own company (ADR-0011).
 * Reading needs `users:read` (owner, admin, member); changing a role needs `users:update` and
 * disabling or re-enabling needs `users:disable` (owner, admin). Who may touch whom, and the
 * "never leave a company without an owner" rule, are enforced in the repository.
 */
export function membersRoutes(auth: AuthService, members: MembersRepository) {
  const authenticate = createAuthenticate(auth);

  function actorOf(request: FastifyRequest, permission: Permission) {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    const scope = requireTenantScope(principal);
    authorize(principal, permission);
    if (principal.kind !== 'tenant') throw forbidden();
    return { scope, role: principal.role };
  }

  return async function registerMembersRoutes(app: FastifyInstance): Promise<void> {
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

    app.get('/members', async (request) => {
      const { scope } = actorOf(request, 'users:read');
      const query = parseInput(listQuery, request.query);
      const items = await members.list(scope, { limit: query.limit, offset: query.offset });
      return ok(items, { limit: query.limit, offset: query.offset });
    });

    app.patch('/members/:id/role', async (request) => {
      const { scope, role } = actorOf(request, 'users:update');
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(roleBody, request.body);
      return ok(await members.changeRole(scope, role, id, body.role, request.id));
    });

    app.post('/members/:id/disable', async (request) => {
      const { scope, role } = actorOf(request, 'users:disable');
      const { id } = parseInput(idParams, request.params);
      return ok(await members.disable(scope, role, id, request.id));
    });

    app.post('/members/:id/enable', async (request) => {
      const { scope, role } = actorOf(request, 'users:disable');
      const { id } = parseInput(idParams, request.params);
      return ok(await members.enable(scope, role, id, request.id));
    });
  };
}
