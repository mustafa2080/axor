import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound, tooManyRequests } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { CatalogRepository } from '../../database/repositories/catalog.repository.js';

const code = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/, 'Invalid code');
const productParams = z.strictObject({ productCode: code });
// Strict: an unknown query parameter is a 400, never silently ignored.
const plansQuery = z.strictObject({ activity: code.optional() });

/**
 * Public, read-only catalog for the marketing site and the plan picker:
 *   GET /catalog/products
 *   GET /catalog/products/:productCode/plans[?activity=<code>]
 * No authentication: prices and limits are what visitors see. Nothing here accepts a price,
 * duration or entitlement from the client; it only reads what the database says.
 */
export function catalogRoutes(catalog: CatalogRepository) {
  return async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) => tooManyRequests(Math.ceil(context.ttl / 1000)),
    });
    app.addHook('onSend', async (_request, reply, payload) => {
      // Same for everyone, so shared caches may keep it briefly.
      if (reply.statusCode === 200) void reply.header('cache-control', 'public, max-age=60');
      return payload;
    });

    app.get('/catalog/products', async () => ok(await catalog.listProducts()));

    app.get('/catalog/products/:productCode/plans', async (request) => {
      const { productCode } = parseInput(productParams, request.params);
      const { activity } = parseInput(plansQuery, request.query);
      const list = await catalog.listPlans(productCode, activity);
      if (list === null) throw notFound();
      return ok(list);
    });
  };
}
