/**
 * Non-Android stub. The optional Play notice is Android-only.
 */

import type { AppUpdatePlatform } from './contract.ts';

export async function fetchAppUpdatePolicy(_request: {
  platform: AppUpdatePlatform;
}): Promise<unknown> {
  return null;
}

export function readNativeStoreVersion(): string | null {
  return null;
}
