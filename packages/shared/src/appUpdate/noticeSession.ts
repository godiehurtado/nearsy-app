import {
  APP_UPDATE_DEFAULT_CACHE_TTL_SECONDS,
  type AndroidAppUpdateChannel,
  type AppUpdateLegacyRequest,
  type AppUpdatePolicyRequest,
  type AppUpdateReleaseTarget,
} from './contract.ts';
import {
  decideAppUpdate,
  type AppUpdatePostpone,
  type CachedAppUpdatePolicy,
} from './decideNotice.ts';
import {
  ANDROID_LEGACY_APP_UPDATE_REQUEST,
  allowlistedAndroidUpdateUrl,
  buildAppUpdatePolicyRequest,
  isInvalidArgumentError,
  parseAppUpdatePolicyLegacy,
  parseAppUpdatePolicyV2,
  type AppUpdatePolicy,
} from './parsePolicy.ts';

/** Let OAuth / permission sheets finish before presenting. */
export const FOREGROUND_SETTLE_MS = 1_200;
/** Retry sooner when the last attempt failed (offline / invalid). */
export const POLICY_FETCH_RETRY_MS = 60 * 1000;
export const POSTPONE_DURATION_MS = 24 * 60 * 60 * 1000;

export type AppUpdateNoticeCopy = {
  title: string;
  message: string;
  update: string;
  later: string;
};

export type AppUpdateMandatoryCopy = {
  title: string;
  message: string;
  update: string;
};

export type AppUpdateCopy = {
  soft: AppUpdateNoticeCopy;
  mandatory: AppUpdateMandatoryCopy;
};

export type AppUpdateFetchRequest =
  | AppUpdatePolicyRequest
  | AppUpdateLegacyRequest;

export type AppUpdateNoticeDeps = {
  /**
   * Channel baked into this install (`channel.ts`). `null` => the session never
   * fetches and never shows anything (fail open).
   */
  channel: AndroidAppUpdateChannel | null;
  now: () => number;
  fetchPolicy: (request: AppUpdateFetchRequest) => Promise<unknown>;
  /** Installed `versionName` + `versionCode`; `null` when unreadable. */
  getInstalledRelease: () => AppUpdateReleaseTarget | null;
  readPostpone: () => Promise<AppUpdatePostpone | null>;
  writePostpone: (postpone: AppUpdatePostpone) => Promise<void>;
  presentNotice: (args: {
    channel: AndroidAppUpdateChannel;
    target: AppUpdateReleaseTarget;
    updateUrl: string;
    copy: AppUpdateNoticeCopy;
    onUpdate: () => void;
    onLater: () => void;
  }) => void;
  /** Blocking surface. `onUpdate` opens the store link and does NOT dismiss. */
  presentMandatory: (args: {
    channel: AndroidAppUpdateChannel;
    target: AppUpdateReleaseTarget;
    updateUrl: string;
    copy: AppUpdateMandatoryCopy;
    onUpdate: () => void;
  }) => void;
  /** Must remove the mandatory surface (policy no longer valid / satisfied). */
  dismissMandatory: () => void;
  openUpdateUrl: (url: string) => void;
  getCopy: (channel: AndroidAppUpdateChannel) => AppUpdateCopy;
  isAppActive: () => boolean;
  delay: (ms: number) => Promise<void>;
  /** Defaults to `setTimeout`. Returns a canceller. */
  scheduleTimeout?: (run: () => void, ms: number) => () => void;
  fetchRetryMs?: number;
  postponeMs?: number;
  settleMs?: number;
};

export type AppUpdateNoticeConsultReason = 'start' | 'foreground' | 'expiry';

type FetchOutcome =
  | { kind: 'ok'; policy: AppUpdatePolicy }
  /** Server answered but the policy is unusable => drop any cached policy. */
  | { kind: 'invalid' }
  /** Pre-v2 server cannot serve this channel => no policy, calm cadence. */
  | { kind: 'unsupported' }
  /** Network / transient => keep last good policy until its TTL elapses. */
  | { kind: 'error' };

function defaultScheduleTimeout(run: () => void, ms: number): () => void {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
}

function targetKey(
  channel: AndroidAppUpdateChannel,
  target: AppUpdateReleaseTarget,
  updateUrl: string,
): string {
  return `${channel}|${target.marketingVersion}|${target.build}|${updateUrl}`;
}

