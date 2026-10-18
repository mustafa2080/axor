import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './database/client.js';

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const app = buildApp(env, { checkDatabase: () => database.ping() });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
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
