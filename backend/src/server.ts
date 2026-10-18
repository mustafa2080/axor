import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './database/client.js';
import { createAccessTokenService } from './modules/auth/access-token.js';
import { createAuthService } from './modules/auth/auth.service.js';

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
const app = buildApp(env, { checkDatabase: () => database.ping(), auth });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
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
