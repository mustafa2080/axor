import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import type { FastifyError, FastifyRequest } from 'fastify';
import type { Env } from './config/env.js';
import { AppError } from './common/errors.js';
import { isDatabaseBusy } from './database/errors.js';
import { SECRET_PATHS, maskIp, serializeError } from './common/log-safe.js';
import { healthRoutes } from './modules/health/health.routes.js';
import type { HealthDeps } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import type { CatalogRepository } from './database/repositories/catalog.repository.js';
import type { CatalogAdminRepository } from './database/repositories/catalog-admin.repository.js';
import { catalogAdminRoutes } from './modules/admin/catalog-admin.routes.js';
import type { SubscriptionsRepository } from './database/repositories/subscriptions.repository.js';
import { subscriptionsAdminRoutes } from './modules/admin/subscriptions-admin.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';
import type { AuditAdminRepository } from './database/repositories/audit-admin.repository.js';
import { auditAdminRoutes } from './modules/admin/audit-admin.routes.js';
import type { MembersRepository } from './database/repositories/members.repository.js';
import { membersRoutes } from './modules/members/members.routes.js';
import type { TenantsAdminRepository } from './database/repositories/tenants-admin.repository.js';
import { tenantsAdminRoutes } from './modules/admin/tenants-admin.routes.js';

export type AppDeps = HealthDeps & {
  /** Optional so that tests of unrelated parts do not need a database. */
  auth?: AuthService;
  catalog?: CatalogRepository;
  /** Needs `auth` too: every admin route authenticates the caller first. */
  catalogAdmin?: CatalogAdminRepository;
  /** Trials and subscriptions, for companies and for platform staff. Needs `auth` too. */
  subscriptions?: SubscriptionsRepository;
  /** Read-only audit trail for platform staff. Needs `auth` too. */
  auditAdmin?: AuditAdminRepository;
  /** A company's own members (list, role, disable/enable). Needs `auth` too. */
  members?: MembersRepository;
  /** Companies for platform staff (list, suspend, reactivate). Needs `auth` too. */
  tenantsAdmin?: TenantsAdminRepository;
};

export interface AppOptions {
  /** Test hook: capture log output instead of writing to stdout. */
  logStream?: Writable;
}

const REQUEST_ID_PATTERN = /^[\w.-]{8,64}$/;

// Request limits (ADR-0015). Every body is a small JSON object, so 64 KiB is far above anything
// legitimate. The time limits cut off slow clients instead of letting them hold connections open.
export const MAX_BODY_BYTES = 65_536;
export const MAX_PARAM_LENGTH = 100;
export const REQUEST_TIMEOUT_MS = 30_000;
export const HEADERS_TIMEOUT_MS = 15_000;