export function createAppUpdateNoticeSession(deps: AppUpdateNoticeDeps) {
  const channel = deps.channel;
  let cached: CachedAppUpdatePolicy | null = null;
  let nextFetchAtMs = 0;
  let inFlight = false;
  let softVisible = false;
  let mandatoryKey: string | null = null;
  let disposed = false;
  let consultGeneration = 0;
  let cancelExpiry: (() => void) | null = null;

  const retryMs = deps.fetchRetryMs ?? POLICY_FETCH_RETRY_MS;
  const postponeMs = deps.postponeMs ?? POSTPONE_DURATION_MS;
  const settleMs = deps.settleMs ?? FOREGROUND_SETTLE_MS;
  const schedule = deps.scheduleTimeout ?? defaultScheduleTimeout;

  function stillCurrent(generation: number): boolean {
    return !disposed && generation === consultGeneration;
  }

  function clearExpiryTimer(): void {
    cancelExpiry?.();
    cancelExpiry = null;
  }

  function armExpiryTimer(): void {
    clearExpiryTimer();
    if (!cached || disposed) return;
    const ms = Math.max(0, cached.expiresAtMs - deps.now());
    cancelExpiry = schedule(onPolicyExpired, ms);
  }

  /**
   * The mandatory surface must never outlive the policy that justified it:
   * on expiry we drop the policy, dismiss, then try to refresh (CONTRACT.md
   * rule 6: after `cacheTtlSeconds` fail open).
   */
  function onPolicyExpired(): void {
    cancelExpiry = null;
    if (disposed) return;
    if (cached && !(deps.now() < cached.expiresAtMs)) cached = null;
    syncMandatory();
    void consult('expiry');
  }

  function syncMandatory(): void {
    if (channel == null) return;
    const decision = decideAppUpdate({
      channel,
      cached,
      installed: deps.getInstalledRelease(),
      nowMs: deps.now(),
      postpone: null,
      modalVisible: false,
    });
    if (decision.kind === 'mandatory') {
      const key = targetKey(decision.channel, decision.target, decision.updateUrl);
      if (mandatoryKey === key || !deps.isAppActive()) return;
      mandatoryKey = key;
      deps.presentMandatory({
        channel: decision.channel,
        target: decision.target,
        updateUrl: decision.updateUrl,
        copy: deps.getCopy(decision.channel).mandatory,
        onUpdate: () => {
          const url = allowlistedAndroidUpdateUrl(decision.updateUrl, decision.channel);
          if (url) deps.openUpdateUrl(url);
        },
      });
      return;
    }
    if (mandatoryKey != null) {
      mandatoryKey = null;
      deps.dismissMandatory();
    }
  }

  async function requestPolicy(
    activeChannel: AndroidAppUpdateChannel,
  ): Promise<FetchOutcome> {
    let raw: unknown;
    try {
      raw = await deps.fetchPolicy(buildAppUpdatePolicyRequest(activeChannel));
    } catch (error) {
      if (!isInvalidArgumentError(error)) return { kind: 'error' };
      // Pre-v2 server rejected the unknown `channel` key.
      if (activeChannel !== 'production') {
        // A legacy answer can only describe production. Never apply it to an
        // Internal install (CONTRACT.md rule 5): fail open.
        return { kind: 'unsupported' };
      }
      try {
        raw = await deps.fetchPolicy(ANDROID_LEGACY_APP_UPDATE_REQUEST);
      } catch {
        return { kind: 'error' };
      }
      const legacy = parseAppUpdatePolicyLegacy(raw);
      return legacy ? { kind: 'ok', policy: legacy } : { kind: 'invalid' };
    }
    const policy = parseAppUpdatePolicyV2(raw, activeChannel);
    return policy ? { kind: 'ok', policy } : { kind: 'invalid' };
  }

  async function maybeFetch(activeChannel: AndroidAppUpdateChannel): Promise<void> {
    if (deps.now() < nextFetchAtMs) return;
    const outcome = await requestPolicy(activeChannel);
    if (disposed) return;
    const at = deps.now();
    switch (outcome.kind) {
      case 'ok': {
        const ttlMs = outcome.policy.cacheTtlSeconds * 1000;
        cached = {
          policy: outcome.policy,
          fetchedAtMs: at,
          expiresAtMs: at + ttlMs,
        };
        // Resume re-check interval is at least 1x cacheTtlSeconds.
        nextFetchAtMs = at + ttlMs;
        break;
      }
      case 'unsupported':
        cached = null;
        nextFetchAtMs = at + APP_UPDATE_DEFAULT_CACHE_TTL_SECONDS * 1000;
        break;
      case 'invalid':
        cached = null;
        nextFetchAtMs = at + retryMs;
        break;
      case 'error':
        // Keep last good policy; it still dies at its own expiry.
        nextFetchAtMs = at + retryMs;
        break;
    }
    if (cached) armExpiryTimer();
    else clearExpiryTimer();
  }

  async function presentSoftIfNeeded(
    activeChannel: AndroidAppUpdateChannel,
  ): Promise<void> {
    if (disposed || softVisible || !deps.isAppActive()) return;
    const postpone = await deps.readPostpone();
    if (disposed || softVisible || !deps.isAppActive()) return;
    const decision = decideAppUpdate({
      channel: activeChannel,
      cached,
      installed: deps.getInstalledRelease(),
      nowMs: deps.now(),
      postpone,
      modalVisible: softVisible,
    });
    if (decision.kind !== 'soft') return;

    softVisible = true;
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      softVisible = false;
      action();
    };
    deps.presentNotice({
      channel: decision.channel,
      target: decision.target,
      updateUrl: decision.updateUrl,
      copy: deps.getCopy(decision.channel).soft,
      onUpdate: () =>
        finish(() => {
          const url = allowlistedAndroidUpdateUrl(
            decision.updateUrl,
            decision.channel,
          );
          if (url) deps.openUpdateUrl(url);
        }),
      onLater: () =>
        finish(() => {
          void deps.writePostpone({
            marketingVersion: decision.target.marketingVersion,
            build: decision.target.build,
            channel: decision.channel,
            untilMs: deps.now() + postponeMs,
          });
        }),
    });
  }

  async function consult(reason: AppUpdateNoticeConsultReason): Promise<void> {
    if (disposed || inFlight || channel == null) return;
    const generation = ++consultGeneration;
    inFlight = true;
    try {
      if (!deps.isAppActive()) return;
      if (reason === 'foreground' && settleMs > 0) {
        await deps.delay(settleMs);
        if (!stillCurrent(generation) || !deps.isAppActive()) return;
      }
      await maybeFetch(channel);
      if (!stillCurrent(generation)) return;
      syncMandatory();
      await presentSoftIfNeeded(channel);
    } finally {
      if (generation === consultGeneration) inFlight = false;
    }
  }

  function dispose(): void {
    disposed = true;
    consultGeneration += 1;
    inFlight = false;
    clearExpiryTimer();
    if (mandatoryKey != null) {
      mandatoryKey = null;
      deps.dismissMandatory();
    }
  }

  return { consult, dispose };
}
