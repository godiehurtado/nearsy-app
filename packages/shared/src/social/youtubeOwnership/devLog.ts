/**
 * __DEV__-only YouTube ownership diagnostics.
 * Never logs verifier, challenge, tokens, or authorization/return URLs.
 */

export type YoutubeOwnershipFlowStage =
  | 's256'
  | 'start'
  | 'browser'
  | 'return'
  | 'exchange'
  | 'session'
  | 'select'
  | 'foundation'
  | 'unknown';

const BANNED_KEY = /verifier|token|authorization|bearer|challenge|secret|url/i;

function isSafeValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'boolean' || typeof value === 'number') return true;
  if (typeof value === 'string') {
    if (value.startsWith('https://') || value.startsWith('http://')) return false;
    if (value.startsWith('nearsy://')) return false;
    if (/^Bearer\s+/i.test(value)) return false;
    if (/^eyJ[A-Za-z0-9_-]{10,}\./.test(value)) return false;
    return value.length <= 120;
  }
  return false;
}

export function logYoutubeOwnershipDev(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (BANNED_KEY.test(key)) continue;
    if (!isSafeValue(value)) continue;
    safe[key] = value;
  }
  console.warn('[YoutubeOwnership]', event, safe);
}
