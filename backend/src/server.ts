import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './database/client.js';
import { createAuditAdminRepository } from './database/repositories/audit-admin.repository.js';
import { createCatalogAdminRepository } from './database/repositories/catalog-admin.repository.js';
import { createCatalogRepository } from './database/repositories/catalog.repository.js';
import { createIdempotencyKeysRepository } from './database/repositories/idempotency-keys.repository.js';
import { createMembersRepository } from './database/repositories/members.repository.js';
import { createRefreshSessionsRepository } from './database/repositories/refresh-sessions.repository.js';
import { createSubscriptionsRepository } from './database/repositories/subscriptions.repository.js';
import { createTenantsAdminRepository } from './database/repositories/tenants-admin.repository.js';
import { createAccessTokenService } from './modules/auth/access-token.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { purgeExpiredSessions } from './modules/auth/session-purge.js';
import { createIdempotency } from './modules/idempotency/idempotency.js';
import { startExpiryJob } from './modules/subscriptions/expiry-job.js';

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL, {
  poolSize: env.DB_POOL_SIZE,
  queueLimit: env.DB_POOL_QUEUE_LIMIT,
  statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
});
const accessTokens = createAccessTokenService({
  secret: env.JWT_ACCESS_SECRET,
  previousSecret: env.JWT_ACCESS_SECRET_PREVIOUS,
  ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  issuer: 'axor-api',
  audience: 'axor-web',
});
const auth = createAuthService({
  db: database.db,
  accessTokens,
  refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
});
const catalog = createCatalogRepository(database.db);
const catalogAdmin = createCatalogAdminRepository(database.db);
const subscriptions = createSubscriptionsRepository(database.db);
const idempotencyKeys = createIdempotencyKeysRepository(database.db);
const app = buildApp(env, {
  checkDatabase: () => database.ping(),
  auth,
  catalog,
  catalogAdmin,
  subscriptions,
  idempotency: createIdempotency(idempotencyKeys),
  auditAdmin: createAuditAdminRepository(database.db),
  members: createMembersRepository(database.db),
  tenantsAdmin: createTenantsAdminRepository(database.db),
});

// Makes the stored status catch up with end dates (ADR-0007). Access itself never waits for it.
const EXPIRY_INTERVAL_MS = 60_000;
const expiryJob = startExpiryJob({
  run: () => subscriptions.expireDue(),
  intervalMs: EXPIRY_INTERVAL_MS,
  onResult: (expired) => {
    if (expired > 0) app.log.info({ expired }, 'subscriptions expired');
  },
  onError: (error) => app.log.error({ err: error }, 'subscription expiry pass failed'),
});

// Deletes refresh sessions that expired more than a week ago (ADR-0025). Same scheduler as above:
// passes never overlap, a failure is logged and retried, and the timer never keeps the process up.
const SESSION_PURGE_INTERVAL_MS = 60 * 60_000;
const refreshSessions = createRefreshSessionsRepository(database.db);
const sessionPurgeJob = startExpiryJob({
  run: () =>
    purgeExpiredSessions(refreshSessions, {
      graceMs: 7 * 24 * 60 * 60_000,
      batchSize: 1000,
      maxBatches: 20,
    }),
  intervalMs: SESSION_PURGE_INTERVAL_MS,
  onResult: (purged) => {
    if (purged > 0) app.log.info({ purged }, 'expired refresh sessions purged');
  },
  onError: (error) => app.log.error({ err: error }, 'refresh session purge failed'),
});

// Deletes stored idempotency responses past their 24 hour life (ADR-0026). Reuses the bounded
// batch loop of the session purge, with no grace period: an expired key is already ignored.
const idempotencyPurgeJob = startExpiryJob({
  run: () => purgeExpiredSessions(idempotencyKeys, { graceMs: 0, batchSize: 1000, maxBatches: 20 }),
  intervalMs: SESSION_PURGE_INTERVAL_MS,
  onResult: (purged) => {
    if (purged > 0) app.log.info({ purged }, 'expired idempotency keys purged');
  },
  onError: (error) => app.log.error({ err: error }, 'idempotency key purge failed'),
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await expiryJob.stop();
  await sessionPurgeJob.stop();
  await idempotencyPurgeJob.stop();
  await app.close();
  await auth.drain();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  await database.close();
  process.exit(1);
}
