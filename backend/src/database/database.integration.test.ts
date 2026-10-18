import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../config/env.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';

// Integration tests: run against the dedicated test database (see src/test/setup.ts).
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);

afterAll(async () => {
  await database.close();
});

describe('database integration (axor_test)', () => {
  it('targets the test database, never development data', () => {
    expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  });

  it('applies migrations and is safe to run twice', async () => {
    await runMigrations(env.DATABASE_URL);
    await expect(runMigrations(env.DATABASE_URL)).resolves.toBeUndefined();
  });

  it('GET /api/v1/health/ready returns ready against the real database', async () => {
    const app = buildApp(env, { checkDatabase: () => database.ping() });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });
});
