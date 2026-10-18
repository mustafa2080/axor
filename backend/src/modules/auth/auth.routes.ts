import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, tooManyRequests, unauthorized } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { parseInput } from '../../common/validation.js';
import type { Env } from '../../config/env.js';
import { createAuthenticate } from './authenticate.js';
import type { AuthContext, AuthService, AuthenticatedUser, SessionTokens } from './auth.service.js';

const loginBody = z.strictObject({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(256),
});

// Strict: role, tenantId, status... sent by a client are rejected, never ignored (mass assignment).
// The password's own rules (length, common, contains email) are enforced by the service policy.
const registerBody = z.strictObject({
  companyName: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .refine(
      (value) =>
        [...value].every((char) => {
          const code = char.codePointAt(0) ?? 0;
          return code > 31 && code !== 127;
        }),
      'Company name has invalid characters',
    ),
  email: z.string().trim().max(320).pipe(z.email()),
  password: z.string().min(1).max(256),
});

const COOKIE_PATH = '/api/v1/auth';

function publicUser({ principal, email }: AuthenticatedUser) {
  return {
    id: principal.userId,
    email,
    kind: principal.kind,
    role: principal.role,
    tenantId: principal.kind === 'tenant' ? principal.tenantId : null,
  };
}

/**
 * /auth/login, /auth/refresh, /auth/logout, /auth/me  (ADR-0004).
 * The refresh token only ever travels in an HttpOnly cookie and is never part of a response body.
 */
export function authRoutes(auth: AuthService, env: Env) {
  const secure = env.NODE_ENV === 'production';
  const cookieName = secure ? '__Secure-axor_rt' : 'axor_rt';
  const webOrigin = new URL(env.WEB_ORIGIN).origin;
  const authenticate = createAuthenticate(auth);

  const cookieOptions = { path: COOKIE_PATH, httpOnly: true, secure, sameSite: 'strict' } as const;

  /** CSRF defence on top of SameSite=Strict: browsers always send Origin on POST. */
  function requireTrustedOrigin(request: FastifyRequest): void {
    if (request.headers.origin !== webOrigin) throw forbidden('Untrusted origin');
  }

  function contextOf(request: FastifyRequest): AuthContext {
    const userAgent = request.headers['user-agent'];
    return {
      ip: request.ip,
      requestId: request.id,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      log: request.log,
    };
  }

  function sendSession(reply: FastifyReply, session: SessionTokens) {
    void reply.setCookie(cookieName, session.refreshToken, {
      ...cookieOptions,
      expires: session.refreshTokenExpiresAt,
    });
    return ok({
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
      user: publicUser(session.user),
    });
  }

  return async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
    await app.register(cookie);
    // Per-IP ceiling for every auth route; failed-login throttling lives in the service.
    await app.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) => tooManyRequests(Math.ceil(context.ttl / 1000)),
    });
    app.addHook('onSend', async (_request, reply, payload) => {
      void reply.header('cache-control', 'no-store');
      return payload;
    });

    app.post('/auth/register', async (request, reply) => {
      requireTrustedOrigin(request);
      const body = parseInput(registerBody, request.body);
      const session = await auth.register(body, contextOf(request));
      void reply.code(201);
      return sendSession(reply, session);
    });

    app.post('/auth/login', async (request, reply) => {
      requireTrustedOrigin(request);
      const body = parseInput(loginBody, request.body);
      return sendSession(reply, await auth.login(body.email, body.password, contextOf(request)));
    });

    app.post('/auth/refresh', async (request, reply) => {
      requireTrustedOrigin(request);
      const token = request.cookies[cookieName];
      if (token === undefined || token === '') throw unauthorized('Invalid or expired session');
      try {
        return sendSession(reply, await auth.refresh(token, contextOf(request)));
      } catch (error) {
        // A dead session must not leave a stale cookie behind.
        void reply.clearCookie(cookieName, cookieOptions);
        throw error;
      }
    });

    app.post('/auth/logout', async (request, reply) => {
      requireTrustedOrigin(request);
      const token = request.cookies[cookieName];
      if (token !== undefined && token !== '') await auth.logout(token, contextOf(request));
      void reply.clearCookie(cookieName, cookieOptions);
      return reply.code(204).send();
    });

    app.get('/auth/me', { preHandler: authenticate }, async (request) => {
      if (request.auth === undefined) throw unauthorized();
      return ok(publicUser(request.auth));
    });
  };
}
