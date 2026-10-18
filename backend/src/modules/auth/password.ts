import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with Argon2id (OWASP Password Storage Cheat Sheet minimum:
 * m = 19 MiB, t = 2, p = 1). Parameters live inside every hash string, so they can be raised
 * later without breaking existing hashes.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

/** NFKC so the same visible password always hashes the same (important for Arabic keyboards/IMEs). */
function prepare(password: string): string {
  return password.normalize('NFKC');
}

export async function hashPassword(password: string): Promise<string> {
  return hash(prepare(password), ARGON2_OPTIONS);
}

// Verified against when the account does not exist (or has no password yet), so a login for an
// unknown email costs the same time as a wrong password and cannot be used to enumerate accounts.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('axor-dummy-password-for-timing-equalization');
  return dummyHash;
}

/**
 * Returns true only when `password` matches `storedHash`. Never throws for a missing/invalid hash:
 * it returns false (after doing equivalent work for a missing hash).
 */
export async function verifyPassword(
  storedHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (storedHash === null || storedHash === undefined || storedHash === '') {
    await verify(await getDummyHash(), prepare(password));
    return false;
  }
  try {
    return await verify(storedHash, prepare(password));
  } catch {
    // Malformed stored hash: treat as a failed login, never as a server error that leaks detail.
    return false;
  }
}
