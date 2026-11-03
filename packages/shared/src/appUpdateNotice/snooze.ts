/**
 * Optional “Later” deferral keyed by (platform, channel, marketingVersion, build).
 * Time bound is retained as a safety net; target change clears the deferral.
 */

export const APP_UPDATE_NOTICE_SNOOZE_MS = 24 * 60 * 60 * 1000;

export const APP_UPDATE_NOTICE_SNOOZE_STORAGE_KEY =
  '@nearsy/appUpdateNotice/snooze';

export type AppUpdateNoticeSnoozeRecord = {
  platform: string;
  channel: string;
  marketingVersion: string;
  build: string;
  /** Legacy field — still written for older readers. */
  latestVersion: string;
  untilMs: number;
};

export type AppUpdateNoticeSnoozeStore = {
  read: () => Promise<AppUpdateNoticeSnoozeRecord | null>;
  write: (record: AppUpdateNoticeSnoozeRecord) => Promise<void>;
};

export function parseSnoozeRecord(
  raw: unknown,
): AppUpdateNoticeSnoozeRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.platform !== 'string' || !record.platform.trim()) {
    return null;
  }
  if (typeof record.untilMs !== 'number' || !Number.isFinite(record.untilMs)) {
    return null;
  }
  const channel =
    typeof record.channel === 'string' && record.channel.trim()
      ? record.channel.trim()
      : 'production';
  const marketingVersion =
    typeof record.marketingVersion === 'string' && record.marketingVersion.trim()
      ? record.marketingVersion.trim()
      : typeof record.latestVersion === 'string' && record.latestVersion.trim()
        ? record.latestVersion.trim()
        : '';
  if (!marketingVersion) return null;
  const build =
    typeof record.build === 'string' && record.build.trim()
      ? record.build.trim()
      : '0';
  return {
    platform: record.platform.trim(),
    channel,
    marketingVersion,
    build,
    latestVersion: marketingVersion,
    untilMs: record.untilMs,
  };
}

export function isSnoozeActive(
  record: AppUpdateNoticeSnoozeRecord | null,
  input: {
    platform: string;
    channel: string;
    marketingVersion: string;
    build: string;
    nowMs: number;
  },
): boolean {
  if (!record) return false;
  if (record.platform !== input.platform) return false;
  if (record.channel !== input.channel) return false;
  if (record.marketingVersion !== input.marketingVersion) return false;
  if (record.build !== input.build) return false;
  return record.untilMs > input.nowMs;
}

export function buildSnoozeRecord(input: {
  platform: string;
  channel: string;
  marketingVersion: string;
  build: string;
  nowMs: number;
  snoozeMs?: number;
}): AppUpdateNoticeSnoozeRecord {
  const duration = input.snoozeMs ?? APP_UPDATE_NOTICE_SNOOZE_MS;
  return {
    platform: input.platform,
    channel: input.channel,
    marketingVersion: input.marketingVersion,
    build: input.build,
    latestVersion: input.marketingVersion,
    untilMs: input.nowMs + duration,
  };
}
