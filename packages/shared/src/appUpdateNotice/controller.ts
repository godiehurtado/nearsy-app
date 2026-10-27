import { parseAppUpdateNoticeConfig, type AppUpdateNoticeConfig } from './contract';
import { decideAppUpdateNotice } from './decision';
import {
  buildSnoozeRecord,
  parseSnoozeRecord,
  type AppUpdateNoticeSnoozeStore,
} from './snooze';
import { shouldConsultOnAppStateChange } from './sensitiveSession';

/** Minimum gap between Functions fetches (open + foreground share this). */
export const APP_UPDATE_NOTICE_FETCH_THROTTLE_MS = 15 * 60 * 1000;

export type AppUpdateNoticePresentChoice = 'update' | 'later';

export type AppUpdateNoticeControllerDeps = {
  nowMs: () => number;
  platform: string;
  readInstalledNativeVersion: () => string | null;
  loadNotice: () => Promise<unknown>;
  snoozeStore: AppUpdateNoticeSnoozeStore;
  isSensitiveSession: () => boolean;
  present: (latestVersion: string) => Promise<AppUpdateNoticePresentChoice>;
  openStoreListing: (storeUrl: string) => void | Promise<void>;
  fetchThrottleMs?: number;
};

export function createAppUpdateNoticeController(
  deps: AppUpdateNoticeControllerDeps,
) {
  let inFlight: Promise<void> | null = null;
  let modalOpen = false;
  let lastFetchAt = 0;
  let cachedConfig: AppUpdateNoticeConfig | null = null;

  async function loadConfig(forceNetwork: boolean): Promise<AppUpdateNoticeConfig | null> {
    const throttle = deps.fetchThrottleMs ?? APP_UPDATE_NOTICE_FETCH_THROTTLE_MS;
    const now = deps.nowMs();
    if (
      !forceNetwork &&
      cachedConfig &&
      lastFetchAt > 0 &&
      now - lastFetchAt < throttle
    ) {
      return cachedConfig;
    }

    try {
      const raw = await deps.loadNotice();
      lastFetchAt = deps.nowMs();
      const parsed = parseAppUpdateNoticeConfig(raw);
      cachedConfig = parsed.ok ? parsed.config : null;
      return cachedConfig;
    } catch {
      lastFetchAt = deps.nowMs();
      cachedConfig = null;
      return null;
    }
  }

  async function runConsult(): Promise<void> {
    if (modalOpen) return;
    if (deps.isSensitiveSession()) return;

    const config = await loadConfig(false);
    if (modalOpen) return;
    if (deps.isSensitiveSession()) return;

    const snooze = parseSnoozeRecord(await deps.snoozeStore.read().catch(() => null));
    const decision = decideAppUpdateNotice({
      config,
      installedNativeVersion: deps.readInstalledNativeVersion(),
      platform: deps.platform,
      nowMs: deps.nowMs(),
      snooze,
    });
    if (decision !== 'show' || !config) return;

    modalOpen = true;
    try {
      const choice = await deps.present(config.latestVersion);
      if (choice === 'later') {
        await deps.snoozeStore
          .write(
            buildSnoozeRecord({
              platform: deps.platform,
              latestVersion: config.latestVersion,
              nowMs: deps.nowMs(),
            }),
          )
          .catch(() => {});
        return;
      }
      await Promise.resolve(deps.openStoreListing(config.storeUrl)).catch(() => {});
    } finally {
      modalOpen = false;
    }
  }

  function consult(reason: 'open' | 'foreground'): Promise<void> {
    void reason;
    if (inFlight) return inFlight;
    inFlight = runConsult().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function onAppStateChange(from: string | null, to: string): void {
    if (!shouldConsultOnAppStateChange(from, to)) return;
    void consult('foreground');
  }

  return {
    consult,
    onAppStateChange,
    isModalOpen: () => modalOpen,
  };
}
