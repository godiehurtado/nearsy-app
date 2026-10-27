import { isPublicVersionGreater } from './compare';
import type { AppUpdateNoticeConfig } from './contract';
import { isSnoozeActive, type AppUpdateNoticeSnoozeRecord } from './snooze';

export type AppUpdateNoticeDecision = 'show' | 'skip';

export function decideAppUpdateNotice(input: {
  config: AppUpdateNoticeConfig | null;
  installedNativeVersion: string | null;
  platform: string;
  nowMs: number;
  snooze: AppUpdateNoticeSnoozeRecord | null;
}): AppUpdateNoticeDecision {
  const config = input.config;
  if (!config || !config.enabled) return 'skip';
  if (!config.latestVersion) return 'skip';
  if (!input.installedNativeVersion) return 'skip';
  if (!isPublicVersionGreater(config.latestVersion, input.installedNativeVersion)) {
    return 'skip';
  }
  if (
    isSnoozeActive(input.snooze, {
      platform: input.platform,
      latestVersion: config.latestVersion,
      nowMs: input.nowMs,
    })
  ) {
    return 'skip';
  }
  return 'show';
}
