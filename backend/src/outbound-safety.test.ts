import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A static guard against SSRF and against file uploads sneaking in (ADR-0015).
//
// SSRF needs a place where the server makes a request to an address a user influences. Today the
// backend has no such place: no HTTP client, no webhook, no URL taken from a request. The only
// `new URL(...)` calls parse configuration (WEB_ORIGIN). This test fails the moment an outbound
// client, a raw socket or a request-derived URL shows up, so the feature that adds one has to
// bring its own protection (allowlist, no redirects, private-range blocking) and update ADR-0015.
// Likewise there is no upload endpoint, so no multipart parser may be added without a design.

const srcDir = path.resolve(import.meta.dirname);
const packageJson = JSON.parse(
  readFileSync(path.resolve(srcDir, '..', 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

function productionFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('test/'),
    );
}

// Comments are removed so that prose like "never call fetch(" cannot trip or hide a rule.
// The one allowed import is the pure IP-address parsing helpers of node:net (used by maskIp): they
// open no socket. Any other use of node:net is still caught.
function code(file: string): string {
  return readFileSync(path.join(srcDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(
      /import\s*\{\s*(?:isIPv4|isIPv6|isIP)(?:\s*,\s*(?:isIPv4|isIPv6|isIP))*\s*\}\s*from\s*'node:net'/g,
      '',
    );
}

const OUTBOUND_MODULES =
  'https?|http2|net|tls|dns|dgram|child_process|axios|got|node-fetch|cross-fetch|undici|superagent|request|needle|ky|ws|ofetch';
const UPLOAD_MODULES = ['@fastify/multipart', 'fastify-multer', 'multer', 'busboy', 'formidable'];

describe('SSRF guard', () => {
  it('finds the production files, so the checks below are not vacuous', () => {
    expect(productionFiles().length).toBeGreaterThanOrEqual(20);
    expect(productionFiles()).toContain('app.ts');
  });

  it('never imports an HTTP client, raw socket, DNS or process-spawning module', () => {
    const importPattern = new RegExp(
      `(from\\s+|require\\(\\s*|import\\(\\s*)['"](node:)?(${OUTBOUND_MODULES})(/[^'"]*)?['"]`,
    );
    for (const file of productionFiles()) {
      expect(code(file), `${file} imports an outbound-capable module`).not.toMatch(importPattern);
    }
  });

  it('never calls fetch, opens a WebSocket or an XMLHttpRequest', () => {
    for (const file of productionFiles()) {
      expect(code(file), `${file} makes an outbound request`).not.toMatch(
        /(?<![.\w])fetch\s*\(|\bglobalThis\.fetch\b|\bnew\s+(WebSocket|XMLHttpRequest|EventSource)\b/,
      );
    }
  });

  it('parses a URL only from configuration, never from a request', () => {
    let calls = 0;
    for (const file of productionFiles()) {
      for (const match of code(file).matchAll(/new\s+URL\(\s*([^,)]*)/g)) {
        calls += 1;
        expect(match[1]?.trim().startsWith('env.'), `${file}: new URL(${match[1]}`).toBe(true);
      }
    }
    // WEB_ORIGIN is parsed in app.ts and auth.routes.ts; zero would mean the scan stopped seeing it.
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('has no HTTP client among its dependencies', () => {
    const names = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    for (const name of ['axios', 'got', 'node-fetch', 'cross-fetch', 'undici', 'superagent', 'ky']) {
      expect(names, `${name} is a dependency`).not.toContain(name);
    }
  });
});

describe('upload guard', () => {
  it('has no multipart or file-upload parser among its dependencies', () => {
    const names = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    for (const name of UPLOAD_MODULES) expect(names, `${name} is a dependency`).not.toContain(name);
  });

  it('never imports a multipart or file-upload parser', () => {
    const pattern = new RegExp(`['"](${UPLOAD_MODULES.join('|')})['"]`);
    for (const file of productionFiles()) {
      expect(code(file), `${file} imports an upload parser`).not.toMatch(pattern);
    }
  });
});
