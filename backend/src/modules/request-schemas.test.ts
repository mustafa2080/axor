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
