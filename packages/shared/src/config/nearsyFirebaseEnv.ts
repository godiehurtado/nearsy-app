/**
 * Resolves the Firebase environment surfaced by Expo config (no secrets).
 * Canonical source: nearsyAndroidEnvironment + app.config.js extras.
 */
import {
  resolveNearsyFirebaseEnvLabel,
  resolveNearsyDevClientFlag,
  type NearsyFirebaseEnvLabel,
  type NearsyFirebaseEnvExtras,
} from './appCheckPolicy.ts';
import {
  resolveNearsyAndroidEnvironment,
  buildAndroidRuntimeConfigSnapshot,
  type AndroidRuntimeConfigSnapshot,
} from './nearsyAndroidEnvironment.ts';

export {
  resolveNearsyFirebaseEnvLabel,
  resolveNearsyDevClientFlag,
  type NearsyFirebaseEnvLabel,
  type NearsyFirebaseEnvExtras,
};

function readExpoExtras(): NearsyFirebaseEnvExtras {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants =
      require('expo-constants').default ?? require('expo-constants');
    return (Constants.expoConfig?.extra ?? {}) as NearsyFirebaseEnvExtras;
  } catch {
    return {};
  }
}

/**
 * True when Expo extras select Development Firebase (nearsy-dev).
 */
export function isNearsyFirebaseDevelopment(): boolean {
  return resolveNearsyFirebaseEnvLabel(readExpoExtras()) === 'development';
}

/**
 * J01 environment foundation: LinkedIn A3 is allowed for valid
 * development↔nearsy-dev and production↔nearsy-pj pairs.
 * Callers must still enforce App Check readiness before callables.
 */
export function isNearsyLinkedInAuthAllowed(): boolean {
  try {
    const resolution = resolveNearsyAndroidEnvironment({
      extras: readExpoExtras(),
      isJsDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
    });
    return resolution.ok && resolution.config.linkedInAuthEnabled === true;
  } catch {
    return false;
  }
}

/** Sanitized runtime config for diagnostics (no secrets). */
export function getAndroidRuntimeConfigSnapshot(): AndroidRuntimeConfigSnapshot {
  const resolution = resolveNearsyAndroidEnvironment({
    extras: readExpoExtras(),
    isJsDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  });
  return buildAndroidRuntimeConfigSnapshot(resolution);
}
