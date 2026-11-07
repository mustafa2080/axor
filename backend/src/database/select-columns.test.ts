import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A static guard for "select only the columns you need" (TASKS.md section 10, ADR-0019 s6).
// Drizzle's `.select()` with no argument reads EVERY column of the table. On tables that hold
// hashes or JSON (refresh_sessions.token_hash, audit_logs.metadata) that quietly widens what a
// query pulls into memory and, one mapper later, what a response can leak. The ADR-0019 review
// went through every existing full-row select and kept only the ones below on purpose.
//
// The list is exact, not a ceiling: adding a full-row select fails here, and so does removing
// one, so the list cannot drift away from the code. A new query should name its columns
// (`.select({ id: table.id, ... })`). If a full row really is right, raise the count below and
// say why in the reason, in the same commit.
// This is a regex over source text, so it only sees `.select()` / `.selectDistinct()` with an
// empty argument list; it does not prove the columns a named select picks are the right ones.

const srcDir = path.resolve(import.meta.dirname, '..');

function productionFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('test/'),
    );
}

// Comments are removed so prose like "no bare `.select()`" cannot trip or hide the rule.
function code(file: string): string {
  return readFileSync(path.join(srcDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const FULL_ROW_SELECT = /\.(?:select|selectDistinct)\(\s*\)/g;

// file -> [exact number of full-row selects, why they stay]. Reviewed in ADR-0019 s6.
const ALLOWED: Record<string, [count: number, reason: string]> = {
  'database/repositories/catalog-admin.repository.ts': [
    12,
    'products, plans and business_activities only add createdAt/updatedAt beyond what the DTO shows; plan_versions shows every column',
  ],
  'database/repositories/subscriptions.repository.ts': [
    1,
    'plan_versions row: every column except createdAt is used',
  ],
  'database/repositories/tenant-subscriptions.repository.ts': [
    2,
    'no route calls it yet (tests only); choose columns when the first route does',
  ],
  'database/repositories/tenant-audit-logs.repository.ts': [
    1,
    'no route calls it yet (tests only); choose columns (especially metadata) when the first route does',
  ],
};

describe('full-row select guard', () => {
  it('finds the production files and the known selects, so the checks below are not vacuous', () => {
    expect(productionFiles().length).toBeGreaterThanOrEqual(20);
    for (const file of Object.keys(ALLOWED)) {
      expect(productionFiles(), `${file} is in the allow-list but does not exist`).toContain(file);
    }
  });

  it('allows full-row selects only in the reviewed files, in the reviewed numbers', () => {
    const found = new Map<string, number>();
    for (const file of productionFiles()) {
      const count = [...code(file).matchAll(FULL_ROW_SELECT)].length;
      if (count > 0) found.set(file, count);
    }

    for (const [file, count] of found) {
      const allowed = ALLOWED[file];
      expect(
        allowed,
        `${file} has ${count} full-row .select() and is not on the reviewed list: name the columns`,
      ).toBeDefined();
      expect(
        count,
        `${file}: ${count} full-row selects, reviewed list says ${allowed?.[0]}. Name the columns of new ones`,
      ).toBe(allowed?.[0]);
    }
    for (const [file, [count]] of Object.entries(ALLOWED)) {
      expect(
        found.get(file) ?? 0,
        `${file}: the reviewed list says ${count} but the code has fewer; update ALLOWED`,
      ).toBe(count);
    }
  });

  it('never allows a full-row select on the tables that hold secrets', () => {
    // refresh_sessions (token hash) and users (password hash) must always name their columns.
    for (const file of productionFiles()) {
      const source = code(file);
      for (const match of source.matchAll(
        /\.(?:select|selectDistinct)\(\s*\)\s*\.from\(\s*(refreshSessions|users)\b/g,
      )) {
        expect.fail(`${file}: full-row select from ${match[1]} pulls its hash column`);
      }
    }
  });
});
