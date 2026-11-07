import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { unauthorized } from '../../common/errors.js';

export interface AccessTokenConfig {
  /** HMAC secret, at least 32 characters. Comes from the environment, never from code. */
  secret: string;
  /**
   * Previous secret, accepted for VERIFICATION only while a rotation is in progress (ADR-0017).
   * Tokens are always signed with `secret`. Remove it once the old tokens have expired.
   */
  previousSecret?: string | undefined;
  /** Lifetime of an access token in seconds (60..3600). Short on purpose: refresh handles continuity. */
  ttlSeconds: number;
  issuer: string;
  audience: string;
  /** Test hook. */
  clock?: () => Date;
}

export interface VerifiedAccessToken {
  userId: string;
  tokenId: string;
  issuedAt: Date;
  expiresAt: Date;
}

const MIN_SECRET_LENGTH = 32;
const TOKEN_TYPE = 'at+jwt';
const ALGORITHM = 'HS256';

/** Tries each key in order and rethrows the LAST failure; callers map every failure to one 401. */
async function verifyWithAnyKey(
  token: string,
  keys: readonly Uint8Array[],
  options: Parameters<typeof jwtVerify>[2],
) {
  let lastError: unknown = new Error('no verification key');
  for (const candidate of keys) {
    try {
      return await jwtVerify(token, candidate, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Short-lived access tokens. The token only identifies the user (`sub`); it carries NO role,
 * tenant or permission claims. The Principal is rebuilt from the database on every request
 * (ADR-0003 §5), so a disabled user or changed role takes effect immediately.
 */
export function createAccessTokenService(config: AccessTokenConfig) {
  if (config.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Access token secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (!Number.isInteger(config.ttlSeconds) || config.ttlSeconds < 60 || config.ttlSeconds > 3600) {
    throw new Error('Access token ttlSeconds must be an integer between 60 and 3600');
  }

  const key = new TextEncoder().encode(config.secret);
  const previous = config.previousSecret;
  if (previous !== undefined) {
    if (previous.length < MIN_SECRET_LENGTH) {
      throw new Error(`Previous access token secret must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    if (previous === config.secret) {
      throw new Error('Previous access token secret must differ from the current one');
    }
  }
  // Current key first; the previous key only verifies, it never signs.
  const verificationKeys =
    previous === undefined ? [key] : [key, new TextEncoder().encode(previous)];
  const now = config.clock ?? (() => new Date());

  return {
    async sign(userId: string): Promise<{ token: string; expiresAt: Date }> {
      const issuedAt = Math.floor(now().getTime() / 1000);
      const expiresAtSeconds = issuedAt + config.ttlSeconds;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: ALGORITHM, typ: TOKEN_TYPE })
        .setSubject(userId)
        .setJti(randomUUID())
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAtSeconds)
        .sign(key);
      return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
    },

    /** Throws a generic 401 for ANY problem, so callers cannot learn why a token was rejected. */
    async verify(token: string): Promise<VerifiedAccessToken> {
      try {
        const { payload } = await verifyWithAnyKey(token, verificationKeys, {
          algorithms: [ALGORITHM],
          typ: TOKEN_TYPE,
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ['sub', 'jti', 'iat', 'exp'],
          clockTolerance: 5,
          currentDate: now(),
        });
        if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
          throw new Error('invalid claims');
        }
        return {
          userId: payload.sub,
          tokenId: payload.jti,
          issuedAt: new Date((payload.iat ?? 0) * 1000),
          expiresAt: new Date((payload.exp ?? 0) * 1000),
        };
      } catch {
        throw unauthorized('Invalid or expired token');
      }
    },
  };
}

export type AccessTokenService = ReturnType<typeof createAccessTokenService>;
