import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { tooManyRequests } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import type { SiteSettingsRepository } from '../../database/repositories/site-settings.repository.js';

export const HOME_KEY = 'home';

/**
 * Public, read-only: the editable content of the home page (ADR-0027).
 *   GET /site/home  ->  { content: <validated content> | null, version }
 * `content: null` means nobody saved anything yet and the web app shows its built-in default.
 * No authentication and nothing from the client is read: it only returns what staff saved, which
 * was validated when it was saved.
 */
export function siteRoutes(site: SiteSettingsRepository) {
  return async function registerSiteRoutes(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) => tooManyRequests(Math.ceil(context.ttl / 1000)),
    });
    app.addHook('onSend', async (_request, reply, payload) => {
      // The same for everyone; short, so an edit shows up on the public page within seconds.
      if (reply.statusCode === 200) void reply.header('cache-control', 'public, max-age=30');
      return payload;
    });

    app.get('/site/home', async () => {
      const row = await site.get(HOME_KEY);
      return ok({ content: row.content, version: row.version });
    });
  };
}
