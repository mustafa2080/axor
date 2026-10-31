import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 hex of a refresh token. Only this digest is ever stored (the token is high-entropy, so no salt needed). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 32 random bytes (256 bits), URL-safe. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

// generateRefreshToken() always yields 32 bytes as base64url: exactly 43 characters. Anything else
// cannot be one of ours, so it is rejected before it is hashed or looked up.
const REFRESH_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedRefreshToken(token: string): boolean {
  return REFRESH_TOKEN_SHAPE.test(token);
}
