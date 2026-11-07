import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getTableColumns, is, type Table } from 'drizzle-orm';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../database/schema/index.js';

// A static guard for "passwords are never stored as plain text or with reversible encryption".
// The only password hasher is Argon2id in password.ts. These checks fail the moment production code
// adds another hasher, a cipher, a weak digest, a second place that hashes passwords, or a column
// that looks like it holds a password in the clear. The stored values themselves are checked on a
// real MariaDB in password-storage.integration.test.ts.

const srcDir = path.resolve(import.meta.dirname, '../..');

function productionFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('test/'),
    );
}

// Comments are removed so that prose like "never uses createCipheriv" cannot trip or hide a rule.
function code(file: string): string {
  return readFileSync(path.join(srcDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const HASHER_FILE = 'modules/auth/password.ts';
// The only places allowed to call hashPassword: the auth service (register, change password) and
// the one-off CLI that creates the first platform owner.
const HASH_CALLERS = new Set([HASHER_FILE, 'modules/auth/auth.service.ts', 'scripts/create-platform-user.ts']);
// createHash is only for fixed-purpose digests of high-entropy values, never for passwords.
// idempotency.ts fingerprints a request (method, route, params, body) with sha256 (ADR-0026).
const DIGEST_FILES = new Set([
  'database/migration-policy.ts',
  'modules/auth/refresh-token.ts',
  'modules/idempotency/idempotency.ts',
]);

describe('password storage guard', () => {
  it('finds the production files, so the checks below are not vacuous', () => {
    expect(productionFiles().length).toBeGreaterThanOrEqual(20);
    expect(productionFiles()).toContain(HASHER_FILE);
  });

  it('keeps every password hashing library import inside password.ts', () => {
    let imports = 0;
    for (const file of productionFiles()) {
      const found = code(file).match(/from\s+['"](@node-rs\/argon2|argon2|bcrypt|bcryptjs|scrypt-js|pbkdf2|md5|sha1)['"]/g);
      if (found) {
        imports += found.length;
        expect(file, `${file} imports a password hashing library`).toBe(HASHER_FILE);
      }
    }
    expect(imports).toBe(1);
  });

  it('never uses a cipher, so no password can be stored reversibly', () => {
    for (const file of productionFiles()) {
      expect(code(file), `${file} uses reversible encryption`).not.toMatch(
        /\b(createCipher|createDecipher|createCipheriv|createDecipheriv|publicEncrypt|privateDecrypt|privateEncrypt|publicDecrypt)\b|subtle\s*\.\s*(encrypt|decrypt)\b/,
      );
    }
  });

  it('uses createHash only in the known files, and only with sha256 or stronger', () => {
    let calls = 0;
    for (const file of productionFiles()) {
      for (const match of code(file).matchAll(/\bcreateHash\(\s*([^)]*)\)/g)) {
        calls += 1;
        expect(DIGEST_FILES.has(file), `${file} calls createHash`).toBe(true);
        expect(match[1], `${file}: createHash needs a literal sha256/sha384/sha512`).toMatch(
          /^['"]sha(256|384|512)['"]$/,
        );
      }
    }
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('calls hashPassword only from the auth service and the platform-user script', () => {
    let calls = 0;
    for (const file of productionFiles()) {
      if (/\bhashPassword\(/.test(code(file).replace(/export\s+async\s+function\s+hashPassword\(/, ''))) {
        calls += 1;
        expect(HASH_CALLERS.has(file), `${file} hashes a password`).toBe(true);
      }
    }
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('has no column anywhere that could hold a clear-text password', () => {
    const tables = Object.values(schema).filter((value) => is(value, MySqlTable)) as unknown as Table[];
    expect(tables.length).toBeGreaterThanOrEqual(10);
    const passwordish: string[] = [];
    for (const table of tables) {
      for (const column of Object.values(getTableColumns(table))) {
        if (/pass|pwd|secret|credential/i.test(column.name)) passwordish.push(column.name);
      }
    }
    // password_hash holds the Argon2id string; password_changed_at is a timestamp.
    expect(passwordish.sort()).toEqual(['password_changed_at', 'password_hash']);
  });
});
