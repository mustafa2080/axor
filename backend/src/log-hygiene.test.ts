import { readFileSync, readdirSync } from 'node:fs';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { maskIp } from './common/log-safe.js';

// Log hygiene (TASKS.md section 9): no PII, token or password may reach the logs, including
// through the error objects that database drivers build.

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/axor_test',
  JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough-123456',
});
const deps = { checkDatabase: async () => {} };

const EMAIL = 'victim.person@example.com';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjMifQ', 'c2lnbmF0dXJlc2lnbmF0dXJl'].join('.');
const LEAKS = [EMAIL, HASH, JWT, 'Sup3rS3cretPw', 'QUERYTOKEN'];

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { stream, text: () => lines.join('') };
}

async function logsFor(thrown: () => unknown) {
  const logs = captureLogs();
  const app = buildApp(env, deps, { logStream: logs.stream });
  app.get('/boom', async () => {
    throw thrown();
  });
  const res = await app.inject({ method: 'GET', url: '/boom?token=QUERYTOKEN' });
  return { res, output: logs.text() };
}

function expectNoLeaks(output: string) {
  for (const leak of LEAKS) expect(output, `log must not contain ${leak.slice(0, 12)}…`).not.toContain(leak);
}

describe('log calls in the source (static guard)', () => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const sources = (readdirSync(root, { recursive: true }) as string[])
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => ({ file, text: readFileSync(`${root}${file}`, 'utf8') }));

  // Operator CLIs print to the terminal of the person who ran them; they are not server logs.
  const CLI_FILES = /^(scripts\/|database\/migrate-cli\.ts$)/;
  const FORBIDDEN_KEYS = /\b(email|password|passwordHash|newPassword|currentPassword|token|tokenHash|body|headers|cookie)\b/;

  it('finds the source files (the guard is not vacuous)', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some(({ file }) => file === 'app.ts')).toBe(true);
  });

  it('uses the logger, not console, outside operator CLIs', () => {
    const offenders = sources
      .filter(({ file }) => !CLI_FILES.test(file))
      .filter(({ text }) => /\bconsole\.(log|info|warn|error|debug|trace)\(/.test(text))
      .map(({ file }) => file);
    expect(offenders, 'use request.log / app.log (they redact and scrub)').toEqual([]);
  });

  it('masks any client IP that is put in a log call object', () => {
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      for (const match of text.matchAll(/\blog\.(?:trace|debug|info|warn|error|fatal)\(\s*\{([^}]*)\}/g)) {
        const body = match[1] ?? '';
        const keys = body.replace(/:[^,]*/g, '');
        const mentionsIp = /\b(ip|ipAddress|clientIp|remoteAddress)\b/.test(keys) || /\.ip\b/.test(body);
        if (mentionsIp && !body.includes('maskIp(')) offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(offenders, 'wrap the address in maskIp(); the full IP belongs in audit_logs only').toEqual([]);
  });

  it('never puts an email, password, token, body or headers in a log call object', () => {
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      for (const match of text.matchAll(/\blog\.(?:trace|debug|info|warn|error|fatal)\(\s*\{([^}]*)\}/g)) {
        const keys = (match[1] ?? '').replace(/:[^,]*/g, '');
        if (FORBIDDEN_KEYS.test(keys)) offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('client IP in ordinary logs', () => {
  it('masks IPv4 to the /24 and IPv6 to the /48', () => {
    expect(maskIp('41.33.12.7')).toBe('41.33.12.0');
    expect(maskIp('203.0.113.255')).toBe('203.0.113.0');
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7344')).toBe('2001:db8:85a3::');
    expect(maskIp('2001:db8::1')).toBe('2001:db8:0::');
    expect(maskIp('::1')).toBe('0:0:0::');
    expect(maskIp('fe80::1%eth0')).toBe('fe80:0:0::');
  });

  it('masks an IPv4 client seen through a dual-stack socket as IPv4', () => {
    expect(maskIp('::ffff:41.33.12.7')).toBe('41.33.12.0');
  });

  it('does not echo back text that is not an IP address', () => {
    for (const value of ['', 'not-an-ip', 'victim.person@example.com', '999.1.1.1', '1.2.3']) {
      expect(maskIp(value)).toBe('[invalid-ip]');
    }
  });

  it('writes the masked address, never the full one, in request logs', async () => {
    const verbose = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/axor_test',
      JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough-123456',
      LOG_LEVEL: 'info',
    });
    for (const [remote, full, masked] of [
      ['203.0.113.77', '203.0.113.77', '203.0.113.0'],
      ['::ffff:203.0.113.77', '203.0.113.77', '203.0.113.0'],
      ['2001:db8:85a3:8d3:1319:8a2e:370:7344', '1319:8a2e:370:7344', '2001:db8:85a3::'],
    ] as const) {
      const logs = captureLogs();
      const app = buildApp(verbose, deps, { logStream: logs.stream });
      app.get('/x', async () => ({ ok: true }));
      await app.inject({ method: 'GET', url: '/x', remoteAddress: remote });
      expect(logs.text(), `request log for ${remote}`).toContain(masked);
      expect(logs.text(), `request log for ${remote}`).not.toContain(full);
    }
  });
});

describe('error logs carry no PII, tokens or passwords', () => {
  it('drops the bound parameters of a failed query (Drizzle)', async () => {
    const { res, output } = await logsFor(
      () =>
        new DrizzleQueryError(
          'insert into `users` (`email`, `password_hash`) values (?, ?)',
          [EMAIL, HASH],
          new Error('connection lost'),
        ),
    );
    expect(res.statusCode).toBe(500);
    expectNoLeaks(output);
    // Still useful for debugging: what failed, without the values.
    expect(output).toContain('insert into');
    expect(output).toContain('connection lost');
  });

  it('scrubs values the database driver puts in the message (duplicate entry)', async () => {
    const { output } = await logsFor(() =>
      Object.assign(new Error(`Duplicate entry '${EMAIL}' for key 'users.email'`), {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sql: `insert into users values ('${EMAIL}', '${HASH}')`,
        params: [EMAIL, HASH],
      }),
    );
    expectNoLeaks(output);
    expect(output).toContain('ER_DUP_ENTRY');
  });

  it('scrubs the cause chain and tokens that appear in text', async () => {
    const { output } = await logsFor(() => {
      const root = new Error(`upstream said: Bearer ${JWT} for ${EMAIL}`);
      return new Error('wrapper', { cause: root });
    });
    expectNoLeaks(output);
    expect(output).toContain('wrapper');
  });

  it('redacts credential-named fields, however they are spelled', async () => {
    const logs = captureLogs();
    const app = buildApp(env, deps, { logStream: logs.stream });
    app.get('/x', async (request) => {
      request.log.info(
        {
          user: { passwordHash: HASH, newPassword: 'Sup3rS3cretPw', accessToken: JWT },
          headers: { authorization: `Bearer ${JWT}`, cookie: 'sid=abc' },
        },
        'event',
      );
      return { ok: true };
    });
    await app.inject({ method: 'GET', url: '/x' });
    expectNoLeaks(logs.text());
  });
});
