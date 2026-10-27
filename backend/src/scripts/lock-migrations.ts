import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultMigrationsFolder } from '../database/migrate.js';
import {
  CHECKSUMS_FILE,
  readChecksums,
  readMigrationFiles,
} from '../database/migration-policy.js';

// Records the checksum of every NEW migration. It refuses to touch one that was already
// recorded and has changed: migrations are immutable (ADR-0009), so add a new one instead.

const locked = readChecksums(defaultMigrationsFolder);
const next: Record<string, string> = { ...locked };
const edited: string[] = [];
const added: string[] = [];

for (const file of readMigrationFiles(defaultMigrationsFolder)) {
  const existing = locked[file.tag];
  if (existing === undefined) {
    next[file.tag] = file.checksum;
    added.push(file.tag);
  } else if (existing !== file.checksum) {
    edited.push(file.tag);
  }
}

if (edited.length > 0) {
  console.error(`Refusing to lock: already recorded migration(s) were edited: ${edited.join(', ')}`);
  console.error('Revert the edit and add a new migration instead (ADR-0009).');
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  path.join(defaultMigrationsFolder, CHECKSUMS_FILE),
  `${JSON.stringify(sorted, null, 2)}\n`,
  'utf8',
);
console.log(added.length > 0 ? `Recorded: ${added.join(', ')}` : 'Nothing new to record.');
