import { loadEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

const env = loadEnv();
await runMigrations(env.DATABASE_URL);
console.log('Migrations applied.');
