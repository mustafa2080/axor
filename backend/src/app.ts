import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import Fastify from 'fastify';
import type { FastifyError, FastifyRequest } from 'fastify';
import type { Env } from './config/env.js';
import { AppError } from './common/errors.js';
import { healthRoutes } from './modules/health/health.routes.js';
import type { HealthDeps } from './modules/health/health.routes.js';

export type AppDeps = HealthDeps;

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

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  // Unified error shape. Never expose stack traces or internal details.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError && error.statusCode < 500) {
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

  return app;
}
