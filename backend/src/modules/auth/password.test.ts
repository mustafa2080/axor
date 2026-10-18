import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from './password-policy.js';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing (Argon2id)', () => {
  it('produces an Argon2id hash that never contains the password', async () => {
    const password = 'correct horse battery staple';
    const hashed = await hashPassword(password);
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(hashed).not.toContain('correct');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hashed = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hashed, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hashed, 'correct horse battery stapl3')).resolves.toBe(false);
    await expect(verifyPassword(hashed, '')).resolves.toBe(false);
  });

  it('uses a fresh salt every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password-123'), hashPassword('same-password-123')]);
    expect(a).not.toBe(b);
  });

  it('treats canonically equivalent Unicode as the same password (NFKC)', async () => {
    const composed = 'caf\u00e9-password-1';
    const decomposed = 'cafe\u0301-password-1';
    const hashed = await hashPassword(composed);
    await expect(verifyPassword(hashed, decomposed)).resolves.toBe(true);
  });

  it('returns false (no throw) for a missing, empty or malformed stored hash', async () => {
    await expect(verifyPassword(null, 'whatever-password')).resolves.toBe(false);
    await expect(verifyPassword(undefined, 'whatever-password')).resolves.toBe(false);
    await expect(verifyPassword('', 'whatever-password')).resolves.toBe(false);
    await expect(verifyPassword('not-a-real-hash', 'whatever-password')).resolves.toBe(false);
  });
});

describe('password policy', () => {
  const ctx = { email: 'mustafa@example.com' };

  it('accepts a long, unrelated password (including Arabic characters)', () => {
    expect(checkPasswordPolicy('blue-Tractor-47-sunrise', ctx)).toEqual([]);
    expect(checkPasswordPolicy('كلمة-سر-طويلة-وقوية-٤٧', ctx)).toEqual([]);
  });

  it('rejects short passwords', () => {
    expect(checkPasswordPolicy('Short1!', ctx)).toContain('too_short');
  });

  it('rejects absurdly long passwords (hasher DoS guard)', () => {
    expect(checkPasswordPolicy('a1'.repeat(70), ctx)).toContain('too_long');
  });

  it('rejects common passwords regardless of case', () => {
    expect(checkPasswordPolicy('PassWord1234', ctx)).toContain('too_common');
  });

  it('rejects passwords containing the email or its local part', () => {
    expect(checkPasswordPolicy('mustafa@example.com-1', ctx)).toContain('contains_email');
    expect(checkPasswordPolicy('MUSTAFA-is-great-2026', ctx)).toContain('contains_email');
  });

  it('reports every violated rule at once', () => {
    expect(checkPasswordPolicy('mustafa', ctx).sort()).toEqual(['contains_email', 'too_short']);
  });
});
