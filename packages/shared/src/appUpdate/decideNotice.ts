import type { AppUpdatePolicyResponse } from './contract.ts';
import { compareStoreVersions } from './compareVersions.ts';
import { parseStoreVersion } from './parsePolicy.ts';

export type AppUpdatePostpone = {
  version: string;
  untilMs: number;
};

export type DecideAppUpdateNoticeInput = {
  policy: AppUpdatePolicyResponse | null;
  installedVersion: string | null;
  nowMs: number;
  postpone: AppUpdatePostpone | null;
  modalVisible: boolean;
};

export type DecideAppUpdateNoticeResult =
  | { show: false }
  | { show: true; latestVersion: string; storeUrl: string };

/**
 * Optional notice only. `enabled=false`, equal/newer installed version,
 * invalid config, an active postpone for that version, or a visible modal
 * all skip. Never treats a missing `required` field as a force update.
 */
export function decideAppUpdateNotice(
  input: DecideAppUpdateNoticeInput,
): DecideAppUpdateNoticeResult {
  if (input.modalVisible) return { show: false };
  const policy = input.policy;
  if (!policy || policy.enabled !== true) return { show: false };

  const latestVersion = parseStoreVersion(policy.latestVersion);
  const installedVersion = parseStoreVersion(input.installedVersion);
  if (!latestVersion || !installedVersion) return { show: false };

  const cmp = compareStoreVersions(installedVersion, latestVersion);
  if (cmp == null || cmp >= 0) return { show: false };

  const postpone = input.postpone;
  if (
    postpone &&
    postpone.version === latestVersion &&
    input.nowMs < postpone.untilMs
  ) {
    return { show: false };
  }

  if (typeof policy.storeUrl !== 'string' || policy.storeUrl.length === 0) {
    return { show: false };
  }

  return { show: true, latestVersion, storeUrl: policy.storeUrl };
}
