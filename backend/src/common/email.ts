/**
 * Key used by the trial-abuse guard (ADR-0003 #3): trim + lowercase + drop a "+tag" from the local part.
 *
 * Known limits, accepted in the ADR: it does not collapse Gmail dots or aliases, and someone with
 * several real addresses can still get several trials. Stronger checks are a product decision.
 */
export function normalizeEmailKey(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    throw new Error('Invalid email address');
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf('+');
  const base = plus > 0 ? local.slice(0, plus) : local;
  return `${base}@${domain}`;
}
