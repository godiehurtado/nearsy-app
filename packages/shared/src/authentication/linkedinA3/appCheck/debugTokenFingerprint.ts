/**
 * SHA-256 truncated fingerprint for App Check debug token comparison (I1-J).
 * Never logs or returns the raw token. RN-safe (no node:crypto).
 */

export type DebugTokenFingerprint = {
  algorithm: 'sha256';
  /** First 12 hex chars of SHA-256 digest. */
  fingerprint12: string;
  length: number;
  source: 'runtime_extra' | 'runtime_process' | 'eas_env' | 'unknown';
};

async function sha256Hex(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const data = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function fingerprintDebugToken(
  token: string,
  source: DebugTokenFingerprint['source'],
): Promise<DebugTokenFingerprint | null> {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return null;
  const hex = await sha256Hex(trimmed);
  if (!hex) return null;
  return {
    algorithm: 'sha256',
    fingerprint12: hex.slice(0, 12),
    length: trimmed.length,
    source,
  };
}
