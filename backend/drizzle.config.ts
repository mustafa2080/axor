import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from backend/. Load the root .env like the other scripts do.
if (existsSync('../.env')) {
  process.loadEnvFile('../.env');
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dbCredentials: {
    // `generate` never connects, but an empty URL makes drizzle-kit crash natively on Windows,
    // so fall back to a placeholder. Commands that do connect need the real DATABASE_URL.
    url: process.env['DATABASE_URL'] ?? 'mysql://placeholder:placeholder@127.0.0.1:3306/placeholder',
  },
});
