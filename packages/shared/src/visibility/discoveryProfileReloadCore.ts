/**
 * Discovery detail reload policy.
 * `getDiscoveryProfile.socialLinks` is the only icon source; never the private bag.
 */

export type DiscoveryProfileLoadTrigger = 'mount' | 'focus';

export type DiscoveryProfileLoadMode = 'skip' | 'blocking' | 'silent';

export type DiscoveryProfileFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false };

export type DiscoveryProfileApplyDecision<T> =
  | { action: 'discard' }
  | { action: 'apply'; data: T }
  | { action: 'keep'; data: T }
  | { action: 'clear' };

/**
 * Android refetches the public DTO when returning to detail (after Unlink).
 * A private bag URL is not published; silent refetch must not invent links.
 * Non-Android stays mount-only so iOS behavior is unchanged.
 */
export function discoveryProfileLoadMode(input: {
  refetchOnFocus: boolean;
  hasData: boolean;
  trigger: DiscoveryProfileLoadTrigger;
}): DiscoveryProfileLoadMode {
  if (input.trigger === 'mount') {
    return input.refetchOnFocus ? 'skip' : 'blocking';
  }
  if (!input.refetchOnFocus) return 'skip';
  return input.hasData ? 'silent' : 'blocking';
}

/**
 * Drop stale getDiscoveryProfile results when the request is no longer current
 * (new uid/mode fetch, unmount, or a newer generation).
 */
export function decideDiscoveryProfileApply<T>(input: {
  requestGen: number;
  currentGen: number;
  requestKey: string;
  currentKey: string;
  unmounted: boolean;
  silent: boolean;
  previous: T | null;
  result: DiscoveryProfileFetchResult<T>;
}): DiscoveryProfileApplyDecision<T> {
  if (
    input.unmounted ||
    input.requestGen !== input.currentGen ||
    input.requestKey !== input.currentKey
  ) {
    return { action: 'discard' };
  }
  if (input.result.ok) {
    return { action: 'apply', data: input.result.data };
  }
  if (input.silent && input.previous) {
    return { action: 'keep', data: input.previous };
  }
  return { action: 'clear' };
}

export function discoveryPublicLinksOmitInstagram(
  links: readonly { platform: string }[] | null | undefined,
): boolean {
  if (!Array.isArray(links)) return true;
  return links.every((link) => link.platform !== 'instagram');
}
