import path from 'node:path';
import { existsSync } from 'node:fs';

// Tests must NEVER touch development data: always target the dedicated test database.
const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

process.env['NODE_ENV'] = 'test';
// Tests never use the developer's real secret.
process.env['JWT_ACCESS_SECRET'] = 'test-only-access-secret-not-used-anywhere-else-0123456789';

const url = process.env['DATABASE_URL'];
if (url !== undefined && url !== '') {
  const parsed = new URL(url);
  parsed.pathname = '/axor_test';
  process.env['DATABASE_URL'] = parsed.toString();
}
