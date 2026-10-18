import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import type { FastifyError, FastifyRequest } from 'fastify';
import type { Env } from './config/env.js';
import { AppError } from './common/errors.js';
import { healthRoutes } from './modules/health/health.routes.js';
import type { HealthDeps } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';

export type AppDeps = HealthDeps & {
  /** Optional so that tests of unrelated parts do not need a database. */
  auth?: AuthService;
};

export interface AppOptions {
  /** Test hook: capture log output instead of writing to stdout. */
  logStream?: Writable;
}

const REQUEST_ID_PATTERN = /^[\w.-]{8,64}$/;

/** Fields that must never reach the logs. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.secret',
];

function loggerOptions(env: Env) {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    serializers: {
      // Log the path only: query strings can carry tokens (reset links, etc.).
      req: (request: FastifyRequest) => ({
        method: request.method,
        url: request.url.split('?', 1)[0] ?? '',
        remoteAddress: request.ip,
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
    bodyLimit: 1_048_576,
    // Accept a well-formed incoming id (for tracing across services); otherwise generate one.
    // Anything else is ignored so clients cannot inject arbitrary text into the logs.
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  });

  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header('x-request-id', request.id);
    return payload;
  });

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

    request.log.error({ err: error }, 'unhandled error');
    void reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  void app.register(healthRoutes(deps), { prefix: '/api/v1' });
  if (deps.auth !== undefined) {
    void app.register(authRoutes(deps.auth, env), { prefix: '/api/v1' });
  }

  return app;
}
