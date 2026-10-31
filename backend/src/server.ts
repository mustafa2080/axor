import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './database/client.js';
import { createAuditAdminRepository } from './database/repositories/audit-admin.repository.js';
import { createCatalogAdminRepository } from './database/repositories/catalog-admin.repository.js';
import { createCatalogRepository } from './database/repositories/catalog.repository.js';
import { createMembersRepository } from './database/repositories/members.repository.js';
import { createSubscriptionsRepository } from './database/repositories/subscriptions.repository.js';
import { createTenantsAdminRepository } from './database/repositories/tenants-admin.repository.js';
import { createAccessTokenService } from './modules/auth/access-token.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { startExpiryJob } from './modules/subscriptions/expiry-job.js';

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const accessTokens = createAccessTokenService({
  secret: env.JWT_ACCESS_SECRET,
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
const app = buildApp(env, {
  checkDatabase: () => database.ping(),
  auth,
  catalog,
  catalogAdmin,
  subscriptions,
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

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await expiryJob.stop();
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
