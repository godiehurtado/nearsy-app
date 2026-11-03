import type {
  AndroidAppUpdateChannel,
  AppUpdateReleaseTarget,
} from './contract.ts';
import { compareReleases } from './compareVersions.ts';
import {
  allowlistedAndroidUpdateUrl,
  type AppUpdatePolicy,
} from './parsePolicy.ts';

/** Per-target deferral (CONTRACT.md: `(marketingVersion, build, channel)`). */
export type AppUpdatePostpone = {
  marketingVersion: string;
  build: string;
  channel: AndroidAppUpdateChannel;
  untilMs: number;
};

/** A policy together with the validity window the client assigned to it. */
export type CachedAppUpdatePolicy = {
  policy: AppUpdatePolicy;
  fetchedAtMs: number;
  /** `fetchedAtMs + cacheTtlSeconds * 1000`; after this the policy is void. */
  expiresAtMs: number;
};

export type DecideAppUpdateInput = {
  /** Channel baked into THIS install. Policies for any other channel are void. */
  channel: AndroidAppUpdateChannel;
  cached: CachedAppUpdatePolicy | null;
  /** `null` when versionName / versionCode could not be read. */
  installed: AppUpdateReleaseTarget | null;
  nowMs: number;
  postpone: AppUpdatePostpone | null;
  /** True while a soft notice is already on screen. */
  modalVisible: boolean;
};

export type AppUpdateDecision =
  | { kind: 'none' }
  | {
      kind: 'soft';
      channel: AndroidAppUpdateChannel;
      target: AppUpdateReleaseTarget;
      updateUrl: string;
    }
  | {
      kind: 'mandatory';
      channel: AndroidAppUpdateChannel;
      target: AppUpdateReleaseTarget;
      updateUrl: string;
    };

const NONE: AppUpdateDecision = { kind: 'none' };

export function isPolicyUsable(
  cached: CachedAppUpdatePolicy | null,
  channel: AndroidAppUpdateChannel,
  nowMs: number,
): cached is CachedAppUpdatePolicy {
  if (!cached) return false;
  if (cached.policy.channel !== channel) return false;
  if (!(nowMs < cached.expiresAtMs)) return false;
  return true;
}

export function postponeMatches(
  postpone: AppUpdatePostpone | null,
  channel: AndroidAppUpdateChannel,
  target: AppUpdateReleaseTarget,
  nowMs: number,
): boolean {
  return (
    postpone != null &&
    postpone.channel === channel &&
    postpone.marketingVersion === target.marketingVersion &&
    postpone.build === target.build &&
    nowMs < postpone.untilMs
  );
}

/**
 * Normative client decision (CONTRACT.md "Client comparison"), fail-open:
 *  - mandatory iff `forceEnabled`, `minimum` FULLY set, installed strictly
 *    older than `minimum`, and the cached policy is still within its TTL.
 *  - soft iff `softEnabled`, `recommended` fully set, installed strictly older,
 *    not deferred for that exact target, and no mandatory surface applies.
 *  - anything absent / invalid / expired / unreadable installed => none.
 * Never treats a missing field as a force update.
 */
export function decideAppUpdate(input: DecideAppUpdateInput): AppUpdateDecision {
  const { channel, nowMs } = input;
  if (!isPolicyUsable(input.cached, channel, nowMs)) return NONE;
  const policy = input.cached.policy;
  const installed = input.installed;
  if (!installed) return NONE;

  const updateUrl = allowlistedAndroidUpdateUrl(policy.updateUrl, channel);
  if (!updateUrl) return NONE;

  if (policy.forceEnabled === true && policy.minimum) {
    const cmp = compareReleases(installed, policy.minimum);
    if (cmp != null && cmp < 0) {
      return { kind: 'mandatory', channel, target: policy.minimum, updateUrl };
    }
  }

  if (input.modalVisible) return NONE;
  if (policy.softEnabled !== true || !policy.recommended) return NONE;
  const cmp = compareReleases(installed, policy.recommended);
  if (cmp == null || cmp >= 0) return NONE;
  if (postponeMatches(input.postpone, channel, policy.recommended, nowMs)) {
    return NONE;
  }
  return { kind: 'soft', channel, target: policy.recommended, updateUrl };
}
