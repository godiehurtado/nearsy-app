/**
 * LinkedIn signup decision. Exchange may say `accountOutcome` ("created" or
 * "existing") with `authCreationTimeMs`. A creation is believed only when that
 * time is the creation of the user Firebase just signed in, compared at the
 * precision both sides really have. Nothing is inferred from timing, profile
 * state or a local marker.
 */
export type LinkedInAccountDecision =
  | { kind: 'created'; uid: string; createdAt: number; precisionMs: number }
  | { kind: 'existing'; uid: string }
  | { kind: 'unknown' };

type Signal = { accountOutcome: 'created' | 'existing'; authCreationTimeMs: number };

/**
 * Firebase Auth creation time and how precise it is. RNFirebase returns an ISO
 * string with milliseconds; other forms may carry whole seconds only.
 */
export function readAuthCreationTime(
  value: unknown,
): { ms: number; precisionMs: number } | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? { ms: value, precisionMs: 1 } : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return { ms, precisionMs: /\d{2}:\d{2}:\d{2}\.\d+/.test(value) ? 1 : 1000 };
}

/** A whole-second value can come from a source that only keeps seconds. */
function precisionOf(ms: number): number {
  return ms % 1000 === 0 ? 1000 : 1;
}

export function decideLinkedInAccount(input: {
  /** The UID the LinkedIn session authenticated. */
  uid: string;
  signal: Signal | undefined;
  /** The Firebase user now signed in; must be the same account. */
  currentUser: { uid: string; creationTime: unknown } | null;
}): LinkedInAccountDecision {
  const { signal, currentUser } = input;
  if (!signal || !currentUser || currentUser.uid !== input.uid) return { kind: 'unknown' };
  if (signal.accountOutcome === 'existing') return { kind: 'existing', uid: input.uid };
  const created = readAuthCreationTime(currentUser.creationTime);
  if (!created) return { kind: 'unknown' };
  const precisionMs = Math.max(created.precisionMs, precisionOf(signal.authCreationTimeMs));
  const same =
    Math.floor(created.ms / precisionMs) === Math.floor(signal.authCreationTimeMs / precisionMs);
  return same
    ? {
        kind: 'created',
        uid: input.uid,
        createdAt: Math.floor(created.ms / precisionMs) * precisionMs,
        precisionMs,
      }
    : { kind: 'unknown' };
}
