export const APP_UPDATE_NOTICE_SNOOZE_MS = 24 * 60 * 60 * 1000;

export const APP_UPDATE_NOTICE_SNOOZE_STORAGE_KEY =
  '@nearsy/appUpdateNotice/snooze';

export type AppUpdateNoticeSnoozeRecord = {
  platform: string;
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
  if (typeof record.latestVersion !== 'string' || !record.latestVersion.trim()) {
    return null;
  }
  if (typeof record.untilMs !== 'number' || !Number.isFinite(record.untilMs)) {
    return null;
  }
  return {
    platform: record.platform.trim(),
    latestVersion: record.latestVersion.trim(),
    untilMs: record.untilMs,
  };
}

export function isSnoozeActive(
  record: AppUpdateNoticeSnoozeRecord | null,
  input: { platform: string; latestVersion: string; nowMs: number },
): boolean {
  if (!record) return false;
  if (record.platform !== input.platform) return false;
  if (record.latestVersion !== input.latestVersion) return false;
  return record.untilMs > input.nowMs;
}

export function buildSnoozeRecord(input: {
  platform: string;
  latestVersion: string;
  nowMs: number;
  snoozeMs?: number;
}): AppUpdateNoticeSnoozeRecord {
  const duration = input.snoozeMs ?? APP_UPDATE_NOTICE_SNOOZE_MS;
  return {
    platform: input.platform,
    latestVersion: input.latestVersion,
    untilMs: input.nowMs + duration,
  };
}