/** Fields that must never reach the logs. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...SECRET_PATHS,
];

function loggerOptions(env: Env) {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    serializers: {
      // Errors from the database driver carry emails, hashes and bound values (see log-safe.ts).
      err: (error: Error) => serializeError(error),
      // Log the path only: query strings can carry tokens (reset links, etc.). The client IP is
      // masked here; the full address is kept in audit_logs for security events only.
      req: (request: FastifyRequest) => ({
        method: request.method,
        url: request.url.split('?', 1)[0] ?? '',
        remoteAddress: maskIp(request.ip),
      }),
    },
  };
}

export function buildApp(env: Env, deps: AppDeps, options: AppOptions = {}) {
  const logger =
    options.logStream !== undefined
      ? { ...loggerOptions(env), stream: options.logStream }
      : env.NODE_ENV === 'test'
        ? false
        : loggerOptions(env);

  const app = Fastify({
    logger,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: MAX_BODY_BYTES,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
    requestTimeout: REQUEST_TIMEOUT_MS,
    // Accept a well-formed incoming id (for tracing across services); otherwise generate one.
    // Anything else is ignored so clients cannot inject arbitrary text into the logs.
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  });

  // Slow headers are cut off sooner than slow bodies (requestTimeout above).
  app.server.headersTimeout = HEADERS_TIMEOUT_MS;

  // JSON is the only body format this API reads. Fastify also accepts text/plain by default,
  // which nothing needs; with it removed, any other content type answers 415.
  app.removeContentTypeParser('text/plain');

  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header('x-request-id', request.id);
    return payload;
  });

  // Time limit on auth plus the handler (ADR-0020). Node cannot cancel a running handler, so when
  // the limit passes the client gets a 504 and the work may still finish in the background: a
  // write can complete after its 504. That is why the answer says "unknown outcome" and carries no
  // Retry-After unless the method is safe to repeat. The timer is dropped as soon as any answer
  // starts to be sent, and unref'd so it never keeps the process alive.
  if (env.REQUEST_HANDLER_TIMEOUT_MS > 0) {
    const timers = new WeakMap<FastifyRequest, NodeJS.Timeout>();
    app.addHook('preHandler', (request, reply, done) => {
      const timer = setTimeout(() => {
        if (reply.sent) return;
        request.log.warn(
          { route: request.routeOptions.url, timeoutMs: env.REQUEST_HANDLER_TIMEOUT_MS },
          'request timed out',
        );
        const safeToRepeat = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
        if (safeToRepeat) void reply.header('retry-after', '5');
        void reply.code(504).send({
          error: {
            code: 'REQUEST_TIMEOUT',
            message: safeToRepeat
              ? 'The request took too long, please try again shortly'
              : 'The request took too long and its outcome is unknown, check the current state before repeating it',
          },
        });
      }, env.REQUEST_HANDLER_TIMEOUT_MS);
      timer.unref();
      timers.set(request, timer);
      done();
    });
    app.addHook('onSend', (request, _reply, payload, done) => {
      clearTimeout(timers.get(request));
      done(null, payload);
    });
  }

  // Browsers may call this API only from the one configured web origin, with credentials
  // (the refresh cookie). Exact match: no wildcard, no regex, never reflecting arbitrary origins.
  void app.register(cors, {
    origin: [new URL(env.WEB_ORIGIN).origin],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });

  // Security headers on every response, including errors and 404s. This is a JSON API: no
  // document it returns may load, embed or be embedded, so the CSP allows nothing at all.
  void app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    // HSTS only where HTTPS is guaranteed; never pin a local development host.
    strictTransportSecurity:
      env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  // Unified error shape. Never expose stack traces or internal details.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError && error.statusCode < 500) {
      const retryAfter = (error.details as { retryAfterSeconds?: unknown } | undefined)
        ?.retryAfterSeconds;
      if (error.statusCode === 429 && typeof retryAfter === 'number') {
        void reply.header('retry-after', String(retryAfter));
      }
      void reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && { details: error.details }),
        },
      });
      return;
    }

    // Framework-level client errors (invalid JSON, payload too large, unsupported media type...).
    const isClientError =
      !(error instanceof AppError) &&
      error.statusCode !== undefined &&
      error.statusCode >= 400 &&
      error.statusCode < 500;
    if (isClientError) {
      void reply.code(error.statusCode ?? 400).send({
        error: { code: 'BAD_REQUEST', message: error.message },
      });
      return;
    }

    // The database is saturated or a statement ran too long (ADR-0019): nothing was half-applied,
    // so tell the client to retry shortly instead of reporting an opaque 500.
    if (isDatabaseBusy(error)) {
      request.log.warn({ err: error }, 'database busy');
      void reply.header('retry-after', '5');
      void reply.code(503).send({
        error: { code: 'SERVICE_BUSY', message: 'The service is busy, please try again shortly' },
      });
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    void reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  void app.register(healthRoutes(deps), { prefix: '/api/v1' });
  if (deps.auth !== undefined) {
    void app.register(authRoutes(deps.auth, env), { prefix: '/api/v1' });
  }
  if (deps.auth !== undefined && deps.catalogAdmin !== undefined) {
    void app.register(catalogAdminRoutes(deps.auth, deps.catalogAdmin), { prefix: '/api/v1' });
  }
  if (deps.auth !== undefined && deps.subscriptions !== undefined) {
    void app.register(subscriptionsRoutes(deps.auth, deps.subscriptions), { prefix: '/api/v1' });
    void app.register(subscriptionsAdminRoutes(deps.auth, deps.subscriptions), {
      prefix: '/api/v1',
    });
  }
  if (deps.auth !== undefined && deps.auditAdmin !== undefined) {
    void app.register(auditAdminRoutes(deps.auth, deps.auditAdmin), { prefix: '/api/v1' });
  }
  if (deps.auth !== undefined && deps.members !== undefined) {
    void app.register(membersRoutes(deps.auth, deps.members), { prefix: '/api/v1' });
  }
  if (deps.auth !== undefined && deps.tenantsAdmin !== undefined) {
    void app.register(tenantsAdminRoutes(deps.auth, deps.tenantsAdmin), { prefix: '/api/v1' });
  }
  if (deps.catalog !== undefined) {
    void app.register(catalogRoutes(deps.catalog), { prefix: '/api/v1' });
  }

  return app;
}
