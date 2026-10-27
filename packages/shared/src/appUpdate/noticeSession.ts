import type { AppUpdatePlatform, AppUpdatePolicyResponse } from './contract.ts';
import {
  decideAppUpdateNotice,
  type AppUpdatePostpone,
} from './decideNotice.ts';
import {
  ANDROID_APP_UPDATE_POLICY_REQUEST,
  officialAndroidStoreUrl,
  parseAppUpdatePolicyResponse,
} from './parsePolicy.ts';

/** Success-path cooldown so resume does not hammer `getAppUpdatePolicy`. */
export const POLICY_FETCH_MIN_INTERVAL_MS = 15 * 60 * 1000;
/** Retry sooner when the last attempt failed (offline / invalid). */
export const POLICY_FETCH_RETRY_MS = 60 * 1000;
export const POSTPONE_DURATION_MS = 24 * 60 * 60 * 1000;
/** Let OAuth / permission sheets finish before presenting. */
export const FOREGROUND_SETTLE_MS = 1_200;

export type AppUpdateNoticeCopy = {
  title: string;
  message: string;
  update: string;
  later: string;
};

export type AppUpdateNoticeDeps = {
  platform: AppUpdatePlatform;
  now: () => number;
  fetchPolicy: (request: { platform: AppUpdatePlatform }) => Promise<unknown>;
  getInstalledVersion: () => string | null;
  readPostpone: () => Promise<AppUpdatePostpone | null>;
  writePostpone: (postpone: AppUpdatePostpone) => Promise<void>;
  presentNotice: (args: {
    latestVersion: string;
    storeUrl: string;
    copy: AppUpdateNoticeCopy;
    onUpdate: () => void;
    onLater: () => void;
  }) => void;
  openStoreUrl: (url: string) => void;
  getCopy: () => AppUpdateNoticeCopy;
  isAppActive: () => boolean;
  delay: (ms: number) => Promise<void>;
  fetchMinIntervalMs?: number;
  fetchRetryMs?: number;
  postponeMs?: number;
  settleMs?: number;
};

export type AppUpdateNoticeConsultReason = 'start' | 'foreground';

export function createAppUpdateNoticeSession(deps: AppUpdateNoticeDeps) {
  let lastPolicy: AppUpdatePolicyResponse | null = null;
  let lastFetchAt = 0;
  let lastFetchOk = false;
  let inFlight = false;
  let modalVisible = false;
  let disposed = false;
  let consultGeneration = 0;

  const fetchMinIntervalMs =
    deps.fetchMinIntervalMs ?? POLICY_FETCH_MIN_INTERVAL_MS;
  const fetchRetryMs = deps.fetchRetryMs ?? POLICY_FETCH_RETRY_MS;
  const postponeMs = deps.postponeMs ?? POSTPONE_DURATION_MS;
  const settleMs = deps.settleMs ?? FOREGROUND_SETTLE_MS;

  function stillCurrent(generation: number): boolean {
    return !disposed && generation === consultGeneration;
  }

  async function maybeFetch(nowMs: number): Promise<void> {
    const cooldown = lastFetchOk ? fetchMinIntervalMs : fetchRetryMs;
    const haveFresh =
      lastFetchAt > 0 && nowMs - lastFetchAt < cooldown && lastPolicy != null;
    if (haveFresh) return;
    if (lastFetchAt > 0 && nowMs - lastFetchAt < cooldown && !lastFetchOk) {
      return;
    }

    try {
      const raw = await deps.fetchPolicy(
        deps.platform === 'android'
          ? ANDROID_APP_UPDATE_POLICY_REQUEST
          : { platform: deps.platform },
      );
      lastFetchAt = deps.now();
      const parsed = parseAppUpdatePolicyResponse(raw, deps.platform);
      if (!parsed) {
        lastFetchOk = false;
        lastPolicy = null;
        return;
      }
      lastPolicy = parsed;
      lastFetchOk = true;
    } catch {
      lastFetchAt = deps.now();
      lastFetchOk = false;
    }
  }

  function hideModal(): void {
    modalVisible = false;
  }

  async function presentIfNeeded(): Promise<void> {
    if (disposed || modalVisible || !deps.isAppActive()) return;
    const decision = decideAppUpdateNotice({
      policy: lastPolicy,
      installedVersion: deps.getInstalledVersion(),
      nowMs: deps.now(),
      postpone: await deps.readPostpone(),
      modalVisible,
    });
    if (!decision.show || disposed || modalVisible || !deps.isAppActive()) {
      return;
    }

    modalVisible = true;
    const latestVersion = decision.latestVersion;
    const storeUrl = decision.storeUrl;
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      hideModal();
      action();
    };
    deps.presentNotice({
      latestVersion,
      storeUrl,
      copy: deps.getCopy(),
      onUpdate: () =>
        finish(() => {
          const url = officialAndroidStoreUrl(storeUrl);
          if (!url) return;
          deps.openStoreUrl(url);
        }),
      onLater: () =>
        finish(() => {
          void deps.writePostpone({
            version: latestVersion,
            untilMs: deps.now() + postponeMs,
          });
        }),
    });
  }

  async function consult(reason: AppUpdateNoticeConsultReason): Promise<void> {
    if (disposed || inFlight) return;
    const generation = ++consultGeneration;
    inFlight = true;
    try {
      if (!deps.isAppActive()) return;
      if (reason === 'foreground' && settleMs > 0) {
        await deps.delay(settleMs);
        if (!stillCurrent(generation) || !deps.isAppActive()) return;
      }
      if (modalVisible) return;
      await maybeFetch(deps.now());
      if (!stillCurrent(generation)) return;
      await presentIfNeeded();
    } finally {
      if (generation === consultGeneration) inFlight = false;
    }
  }

  function dispose(): void {
    disposed = true;
    consultGeneration += 1;
    inFlight = false;
  }

  return { consult, dispose };
}
