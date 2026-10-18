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
