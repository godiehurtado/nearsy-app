/**
 * PostHog distinct_id per account generation (proposal G). Functions contract
 * docs/analytics/ANALYTICS_DISTINCT_ID_CONTRACT.md at 37af793, shared with iOS
 * and the server: same rule, same seed, same vectors.
 *
 * Pure module: the SHA-256 is injected (expo-crypto in the app, node:crypto in
 * tests), so nothing here imports React Native.
 */

export const GENERATION_ID_PREFIX = 'nag1_';
const GENERATION_ID_SEED = 'nearsy-analytics-distinct-id:v1:';
const LINKEDIN_UID_PREFIX = 'li_';
const SINCE_MS_TEXT = /^[1-9][0-9]{0,15}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Lowercase hex SHA-256 of the UTF-8 bytes of `text`. */
export type Sha256Hex = (text: string) => Promise<string>;

/**
 * The cutover setting, parsed the same way in every producer: trimmed text of
 * 1 to 16 digits without a leading zero, and a safe integer. Anything else is
 * null, which means every account keeps its UID exactly as before G.
 */
export function parseGenerationIdSinceMs(raw: unknown): number | null {
  let text: string;
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) return null;
    text = String(raw);
  } else if (typeof raw === 'string') {
    text = raw.trim();
  } else {
    return null;
  }
  if (!SINCE_MS_TEXT.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Firebase Auth `user.metadata.creationTime` in milliseconds. Never the device
 * clock or any other source. Null when it is missing or cannot be read.
 */
export function readAuthCreationTimeMs(creationTime: unknown): number | null {
  if (typeof creationTime === 'number') {
    return Number.isFinite(creationTime) && creationTime > 0 ? creationTime : null;
  }
  if (typeof creationTime !== 'string' || !creationTime.trim()) return null;
  const ms = Date.parse(creationTime);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function usesGenerationId(
  uid: string,
  authCreationTimeMs: number | null,
  sinceMs: number | null,
): authCreationTimeMs is number {
  return (
    sinceMs !== null &&
    uid.startsWith(LINKEDIN_UID_PREFIX) &&
    authCreationTimeMs !== null &&
    Number.isFinite(authCreationTimeMs) &&
    authCreationTimeMs > 0 &&
    authCreationTimeMs >= sinceMs
  );
}

/** The contract function (§1). */
export async function analyticsDistinctId(
  uid: string,
  authCreationTimeMs: number | null,
  sinceMs: number | null,
  sha256Hex: Sha256Hex,
): Promise<string> {
  if (!usesGenerationId(uid, authCreationTimeMs, sinceMs)) return uid;
  const seconds = Math.floor(authCreationTimeMs / 1000);
  const digest = String(await sha256Hex(`${GENERATION_ID_SEED}${uid}:${seconds}`)).toLowerCase();
  if (!SHA256_HEX.test(digest)) throw new Error('analytics distinct id: invalid digest');
  return `${GENERATION_ID_PREFIX}${digest.slice(0, 32)}`;
}

/**
 * The id a device identifies with, or null when it must not identify (§3): a
 * LinkedIn account while a cutover is set, whose Auth creation time cannot be
 * read or hashed. Such an account is never sent under its UID.
 */
export async function resolveAccountDistinctId(input: {
  uid: string;
  creationTime: unknown;
  sinceMs: number | null;
  sha256Hex: Sha256Hex;
}): Promise<string | null> {
  const { uid, sinceMs } = input;
  if (sinceMs === null || !uid.startsWith(LINKEDIN_UID_PREFIX)) return uid;
  const ms = readAuthCreationTimeMs(input.creationTime);
  if (ms === null) return null;
  try {
    return await analyticsDistinctId(uid, ms, sinceMs, input.sha256Hex);
  } catch {
    return null;
  }
}
