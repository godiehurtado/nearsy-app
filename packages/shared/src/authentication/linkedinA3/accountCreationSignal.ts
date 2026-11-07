/**
 * Prepared seam for an explicit "this exchange created the account" signal from
 * Identity. The field name is not a contract yet: it stays null until it is
 * coordinated with Identity, so today every LinkedIn sign-in reads as unknown and
 * no signup_completed is emitted. A missing or malformed field is always unknown.
 *
 * Firebase metadata cannot replace the signal: a recreated LinkedIn account keeps
 * its UID, and timestamps alone cannot separate first sign-in from a later one.
 */
export type LinkedInAccountCreationSignal = 'created' | 'existing' | 'unknown';

export const LINKEDIN_ACCOUNT_CREATION_FIELD: string | null = null;

export function readLinkedInAccountCreationSignal(
  record: Readonly<Record<string, unknown>>,
  field: string | null = LINKEDIN_ACCOUNT_CREATION_FIELD,
): LinkedInAccountCreationSignal {
  if (!field) return 'unknown';
  const value = record[field];
  if (value === true) return 'created';
  if (value === false) return 'existing';
  return 'unknown';
}
