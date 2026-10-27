import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Migration policy (ADR-0009): migrations are forward-only and immutable once committed.
// This module only inspects files; it never connects to a database.

export interface JournalEntry {
  idx: number;
  tag: string;
}

export interface MigrationFile {
  tag: string;
  sql: string;
  checksum: string;
}

export interface PolicyProblem {
  tag: string;
  problem: string;
}

export const CHECKSUMS_FILE = 'checksums.json';

/** A migration must contain this line (with a reason) to be allowed to destroy or reshape data. */
export const DESTRUCTIVE_MARKER = /^--[ \t]*destructive-approved:[ \t]*\S.*$/im;

// Statements that can lose data or break the previous app version during a rolling deploy.
const DESTRUCTIVE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'DROP',
    pattern: /\bDROP\s+(TABLE|COLUMN|INDEX|KEY|FOREIGN|PRIMARY|CONSTRAINT|DATABASE|SCHEMA|VIEW)\b/i,
  },
  { label: 'TRUNCATE', pattern: /\bTRUNCATE\b/i },
  { label: 'DELETE FROM', pattern: /\bDELETE\s+FROM\b/i },
  { label: 'RENAME', pattern: /\bRENAME\b/i },
  { label: 'MODIFY COLUMN', pattern: /\bMODIFY\b/i },
  { label: 'CHANGE COLUMN', pattern: /\bCHANGE\s+(COLUMN\s+)?`?\w/i },
];

/** Windows checkouts use CRLF and CI uses LF; hash the same bytes everywhere. */
export function normalizeSql(sql: string): string {
  return sql.replace(/\r\n/g, '\n');
}

export function checksumOf(sql: string): string {
  return createHash('sha256').update(normalizeSql(sql), 'utf8').digest('hex');
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

/** Labels of destructive statements found in the SQL (comments are ignored). */
export function findDestructiveStatements(sql: string): string[] {
  const code = stripComments(sql);
  return DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(
    ({ label }) => label,
  );
}

export function hasDestructiveApproval(sql: string): boolean {
  return DESTRUCTIVE_MARKER.test(normalizeSql(sql));
}

export function readJournal(migrationsFolder: string): JournalEntry[] {
  const raw = readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8');
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] };
  return parsed.entries.map(({ idx, tag }) => ({ idx, tag }));
}

export function readMigrationFiles(migrationsFolder: string): MigrationFile[] {
  return readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(migrationsFolder, name), 'utf8');
      return { tag: name.replace(/\.sql$/, ''), sql, checksum: checksumOf(sql) };
    });
}

export function readChecksums(migrationsFolder: string): Record<string, string> {
  try {
    return JSON.parse(
      readFileSync(path.join(migrationsFolder, CHECKSUMS_FILE), 'utf8'),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Checks every rule of the policy and returns the problems found (empty = compliant). */
export function checkMigrationPolicy(migrationsFolder: string): PolicyProblem[] {
  const problems: PolicyProblem[] = [];
  const journal = readJournal(migrationsFolder);
  const files = readMigrationFiles(migrationsFolder);
  const locked = readChecksums(migrationsFolder);
  const fileByTag = new Map(files.map((file) => [file.tag, file]));

  journal.forEach((entry, position) => {
    if (entry.idx !== position) {
      problems.push({
        tag: entry.tag,
        problem: `journal idx ${entry.idx} is not sequential (expected ${position})`,
      });
    }
    if (!entry.tag.startsWith(`${String(position).padStart(4, '0')}_`)) {
      problems.push({
        tag: entry.tag,
        problem: 'file name number does not match its position in the journal',
      });
    }
    if (!fileByTag.has(entry.tag)) {
      problems.push({ tag: entry.tag, problem: 'listed in the journal but the .sql file is missing' });
    }
  });

  const journalTags = new Set(journal.map((entry) => entry.tag));
  for (const file of files) {
    if (!journalTags.has(file.tag)) {
      problems.push({ tag: file.tag, problem: 'a .sql file exists that the journal does not list' });
    }
    const lockedChecksum = locked[file.tag];
    if (lockedChecksum === undefined) {
      problems.push({
        tag: file.tag,
        problem: 'no checksum recorded; run `pnpm db:lock` after generating a migration',
      });
    } else if (lockedChecksum !== file.checksum) {
      problems.push({
        tag: file.tag,
        problem: 'a recorded migration was edited; migrations are immutable, add a new one instead',
      });
    }
    const destructive = findDestructiveStatements(file.sql);
    if (destructive.length > 0 && !hasDestructiveApproval(file.sql)) {
      problems.push({
        tag: file.tag,
        problem: `destructive statement(s) ${destructive.join(', ')} without a "-- destructive-approved: <reason>" line`,
      });
    }
  }

  for (const tag of Object.keys(locked)) {
    if (!fileByTag.has(tag)) {
      problems.push({ tag, problem: 'checksum recorded for a migration file that no longer exists' });
    }
  }

  return problems;
}
