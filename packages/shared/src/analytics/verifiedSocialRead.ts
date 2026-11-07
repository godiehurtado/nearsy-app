import type { AnalyticsSocialPlatform } from './contract';
import type { VerifiedSocialState } from './profileProperties';

type GetResult = PromiseSettledResult<{ result?: unknown }>;

/**
 * A platform whose backend is switched off cannot hold a verified link, so its
 * "not enabled" refusal reads as not connected. Any other failure is unknown.
 */
function isNotEnabledRefusal(reason: unknown): boolean {
  const code = (reason as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /_NOT_ENABLED$/.test(code);
}

/**
 * Combines the per-platform Get reads. One disabled platform no longer hides the
 * others. A real failure (network, server, App Check) still makes the whole
 * state unknown, so a connection already reported is never erased by an error.
 */
export function combineVerifiedSocialReads(
  reads: Partial<Record<AnalyticsSocialPlatform, GetResult>>,
): VerifiedSocialState {
  const state: Partial<Record<AnalyticsSocialPlatform, boolean>> = {};
  for (const [platform, read] of Object.entries(reads) as [AnalyticsSocialPlatform, GetResult][]) {
    if (read.status === 'fulfilled') {
      state[platform] = read.value?.result === 'verified';
    } else if (isNotEnabledRefusal(read.reason)) {
      state[platform] = false;
    } else {
      return null;
    }
  }
  return state;
}
