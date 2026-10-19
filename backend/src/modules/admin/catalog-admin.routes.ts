import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type {
  AdminContext,
  CatalogAdminRepository,
} from '../../database/repositories/catalog-admin.repository.js';
import {
  activityStatuses,
  billingPeriods,
  planStatuses,
  productStatuses,
} from '../../database/schema/index.js';
import { createAuthenticate } from '../auth/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { authorize } from '../authz/permissions.js';

const code = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/, 'Use lowercase letters, digits, - or _');
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const name = z
  .string()
  .trim()
  .min(2)
  .max(200)
  .refine(
    (value) => [...value].every((char) => (char.codePointAt(0) ?? 0) > 31 && char !== '\u007f'),
    'Name has invalid characters',
  );

// Limit/feature keys are machine names (e.g. "users", "shipments_per_month").
const limitKey = z.string().regex(/^[a-z][a-z0-9_]{0,49}$/, 'Invalid key');
const MAX_KEYS = 50;
const limits = z
  .record(limitKey, z.number().int().min(0).max(2_147_483_647).nullable())
  .refine((value) => Object.keys(value).length <= MAX_KEYS, `At most ${MAX_KEYS} limits`);
const features = z
  .record(limitKey, z.boolean())
  .refine((value) => Object.keys(value).length <= MAX_KEYS, `At most ${MAX_KEYS} features`);

// Money is an integer in the smallest currency unit (ADR-0003 §2). Never a float.
const versionSpec = z.strictObject({
  priceMinor: z.number().int().min(0).max(1_000_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO code such as EGP'),
  billingPeriod: z.enum(billingPeriods),
  trialDays: z.number().int().min(0).max(365),
  limits,
  features,
});

const idParams = z.strictObject({ id: uuid });
const productBody = z.strictObject({
  code,
  name,
  status: z.enum(productStatuses).default('coming_soon'),
});
const productPatch = z
  .strictObject({ name: name.optional(), status: z.enum(productStatuses).optional() })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
const activityBody = z.strictObject({
  code,
  name,
  status: z.enum(activityStatuses).default('active'),
});
const activityPatch = z
  .strictObject({ name: name.optional(), status: z.enum(activityStatuses).optional() })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
const planBody = z.strictObject({
  code,
  activityCode: code.nullable().default(null),
  status: z.enum(planStatuses).default('active'),
  version: versionSpec,
});
const planPatch = z
  .strictObject({ status: z.enum(planStatuses).optional(), currentVersionId: uuid.optional() })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');

/** Drops keys whose value is undefined (Zod's optional fields) so only real changes are written. */
function compact<T extends Record<string, unknown>>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/**
 * /admin/catalog: catalog management for platform staff (ADR-0006).
 * Every route needs a signed-in PLATFORM user whose role grants `platform:plans:manage`
 * (owner and admin; not support, and never a company user).
 */
export function catalogAdminRoutes(auth: AuthService, admin: CatalogAdminRepository) {
  const authenticate = createAuthenticate(auth);

  function contextOf(request: FastifyRequest): AdminContext {
    const principal = request.auth?.principal;
    if (principal === undefined) throw unauthorized();
    if (principal.kind !== 'platform') throw forbidden();
    authorize(principal, 'platform:plans:manage');
    return { actorUserId: principal.userId, requestId: request.id };
  }

  return async function registerCatalogAdminRoutes(app: FastifyInstance): Promise<void> {
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

    app.get('/admin/catalog', async (request) => {
      contextOf(request);
      return ok(await admin.listCatalog());
    });

    app.post('/admin/catalog/products', async (request, reply) => {
      const ctx = contextOf(request);
      const body = parseInput(productBody, request.body);
      void reply.code(201);
      return ok(await admin.createProduct(ctx, body));
    });

    app.patch('/admin/catalog/products/:id', async (request) => {
      const ctx = contextOf(request);
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(productPatch, request.body);
      return ok(await admin.updateProduct(ctx, id, compact(body)));
    });

    app.post('/admin/catalog/products/:id/activities', async (request, reply) => {
      const ctx = contextOf(request);
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(activityBody, request.body);
      void reply.code(201);
      return ok(await admin.createActivity(ctx, id, body));
    });

    app.patch('/admin/catalog/activities/:id', async (request) => {
      const ctx = contextOf(request);
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(activityPatch, request.body);
      return ok(await admin.updateActivity(ctx, id, compact(body)));
    });

    app.post('/admin/catalog/products/:id/plans', async (request, reply) => {
      const ctx = contextOf(request);
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(planBody, request.body);
      void reply.code(201);
      return ok(await admin.createPlan(ctx, id, body));
    });

    // New price/limits/features = a NEW version that becomes current. Versions are never edited.
    app.post('/admin/catalog/plans/:id/versions', async (request, reply) => {
      const ctx = contextOf(request);
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(versionSpec, request.body);
      void reply.code(201);
      return ok(await admin.addVersion(ctx, id, body));
    });

    app.patch('/admin/catalog/plans/:id', async (request) => {
      const ctx = contextOf(request);
      const { id } = parseInput(idParams, request.params);
      const body = parseInput(planPatch, request.body);
      return ok(await admin.updatePlan(ctx, id, compact(body)));
    });
  };
}
