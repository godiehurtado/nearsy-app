/**
 * Additive Exchange signal from Identity: whether this exchange created the
 * Firebase account, and that account's Auth creation time.
 *
 *   accountOutcome: "created" | "existing"
 *   authCreationTimeMs: Unix time in milliseconds
 *
 * Both fields travel together. Missing, partial or malformed → no signal: sign-in
 * works exactly as before and no signup is reported.
 *
 * The time ties the outcome to one account generation. A recreated LinkedIn
 * account keeps its UID, so the outcome only counts when this time matches the
 * creation time of the Firebase user actually signed in.
 *
 * Pure module: no imports, so analytics can use it without a cycle.
 */
export type LinkedInAccountOutcome = 'created' | 'existing';

export type LinkedInAccountSignal = {
  accountOutcome: LinkedInAccountOutcome;
  authCreationTimeMs: number;
};

export function readLinkedInAccountSignal(
  record: Readonly<Record<string, unknown>>,
): LinkedInAccountSignal | null {
  const accountOutcome = record.accountOutcome;
  const authCreationTimeMs = record.authCreationTimeMs;
  if (accountOutcome !== 'created' && accountOutcome !== 'existing') return null;
  if (
    typeof authCreationTimeMs !== 'number' ||
    !Number.isSafeInteger(authCreationTimeMs) ||
    authCreationTimeMs <= 0
  ) {
    return null;
  }
  return { accountOutcome, authCreationTimeMs };
}

/**
 * Compares at the precision Firebase actually exposes. `metadata.creationTime`
 * is an HTTP date (`toUTCString`), which drops milliseconds, so both values are
 * compared by whole second. A value that carries milliseconds is compared
 * exactly. There is no tolerance window: the next second is another generation.
 */
export function matchesFirebaseCreationTime(
  authCreationTimeMs: number,
  firebaseCreationTime: string | null | undefined,
): boolean {
  if (!firebaseCreationTime) return false;
  const firebaseMs = Date.parse(firebaseCreationTime);
  if (!Number.isFinite(firebaseMs)) return false;
  const hasMilliseconds = /\d{2}:\d{2}:\d{2}\.\d+/.test(firebaseCreationTime);
  const unit = hasMilliseconds ? 1 : 1000;
  return Math.floor(authCreationTimeMs / unit) === Math.floor(firebaseMs / unit);
}

export type LinkedInSignupDecision =
  | 'emit'
  | 'no_signal'
  | 'existing'
  | 'generation_mismatch';

export function decideLinkedInSignup(
  signal: LinkedInAccountSignal | null | undefined,
  firebaseCreationTime: string | null | undefined,
): LinkedInSignupDecision {
  if (!signal) return 'no_signal';
  if (signal.accountOutcome !== 'created') return 'existing';
  return matchesFirebaseCreationTime(signal.authCreationTimeMs, firebaseCreationTime)
    ? 'emit'
    : 'generation_mismatch';
}
