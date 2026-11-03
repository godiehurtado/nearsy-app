import { isInstalledBehindTarget } from './compare';
import type { AppUpdateNoticeConfig } from './contract';
import { isSnoozeActive, type AppUpdateNoticeSnoozeRecord } from './snooze';

export type AppUpdateNoticeDecision = 'soft' | 'force' | 'skip';

export function decideAppUpdateNotice(input: {
  config: AppUpdateNoticeConfig | null;
  installed: { marketingVersion: string; build: string } | null;
  platform: string;
  nowMs: number;
  snooze: AppUpdateNoticeSnoozeRecord | null;
}): AppUpdateNoticeDecision {
  const config = input.config;
  if (!config) return 'skip';
  if (!input.installed) return 'skip';

  if (
    config.forceEnabled &&
    isInstalledBehindTarget(input.installed, config.minimum)
  ) {
    return 'force';
  }

  if (!config.softEnabled) return 'skip';
  if (!config.recommended.marketingVersion) return 'skip';
  if (!isInstalledBehindTarget(input.installed, config.recommended)) {
    return 'skip';
  }
  if (
    isSnoozeActive(input.snooze, {
      platform: input.platform,
      channel: config.channel,
      marketingVersion: config.recommended.marketingVersion,
      build: config.recommended.build,
      nowMs: input.nowMs,
    })
  ) {
    return 'skip';
  }
  return 'soft';
}
