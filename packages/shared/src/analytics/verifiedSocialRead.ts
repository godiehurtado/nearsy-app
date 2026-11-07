import type { AnalyticsSocialPlatform } from './contract';
import type { StringStore } from './lifecycle';
import type { VerifiedSocialState } from './profileProperties';

type GetResult = PromiseSettledResult<{ result?: unknown }>;
type KnownVerified = Partial<Record<AnalyticsSocialPlatform, boolean>>;

const PLATFORMS: readonly AnalyticsSocialPlatform[] = ['youtube', 'tiktok', 'instagram', 'x'];

/**
 * Combines the per-platform Get reads into what each one proved.
 *
 * Only a successful Get is evidence. Any refusal, including `*_NOT_ENABLED`, leaves
 * that platform unknown: "not enabled" means the feature is off for this account
 * (core off, or restricted and not on the allowlist), not that no link exists.
 * One platform's failure never hides the others. Null when nothing was proved.
 */
export function combineVerifiedSocialReads(
  reads: Partial<Record<AnalyticsSocialPlatform, GetResult>>,
): VerifiedSocialState {
  const state: KnownVerified = {};
  for (const [platform, read] of Object.entries(reads) as [AnalyticsSocialPlatform, GetResult][]) {
    if (read?.status === 'fulfilled') state[platform] = read.value?.result === 'verified';
  }
  return Object.keys(state).length > 0 ? state : null;
}

const KEY_PREFIX = 'nearsy.analytics.verified.v1:';
const MODES = ['personal', 'professional'] as const;
const keyFor = (uid: string, mode: string) => `${KEY_PREFIX}${uid}:${mode}`;

function parseKnown(raw: string | null): KnownVerified {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const known: KnownVerified = {};
    for (const platform of PLATFORMS) {
      if (typeof value?.[platform] === 'boolean') known[platform] = value[platform] as boolean;
    }
    return known;
  } catch {
    return {};
  }
}

/**
 * The last value each platform proved for one account and mode, kept on the
 * device. A platform the latest read could not prove keeps that value, so an
 * unknown never erases what was reported before. Removed when the account is
 * deleted.
 */
export function createVerifiedSocialMemory(store: StringStore) {
  return {
    async merge(
      uid: string,
      mode: string,
      read: VerifiedSocialState,
    ): Promise<VerifiedSocialState> {
      let remembered: KnownVerified = {};
      try {
        remembered = parseKnown(await store.getItem(keyFor(uid, mode)));
      } catch {
        remembered = {};
      }
      const merged: KnownVerified = { ...remembered, ...(read ?? {}) };
      if (read && Object.keys(read).length > 0) {
        await store.setItem(keyFor(uid, mode), JSON.stringify(merged)).catch(() => {});
      }
      return Object.keys(merged).length > 0 ? merged : null;
    },
    async forget(uid: string): Promise<void> {
      await Promise.all(MODES.map((mode) => store.removeItem(keyFor(uid, mode)).catch(() => {})));
    },
  };
}
