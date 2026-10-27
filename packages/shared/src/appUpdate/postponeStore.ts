import { parseStoreVersion } from './parsePolicy.ts';
import type { AppUpdatePostpone } from './decideNotice.ts';

export const APP_UPDATE_POSTPONE_STORAGE_KEY =
  'nearsy.appUpdate.postpone.android';

export type AppUpdateKv = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function parseAppUpdatePostpone(raw: string | null): AppUpdatePostpone | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    const version = parseStoreVersion(
      typeof rec.version === 'string' ? rec.version : null,
    );
    const untilMs = rec.untilMs;
    if (!version || typeof untilMs !== 'number' || !Number.isFinite(untilMs)) {
      return null;
    }
    return { version, untilMs };
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
      version: postpone.version,
      untilMs: postpone.untilMs,
    }),
  );
}
