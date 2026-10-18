import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors.js';
import type { AuthService, AuthenticatedUser } from './auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `authenticate` hook. Built from the database, never from the request body. */
    auth?: AuthenticatedUser;
  }
}

/**
 * preHandler for protected endpoints: `{ preHandler: authenticate }`.
 * Reads `Authorization: Bearer <access token>` and loads the current user from the database.
 */
export function createAuthenticate(auth: AuthService) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([\w.~-]+)$/.exec(header) : null;
    const token = match?.[1];
    if (token === undefined) throw unauthorized();
    request.auth = await auth.authenticate(token);
  };
}
