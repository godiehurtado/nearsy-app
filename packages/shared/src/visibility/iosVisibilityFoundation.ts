/**
 * Non-iOS stub — Visibility callables are composed on iOS via RNFB.
 */

import type { VisibilityDiscoveryClient } from './callables';

export function getVisibilityDiscoveryClient(): Promise<VisibilityDiscoveryClient> {
  return Promise.reject(
    new Error('Visibility discovery client is only available on iOS.'),
  );
}

export function resetVisibilityDiscoveryClientForTests(): void {
  // no-op
}
