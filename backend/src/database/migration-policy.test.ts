import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultMigrationsFolder } from './migrate.js';
import {
  CHECKSUMS_FILE,
  checkMigrationPolicy,
  checksumOf,
  findDestructiveStatements,
  hasDestructiveApproval,
} from './migration-policy.js';

const folders: string[] = [];

/** Builds a throwaway migrations folder: journal + .sql files + (optionally) recorded checksums. */
function makeFolder(
  migrations: Record<string, string>,
  options: { lock?: boolean } = {},
): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'axor-migrations-'));
  folders.push(folder);
  mkdirSync(path.join(folder, 'meta'));
  const tags = Object.keys(migrations);
  writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    JSON.stringify({ entries: tags.map((tag, idx) => ({ idx, tag })) }),
  );
  const checksums: Record<string, string> = {};
  for (const [tag, sql] of Object.entries(migrations)) {
    writeFileSync(path.join(folder, `${tag}.sql`), sql);
    checksums[tag] = checksumOf(sql);
  }
  if (options.lock !== false) {
    writeFileSync(path.join(folder, CHECKSUMS_FILE), JSON.stringify(checksums));
  }
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('the real migrations folder', () => {
  it('follows the migration policy (ADR-0009)', () => {
    expect(checkMigrationPolicy(defaultMigrationsFolder)).toEqual([]);
  });
});

describe('destructive statement detection', () => {
  it.each([
    ['DROP TABLE `users`;', 'DROP'],
    ['ALTER TABLE `users` DROP COLUMN `name`;', 'DROP'],
    ['TRUNCATE TABLE `audit_logs`;', 'TRUNCATE'],
    ['DELETE FROM `plans` WHERE 1 = 1;', 'DELETE FROM'],
    ['ALTER TABLE `a` RENAME TO `b`;', 'RENAME'],
    ['ALTER TABLE `a` MODIFY `x` varchar(10);', 'MODIFY COLUMN'],
    ['ALTER TABLE `a` CHANGE `x` `y` int;', 'CHANGE COLUMN'],
  ])('flags %s', (sql, label) => {
    expect(findDestructiveStatements(sql)).toContain(label);
  });

  it('does not flag additive changes or ON DELETE rules', () => {
    expect(findDestructiveStatements('ALTER TABLE `users` ADD `x` datetime(3);')).toEqual([]);
    expect(
      findDestructiveStatements(
        'CREATE TABLE `a` (`id` int, FOREIGN KEY (`id`) REFERENCES `b`(`id`) ON DELETE CASCADE);',
      ),
    ).toEqual([]);
  });

  it('ignores destructive words that only appear in comments', () => {
    expect(findDestructiveStatements('-- never DROP TABLE here\nSELECT 1;')).toEqual([]);
    expect(findDestructiveStatements('/* TRUNCATE */ SELECT 1;')).toEqual([]);
  });

  it('only accepts an approval line that carries a reason', () => {
    expect(hasDestructiveApproval('-- destructive-approved: column unused since ADR-0007\nDROP TABLE a;')).toBe(true);
    expect(hasDestructiveApproval('-- destructive-approved:\nDROP TABLE a;')).toBe(false);
    expect(hasDestructiveApproval('DROP TABLE a;')).toBe(false);
  });
});

describe('policy violations are reported', () => {
  it('accepts a clean, locked set of migrations', () => {
    const folder = makeFolder({ '0000_a': 'SELECT 1;', '0001_b': 'ALTER TABLE `t` ADD `c` int;' });
    expect(checkMigrationPolicy(folder)).toEqual([]);
  });

  it('rejects editing a recorded migration', () => {
    const folder = makeFolder({ '0000_a': 'SELECT 1;' });
    writeFileSync(path.join(folder, '0000_a.sql'), 'SELECT 2;');
    expect(checkMigrationPolicy(folder).map((p) => p.problem)).toEqual([
      expect.stringContaining('was edited'),
    ]);
  });

  it('is not fooled by Windows line endings', () => {
    const folder = makeFolder({ '0000_a': 'SELECT 1;\nSELECT 2;\n' });
    writeFileSync(path.join(folder, '0000_a.sql'), 'SELECT 1;\r\nSELECT 2;\r\n');
    expect(checkMigrationPolicy(folder)).toEqual([]);
  });

  it('rejects a new migration that was never recorded', () => {
    const folder = makeFolder({ '0000_a': 'SELECT 1;' }, { lock: false });
    expect(checkMigrationPolicy(folder).map((p) => p.problem)).toEqual([
      expect.stringContaining('pnpm db:lock'),
    ]);
  });

  it('rejects a destructive migration without approval, and allows it with one', () => {
    const bad = makeFolder({ '0000_a': 'DROP TABLE `users`;' });
    expect(checkMigrationPolicy(bad).map((p) => p.problem)).toEqual([
      expect.stringContaining('destructive'),
    ]);
    const approved = makeFolder({
      '0000_a': '-- destructive-approved: table replaced by users_v2 in 0000\nDROP TABLE `users`;',
    });
    expect(checkMigrationPolicy(approved)).toEqual([]);
  });

  it('rejects journal gaps, missing files and unlisted files', () => {
    const folder = makeFolder({ '0000_a': 'SELECT 1;', '0001_b': 'SELECT 1;' });
    writeFileSync(
      path.join(folder, 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ idx: 0, tag: '0000_a' }, { idx: 2, tag: '0001_b' }, { idx: 3, tag: '0003_c' }] }),
    );
    writeFileSync(path.join(folder, '0009_stray.sql'), 'SELECT 1;');
    const problems = checkMigrationPolicy(folder).map((p) => `${p.tag}: ${p.problem}`);
    expect(problems.join('\n')).toContain('not sequential');
    expect(problems.join('\n')).toContain('.sql file is missing');
    expect(problems.join('\n')).toContain('journal does not list');
  });
});
