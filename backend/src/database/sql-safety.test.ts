import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A static guard against SQL injection. Production code talks to MariaDB through Drizzle's query
// builder, which binds every value as a parameter. The ways to bypass that are few and greppable:
// sql.raw / sql.identifier, a hand-built string passed to the driver, a second driver import, and
// multipleStatements. This test fails the moment one of them shows up outside the known places.
// Note: a plain sql`...${value}...` template is fine, Drizzle binds each ${value} as a parameter.
// The behaviour itself is covered by sql-injection.integration.test.ts on a real MariaDB.

const srcDir = path.resolve(import.meta.dirname, '..');

function productionFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('test/'),
    );
}

// Comments are removed so that prose like "no `sql` with inlined values" cannot trip or hide a rule.
function code(file: string): string {
  return readFileSync(path.join(srcDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// The only file allowed to import the raw mysql2 driver.
const DRIVER_FILE = 'database/client.ts';

describe('SQL injection guard', () => {
  it('finds the production files, so the checks below are not vacuous', () => {
    expect(productionFiles().length).toBeGreaterThanOrEqual(20);
    expect(productionFiles()).toContain(DRIVER_FILE);
  });

  it('never builds SQL text with sql.raw or sql.identifier in production code', () => {
    for (const file of productionFiles()) {
      expect(code(file), `${file} uses sql.raw or sql.identifier`).not.toMatch(
        /\bsql\.(raw|identifier)\(/,
      );
    }
  });

  it('passes the driver only a fixed single-quoted string, and execute only a sql template', () => {
    let calls = 0;
    for (const file of productionFiles()) {
      for (const match of code(file).matchAll(/\.(query|execute)\(\s*([\s\S]{0,4})/g)) {
        calls += 1;
        const [, method, start = ''] = match;
        if (method === 'query') {
          expect(start.startsWith("'"), `${file}: .query( needs a fixed 'string' literal`).toBe(true);
        } else {
          expect(start.startsWith('sql`'), `${file}: .execute( needs a sql template`).toBe(true);
        }
      }
    }
    // The readiness ping is the one raw call today; zero would mean the scan stopped seeing calls.
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('imports the raw mysql2 driver only in the database client', () => {
    for (const file of productionFiles().filter((f) => f !== DRIVER_FILE)) {
      expect(code(file), `${file} imports mysql2 directly`).not.toMatch(
        /from\s+['"]mysql2|require\(\s*['"]mysql2/,
      );
    }
    expect(code(DRIVER_FILE)).toMatch(/from 'mysql2\/promise'/);
  });

  it('never enables several statements per query', () => {
    for (const file of productionFiles()) {
      expect(code(file), `${file} mentions multipleStatements`).not.toMatch(/multipleStatements/);
    }
  });
});
