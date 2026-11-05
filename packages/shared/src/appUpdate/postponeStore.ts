import { parseAndroidAppUpdateChannel } from './channel.ts';
import { parseBuild, parseMarketingVersion } from './compareVersions.ts';
import type { AppUpdatePostpone } from './decideNotice.ts';

/**
 * v2 key. The v1 key (`...postpone.android`, `{ version, untilMs }`) is
 * intentionally abandoned: it cannot express `(marketingVersion, build, channel)`.
 */
export const APP_UPDATE_POSTPONE_STORAGE_KEY =
  'nearsy.appUpdate.postpone.android.v2';

export type AppUpdateKv = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function parseAppUpdatePostpone(
  raw: string | null,
): AppUpdatePostpone | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const rec = parsed as Record<string, unknown>;
    const marketingVersion = parseMarketingVersion(
      typeof rec.marketingVersion === 'string' ? rec.marketingVersion : null,
    );
    const build = parseBuild(typeof rec.build === 'string' ? rec.build : null);
    const channel = parseAndroidAppUpdateChannel(rec.channel);
    const untilMs = rec.untilMs;
    if (
      !marketingVersion ||
      !build ||
      !channel ||
      typeof untilMs !== 'number' ||
      !Number.isFinite(untilMs)
    ) {
      return null;
    }
    return { marketingVersion, build, channel, untilMs };
  } catch {
    return null;
  }
}

export async function readAppUpdatePostpone(
  storage: AppUpdateKv,
): Promise<AppUpdatePostpone | null> {
  try {
    return parseAppUpdatePostpone(
      await storage.getItem(APP_UPDATE_POSTPONE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export async function writeAppUpdatePostpone(
  storage: AppUpdateKv,
  postpone: AppUpdatePostpone,
): Promise<void> {
  await storage.setItem(
    APP_UPDATE_POSTPONE_STORAGE_KEY,
    JSON.stringify({
      marketingVersion: postpone.marketingVersion,
      build: postpone.build,
      channel: postpone.channel,
      untilMs: postpone.untilMs,
    }),
  );
}
