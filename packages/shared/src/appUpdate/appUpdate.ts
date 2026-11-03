/**
 * Non-Android stub. The Play update notice is Android-only.
 */

import type { AndroidAppUpdateChannel, AppUpdateReleaseTarget } from './contract.ts';
import type { AppUpdateFetchRequest } from './noticeSession.ts';

export async function fetchAppUpdatePolicy(
  _request: AppUpdateFetchRequest,
): Promise<unknown> {
  return null;
}

export function readNativeAppUpdateChannel(): AndroidAppUpdateChannel | null {
  return null;
}

export function readNativeInstalledRelease(): AppUpdateReleaseTarget | null {
  return null;
}
