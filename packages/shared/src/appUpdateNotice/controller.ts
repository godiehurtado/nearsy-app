import {
  parseAppUpdateNoticeConfig,
  type AppUpdateChannel,
  type AppUpdateNoticeConfig,
} from './contract';
import { decideAppUpdateNotice } from './decision';
import {
  buildSnoozeRecord,
  parseSnoozeRecord,
  type AppUpdateNoticeSnoozeStore,
} from './snooze';
import { shouldConsultOnAppStateChange } from './sensitiveSession';
import type { InstalledNativeRelease } from './nativeVersion';

export const APP_UPDATE_NOTICE_FETCH_THROTTLE_MS = 15 * 60 * 1000;

export type AppUpdateNoticePresentChoice = 'update' | 'later' | 'dismissed';

export type AppUpdateNoticePresentation =
  | { kind: 'soft'; latestVersion: string; updateUrl: string }
  | { kind: 'force'; minimumVersion: string; updateUrl: string };

export type AppUpdateNoticeControllerDeps = {
  nowMs: () => number;
  platform: string;
  /** When undetermined, consult is a no-op (Beta-safe). */
  resolveChannel: () =>
    | { kind: 'production' | 'testflight' }
    | { kind: 'undetermined'; reason: string };
  readInstalledRelease: () => InstalledNativeRelease | null;
  loadNotice: (channel: AppUpdateChannel) => Promise<unknown>;
  snoozeStore: AppUpdateNoticeSnoozeStore;
  isSensitiveSession: () => boolean;
  present: (
    presentation: AppUpdateNoticePresentation,
  ) => Promise<AppUpdateNoticePresentChoice>;
  /** Called when a force surface must close because policy expired/invalid. */
  dismissForce?: () => void;
  openStoreListing: (storeUrl: string) => void | Promise<void>;
  fetchThrottleMs?: number;
};

export function createAppUpdateNoticeController(
  deps: AppUpdateNoticeControllerDeps,
) {
  let inFlight: Promise<void> | null = null;
  let modalOpen = false;
  let forceActive = false;
  let lastFetchAt = 0;
  let cachedConfig: AppUpdateNoticeConfig | null = null;
  let cachedUntilMs = 0;

  async function loadConfig(
    channel: AppUpdateChannel,
    forceNetwork: boolean,
  ): Promise<AppUpdateNoticeConfig | null> {
    const now = deps.nowMs();
    const throttle = deps.fetchThrottleMs ?? APP_UPDATE_NOTICE_FETCH_THROTTLE_MS;
    if (
      !forceNetwork &&
      cachedConfig &&
      cachedConfig.channel === channel &&
      lastFetchAt > 0 &&
      now - lastFetchAt < throttle &&
      now < cachedUntilMs
    ) {
      return cachedConfig;
    }

    try {
      const raw = await deps.loadNotice(channel);
      lastFetchAt = deps.nowMs();
      const parsed = parseAppUpdateNoticeConfig(raw);
      if (!parsed.ok) {
        // Keep last-good until TTL, then fail open.
        if (cachedConfig && deps.nowMs() < cachedUntilMs) return cachedConfig;
        cachedConfig = null;
        return null;
      }
      cachedConfig = parsed.config;
      cachedUntilMs =
        deps.nowMs() + Math.max(1, parsed.config.cacheTtlSeconds) * 1000;
      return cachedConfig;
    } catch {
      lastFetchAt = deps.nowMs();
      if (cachedConfig && deps.nowMs() < cachedUntilMs) return cachedConfig;
      cachedConfig = null;
      return null;
    }
  }

  async function runConsult(): Promise<void> {
    if (modalOpen && !forceActive) return;
    if (deps.isSensitiveSession()) return;

    const channelRes = deps.resolveChannel();
    if (channelRes.kind === 'undetermined') {
      // Never query production as a TestFlight fallback.
      if (forceActive) {
        forceActive = false;
        deps.dismissForce?.();
      }
      return;
    }

    const config = await loadConfig(channelRes.kind, false);
    if (deps.isSensitiveSession()) return;

    const installed = deps.readInstalledRelease();
    const snooze = parseSnoozeRecord(
      await deps.snoozeStore.read().catch(() => null),
    );
    const decision = decideAppUpdateNotice({
      config,
      installed,
      platform: deps.platform,
      nowMs: deps.nowMs(),
      snooze,
    });

    if (forceActive && decision !== 'force') {
      forceActive = false;
      modalOpen = false;
      deps.dismissForce?.();
    }

    if (decision === 'skip' || !config) return;
    if (modalOpen && decision === 'soft') return;

    modalOpen = true;
    forceActive = decision === 'force';
    try {
      const presentation: AppUpdateNoticePresentation =
        decision === 'force'
          ? {
              kind: 'force',
              minimumVersion: config.minimum.marketingVersion,
              updateUrl: config.updateUrl,
            }
          : {
              kind: 'soft',
              latestVersion: config.recommended.marketingVersion,
              updateUrl: config.updateUrl,
            };
      const choice = await deps.present(presentation);
      if (choice === 'later' && decision === 'soft') {
        await deps.snoozeStore
          .write(
            buildSnoozeRecord({
              platform: deps.platform,
              channel: config.channel,
              marketingVersion: config.recommended.marketingVersion,
              build: config.recommended.build,
              nowMs: deps.nowMs(),
            }),
          )
          .catch(() => {});
        return;
      }
      if (choice === 'update') {
        await Promise.resolve(deps.openStoreListing(config.updateUrl)).catch(
          () => {},
        );
      }
    } finally {
      if (!forceActive) {
        modalOpen = false;
      }
    }
  }

  function consult(reason: 'open' | 'foreground'): Promise<void> {
    void reason;
    // While a force surface is up, allow a follow-up consult so expired /
    // invalidated policy can dismissForce (coalesce would otherwise pin the
    // first present() forever and block release).
    if (inFlight && !forceActive) return inFlight;
    const run = runConsult().finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run;
  }

  function onAppStateChange(from: string | null, to: string): void {
    if (!shouldConsultOnAppStateChange(from, to)) return;
    void consult('foreground');
  }

  return {
    consult,
    onAppStateChange,
    isModalOpen: () => modalOpen,
    isForceActive: () => forceActive,
  };
}
