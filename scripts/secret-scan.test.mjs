// Tests for scripts/secret-scan.mjs. Run: node --test scripts/
// Fake secrets are assembled at runtime so this file never contains a complete one (the scanner
// reads this file too).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_MARKER, isForbiddenPath, scanLine } from './secret-scan.mjs';

const rules = (line, options) => scanLine(line, options).map((finding) => finding.rule);
const rand = (n) => 'aB3dE5gH7jK9mN1pQ2sT4vW6yZ8'.repeat(3).slice(0, n);

test('catches strong secret formats', () => {
  assert.deepEqual(rules(`const k = '${'AKIA' + 'ABCDEFGHIJKLMNOP'}';`), ['aws-access-key']);
  assert.deepEqual(rules(`token ${'ghp' + '_' + rand(36)}`), ['github-token']);
  assert.deepEqual(rules(`-----BEGIN ${'RSA '}PRIVATE KEY-----`), ['private-key']);
  assert.deepEqual(rules(`${'xox' + 'b'}-${rand(20)}`), ['slack-token']);
  const jwt = ['eyJ' + rand(12), 'eyJ' + rand(12), rand(12)].join('.');
  assert.deepEqual(rules(`Authorization: Bearer ${jwt}`), ['jwt']);
});

test('catches a quoted secret assignment and an unquoted .env line', () => {
  assert.deepEqual(rules(`const JWT_ACCESS_SECRET = '${rand(32)}';`), ['secret-assignment']);
  assert.deepEqual(rules(`JWT_ACCESS_SECRET=${rand(32)}`), ['dotenv-secret']);
});

test('catches a password inside a connection URL', () => {
  assert.deepEqual(rules(`DATABASE_URL=mysql://app:${rand(12)}@127.0.0.1:3306/db`), ['password-in-url']);
});

test('ignores placeholders and code that only mentions a secret', () => {
  assert.deepEqual(rules('JWT_ACCESS_SECRET=CHANGE_ME_to_a_long_random_string'), []);
  assert.deepEqual(rules('DATABASE_URL=mysql://axor_app:CHANGE_ME@127.0.0.1:3306/axor_dev'), []);
  assert.deepEqual(rules('const secret = process.env.JWT_ACCESS_SECRET;'), []);
  assert.deepEqual(rules('const passwordHash = await hashPassword(input.password);'), []);
  assert.deepEqual(rules('token: string;'), []);
});

test('the allow marker silences a deliberately fake line', () => {
  assert.deepEqual(rules(`const JWT_ACCESS_SECRET = '${rand(32)}'; // ${ALLOW_MARKER}: fake`), []);
});

test('test files skip the weak rules but keep the strong ones', () => {
  const weak = `const JWT_ACCESS_SECRET = '${rand(32)}';`;
  assert.deepEqual(rules(weak, { testFile: true }), []);
  assert.deepEqual(rules(`'${'AKIA' + 'ABCDEFGHIJKLMNOP'}'`, { testFile: true }), ['aws-access-key']);
});

test('forbidden paths: real env files, keys and dumps, but not .env.example', () => {
  for (const file of ['.env', 'backend/.env', '.env.production', 'certs/server.pem', 'deploy/id_rsa', 'x/db.sql.gz', 'axor_dev.sql']) {
    assert.equal(isForbiddenPath(file), true, file);
  }
  for (const file of ['.env.example', 'backend/.env.example', 'backend/src/migrations/0000_init.sql', 'README.md']) {
    assert.equal(isForbiddenPath(file), false, file);
  }
});
