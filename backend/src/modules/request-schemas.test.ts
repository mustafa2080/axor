import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A static guard against mass assignment: every route that reads a body must parse it with a strict
// schema, and no route file may use a schema that silently drops or lets through unknown fields.
// The behaviour itself is covered by the integration tests (client-tampering, profile, members...);
// this test fails the moment someone adds a route and forgets the schema.

const modulesDir = path.resolve(import.meta.dirname);

function routeFiles(): string[] {
  return readdirSync(modulesDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.routes.ts'))
    .map((file) => path.join(modulesDir, file));
}

interface Route {
  method: string;
  path: string;
  source: string;
}

function routesOf(file: string): Route[] {
  const text = readFileSync(file, 'utf8');
  const starts = [...text.matchAll(/app\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)];
  return starts.map((match, index) => ({
    method: match[1] ?? '',
    path: match[2] ?? '',
    source: text.slice(match.index, starts[index + 1]?.index ?? text.length),
  }));
}

// Routes that take no body at all: the action is fully described by the path and the signed-in user.
// A new write route with no body schema must be added here on purpose, with a reason.
const BODYLESS_WRITES = new Set([
  'post /auth/refresh', // the refresh token comes from the cookie
  'post /auth/logout', // the session comes from the cookie
  'post /members/:id/disable', // the target is the id in the path
  'post /members/:id/enable',
  'post /admin/subscriptions/:id/cancel',
  'post /subscriptions/:productCode/cancel',
]);

describe('request schemas', () => {
  it('finds the route files, so the checks below are not vacuous', () => {
    expect(routeFiles().length).toBeGreaterThanOrEqual(7);
    expect(routeFiles().flatMap(routesOf).length).toBeGreaterThanOrEqual(30);
  });

  it('uses only strict schemas in routes: unknown fields are rejected, never ignored', () => {
    for (const file of routeFiles()) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${path.basename(file)} uses z.object`).not.toMatch(/\bz\.object\(/);
      expect(text, `${path.basename(file)} uses a loose schema`).not.toMatch(
        /\.passthrough\(|\.loose\(|\.catchall\(|z\.looseObject\(/,
      );
    }
  });

  it('parses the body of every write route, unless it is a known body-less action', () => {
    const missing: string[] = [];
    for (const file of routeFiles()) {
      for (const route of routesOf(file)) {
        if (route.method === 'get' || route.method === 'delete') continue;
        const key = `${route.method} ${route.path}`;
        const parsesBody = /parseInput\(\s*\w+\s*,\s*request\.body/.test(route.source);
        if (!parsesBody && !BODYLESS_WRITES.has(key)) missing.push(`${key} (${path.basename(file)})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the body-less list honest: every entry is a real route that really reads no body', () => {
    const routes = new Map(routeFiles().flatMap(routesOf).map((route) => [`${route.method} ${route.path}`, route]));
    for (const key of BODYLESS_WRITES) {
      const route = routes.get(key);
      expect(route, `${key} is no longer a route`).toBeDefined();
      expect(route?.source, `${key} reads a body, so it does not belong in the list`).not.toMatch(
        /parseInput\(\s*\w+\s*,\s*request\.body/,
      );
    }
  });
});

// A static guard against unbounded reads (TASKS.md: limits on paging, no huge queries). Every GET
// route must either page with a capped `limit` and `offset`, or be listed here with the reason its
// result cannot grow without the platform deciding it. The client never chooses a sort order.
const BOUNDED_BY_DESIGN = new Set([
  'get /auth/me', // one row: the caller
  'get /health', // no data
  'get /health/ready', // no data
  'get /catalog/products', // the public catalog the platform itself manages
  'get /catalog/products/:productCode/plans', // plans of one product, managed by the platform
  'get /subscriptions', // unique (company, product): at most one row per product
]);

// Known gaps, on purpose in a separate list: the test fails when one is fixed, so it gets removed.
// Empty now: `GET /admin/catalog` was the last one and is paged (limit/offset, no N+1).
const KNOWN_UNBOUNDED = new Set<string>();

const MAX_PAGE = 100;
const MAX_OFFSET = 100_000;

function getRoutes() {
  return routeFiles().flatMap((file) =>
    routesOf(file)
      .filter((route) => route.method === 'get')
      .map((route) => ({ ...route, file, key: `get ${route.path}` })),
  );
}

const pagesWithListQuery = (source: string) => /parseInput\(\s*listQuery\s*,\s*request\.query/.test(source);

describe('list endpoints are bounded', () => {
  it('pages every other GET route with a capped limit and offset', () => {
    const unexplained: string[] = [];
    for (const route of getRoutes()) {
      if (BOUNDED_BY_DESIGN.has(route.key) || KNOWN_UNBOUNDED.has(route.key)) continue;
      if (!pagesWithListQuery(route.source)) unexplained.push(`${route.key} (${path.basename(route.file)})`);
    }
    expect(unexplained).toEqual([]);
  });

  it('caps limit at 100 and offset at 100000 in every file that pages', () => {
    for (const file of routeFiles()) {
      const text = readFileSync(file, 'utf8');
      if (!routesOf(file).some((route) => pagesWithListQuery(route.source))) continue;
      const limit = /limit:\s*z\.coerce\.number\(\)[^\n]*\.max\(([\d_]+)\)/.exec(text);
      const offset = /offset:\s*z\.coerce\.number\(\)[^\n]*\.max\(([\d_]+)\)/.exec(text);
      const num = (match: RegExpExecArray | null) => Number((match?.[1] ?? 'Infinity').replaceAll('_', ''));
      expect(num(limit), `${path.basename(file)}: limit needs a .max(<=${MAX_PAGE})`).toBeLessThanOrEqual(MAX_PAGE);
      expect(num(offset), `${path.basename(file)}: offset needs a .max(<=${MAX_OFFSET})`).toBeLessThanOrEqual(
        MAX_OFFSET,
      );
    }
  });

  it('keeps both lists honest: real GET routes that really do not page', () => {
    const routes = new Map(getRoutes().map((route) => [route.key, route]));
    for (const key of [...BOUNDED_BY_DESIGN, ...KNOWN_UNBOUNDED]) {
      const route = routes.get(key);
      expect(route, `${key} is no longer a GET route`).toBeDefined();
      expect(pagesWithListQuery(route?.source ?? ''), `${key} pages now, so it does not belong in a list`).toBe(false);
    }
  });

  it('lets the client choose no sort order', () => {
    for (const file of routeFiles()) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${path.basename(file)} accepts a sort parameter`).not.toMatch(/\b(sort|orderBy|order_by)\s*:\s*z\./);
    }
  });
});

// A static guard for input bounds (TASKS.md section 9, "validate every input with schemas"). Body,
// params and query go through parseInput and nothing else, and no schema may accept an unbounded
// string, number, array or record: a client must not be able to send a megabyte where a name goes.
describe('input bounds', () => {
  const sources = () => routeFiles().map((file) => ({ name: path.basename(file), text: readFileSync(file, 'utf8') }));

  it('reads request.body, request.params and request.query only through parseInput', () => {
    const offenders: string[] = [];
    for (const { name, text } of sources()) {
      // `request.body ?? {}` is still parsed: it only lets an optional body be absent.
      const rest = text.replace(/parseInput\(\s*\w+\s*,\s*request\.(?:body(?:\s*\?\?\s*\{\})?|params|query)\s*\)/g, '');
      for (const match of rest.matchAll(/request\.(?:body|params|query)\b/g)) {
        offenders.push(`${name}: ${rest.slice(match.index, (match.index ?? 0) + 40).replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders, 'validate it with a schema: parseInput(schema, request.x)').toEqual([]);
  });

  it('bounds every string: a max length, a fixed length, or a regex with no open-ended quantifier', () => {
    const offenders: string[] = [];
    for (const { name, text } of sources()) {
      for (const match of text.matchAll(/\bz\s*\.string\(\)((?:\s*\.\w+\((?:[^()]|\([^()]*\))*\))*)/g)) {
        const chain = match[1] ?? '';
        const pattern = /\.regex\(\s*\/((?:[^/\\]|\\.)*)\//.exec(chain)?.[1];
        const bounded =
          /\.(?:max|length)\(/.test(chain) || (pattern !== undefined && !/[+*]|\{\d+,\}/.test(pattern));
        if (!bounded) offenders.push(`${name}: ${match[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }
    expect(offenders, 'add .max(n) (or an anchored, bounded .regex)').toEqual([]);
  });

  it('bounds every number with .max()', () => {
    const offenders: string[] = [];
    for (const { name, text } of sources()) {
      for (const match of text.matchAll(/\bz\s*\.(?:coerce\s*\.)?number\(\)((?:\s*\.\w+\([^()]*\))*)/g)) {
        if (!/\.max\(/.test(match[1] ?? '')) offenders.push(`${name}: ${match[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('caps the size of every array and record', () => {
    const offenders: string[] = [];
    for (const { name, text } of sources()) {
      for (const match of text.matchAll(/\bz\s*\.array\(/g)) {
        if (!/\.max\(/.test(text.slice(match.index, (match.index ?? 0) + 300))) offenders.push(`${name}: z.array without .max()`);
      }
      for (const match of text.matchAll(/\bz\s*\.record\(/g)) {
        const after = text.slice(match.index, (match.index ?? 0) + 300);
        if (!/Object\.keys\([^)]*\)\.length\s*<=/.test(after)) offenders.push(`${name}: z.record without a key-count cap`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('shape-checks the refresh cookie before using it', () => {
    for (const { name, text } of sources()) {
      if (!/request\.cookies\b/.test(text)) continue;
      expect(text, `${name} reads a cookie`).toMatch(/isWellFormedRefreshToken\(/);
      expect(text.match(/request\.cookies\[/g)?.length, name).toBe(text.match(/isWellFormedRefreshToken\(token\)/g)?.length);
    }
  });
});
