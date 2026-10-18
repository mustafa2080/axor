export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound so a huge "password" cannot be used to burn CPU/memory in the hasher. */
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordIssue = 'too_short' | 'too_long' | 'too_common' | 'contains_email';

// Small built-in blocklist of the most abused passwords (all >= 12 chars so length alone would pass them).
// A breached-password check (HIBP k-anonymity) can be added later without changing callers.
const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  '123456789012',
  '1234567890123',
  'qwertyuiop12',
  'qwerty123456',
  'iloveyou1234',
  'administrator',
  'letmein123456',
  'welcome12345',
  '111111111111',
  'aaaaaaaaaaaa',
  'axorplatform',
  'axor12345678',
]);

/**
 * Checks a new password against the policy. Returns every violated rule (empty array = OK).
 * Length counts Unicode code points after NFKC normalization, matching what is actually hashed.
 */
export function checkPasswordPolicy(password: string, context: { email: string }): PasswordIssue[] {
  const normalized = password.normalize('NFKC');
  const length = [...normalized].length;
  const issues: PasswordIssue[] = [];

  if (length < PASSWORD_MIN_LENGTH) issues.push('too_short');
  if (length > PASSWORD_MAX_LENGTH) issues.push('too_long');

  const lower = normalized.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) issues.push('too_common');

  const emailLower = context.email.trim().toLowerCase();
  const localPart = emailLower.split('@', 1)[0] ?? '';
  if (
    emailLower !== '' &&
    (lower.includes(emailLower) || (localPart.length >= 4 && lower.includes(localPart)))
  ) {
    issues.push('contains_email');
  }

  return issues;
}
