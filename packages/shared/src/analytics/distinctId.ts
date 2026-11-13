/**
 * PostHog distinct_id per LinkedIn account generation (Functions contract
 * docs/analytics/ANALYTICS_DISTINCT_ID_CONTRACT.md, proposal G).
 *
 * A LinkedIn UID (`li_…`) is reused when a deleted account is created again, and
 * PostHog deletes by distinct_id. A LinkedIn account created at or after the
 * cutover therefore gets an id of its own, derived from the UID and its Auth
 * creation time (whole seconds). Every other account keeps its UID.
 *
 * Pure and synchronous, so identity changes keep their order in the client.
 * Pure module: no React Native or Expo imports.
 */

/**
 * The cutover is a setting, not a constant: iOS reads the build-time env
 * EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS (Android NEARSY_POSTHOG_…,
 * Functions POSTHOG_…). Unset or invalid means null: every account keeps its
 * UID, exactly as before. The Owner sets it with validation and deploy of all
 * producers; it is never set in eas.json until then.
 */
export const GENERATION_ID_SINCE_ENV = 'EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS';

export type GenerationIdSince = { sinceMs: number | null; invalid: boolean };

/** Shared parse rule: trim; /^[1-9][0-9]{0,15}$/ and a safe integer; else null. */
export function parseGenerationIdSinceMs(raw: unknown): GenerationIdSince {
  if (raw === undefined || raw === null) return { sinceMs: null, invalid: false };
  if (typeof raw !== 'string') return { sinceMs: null, invalid: true };
  const value = raw.trim();
  if (!value) return { sinceMs: null, invalid: false };
  if (!/^[1-9][0-9]{0,15}$/.test(value)) return { sinceMs: null, invalid: true };
  const ms = Number(value);
  if (!Number.isSafeInteger(ms)) return { sinceMs: null, invalid: true };
  return { sinceMs: ms, invalid: false };
}

export const GENERATION_ID_PREFIX = 'nag1_';
const SEED_PREFIX = 'nearsy-analytics-distinct-id:v1:';
const LINKEDIN_UID_PREFIX = 'li_';

/**
 * Firebase Auth `user.metadata.creationTime` only (RFC/ISO string, or epoch ms)
 * → ms, or null. Never a local clock or an inferred value.
 */
export function parseAuthCreationTimeMs(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Contract function, verbatim. The server's rule: unknown time → UID. */
export function analyticsDistinctId(
  uid: string,
  authCreationTimeMs: number | null | undefined,
  sinceMs: number | null,
): string {
  if (sinceMs === null) return uid;
  if (!uid.startsWith(LINKEDIN_UID_PREFIX)) return uid;
  const ms = authCreationTimeMs;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return uid;
  if (ms < sinceMs) return uid;
  const seconds = Math.floor(ms / 1000);
  return GENERATION_ID_PREFIX + sha256Hex(`${SEED_PREFIX}${uid}:${seconds}`).slice(0, 32);
}

/**
 * Device rule: while the cutover is set, an `li_` account whose creation time
 * cannot be read is not identified at all (null), never under its UID.
 */
export function deviceAnalyticsDistinctId(
  uid: string,
  rawCreationTime: unknown,
  sinceMs: number | null,
): string | null {
  const ms = parseAuthCreationTimeMs(rawCreationTime);
  if (sinceMs !== null && uid.startsWith(LINKEDIN_UID_PREFIX) && ms === null) return null;
  return analyticsDistinctId(uid, ms, sinceMs);
}

// ---- SHA-256 (FIPS 180-4) over UTF-8, hex output ----

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(input: string): number[] {
  const bytes: number[] = [];
  for (const char of input) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000)
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return bytes;
}

export function sha256Hex(input: string): string {
  const bytes = utf8(input);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  for (const word of [high, bitLength >>> 0]) {
    bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
  }
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}
