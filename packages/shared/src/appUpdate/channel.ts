/**
 * Android distribution channel for `getAppUpdatePolicy` (CONTRACT.md:
 * "Separates Firebase project from distribution channel").
 *
 * Chosen source: an EXPLICIT build-time Expo extra, `extra.nearsyAppUpdateChannel`,
 * written by `apps/nearsy-android/app.config.js` from the
 * `NEARSY_APP_UPDATE_CHANNEL` env var (`production` | `playInternal`) that each
 * EAS build profile pins.
 *
 * Why not something else:
 *  - Firebase project / `NEARSY_FIREBASE_ENV` / the `production` EAS profile are
 *    not channels: Internal testers run the same Firebase project and the same
 *    profile output as production (CONTRACT.md: never infer channel from them).
 *  - The Play installer package (`com.android.vending`) is the same for
 *    Internal-testing and production installs, and Play Install Referrer only
 *    carries campaign data. Neither distinguishes the two tracks, and both would
 *    need a new native dependency. No runtime Android API reports the Play track.
 *
 * Contract: because Play can promote one artifact between tracks, the Internal
 * artifact MUST be built with `playInternal` and the production artifact with
 * `production` (distinct versionCodes). When the extra is absent or invalid the
 * channel is `null` and the client does NOT consult the policy (fail open,
 * no soft notice, no mandatory block) rather than guessing `production`.
 */

import {
  ANDROID_APP_UPDATE_CHANNELS,
  type AndroidAppUpdateChannel,
} from './contract.ts';

export const APP_UPDATE_CHANNEL_EXTRA_KEY = 'nearsyAppUpdateChannel' as const;
export const APP_UPDATE_CHANNEL_ENV_VAR = 'NEARSY_APP_UPDATE_CHANNEL' as const;

/** Strict, case-sensitive: only the exact contract values are accepted. */
export function parseAndroidAppUpdateChannel(
  raw: unknown,
): AndroidAppUpdateChannel | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return (ANDROID_APP_UPDATE_CHANNELS as readonly string[]).includes(value)
    ? (value as AndroidAppUpdateChannel)
    : null;
}

export type AppUpdateChannelExtras = {
  nearsyAppUpdateChannel?: unknown;
} | null;

export function resolveAndroidAppUpdateChannel(
  extras: AppUpdateChannelExtras | undefined,
): AndroidAppUpdateChannel | null {
  return parseAndroidAppUpdateChannel(extras?.nearsyAppUpdateChannel);
}
