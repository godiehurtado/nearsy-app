/**
 * Maps Android App Check kind → RNFB Android provider options (J01).
 * Pure module — no Firebase SDK imports.
 */

import type { AndroidAppCheckProviderKind } from './nearsyAndroidEnvironment.ts';

export const RNFB_ANDROID_DEBUG_PROVIDER = 'debug' as const;
export const RNFB_ANDROID_PRODUCTION_PROVIDER = 'playIntegrity' as const;

export type RnfbAndroidAppCheckProviderName =
  | typeof RNFB_ANDROID_DEBUG_PROVIDER
  | typeof RNFB_ANDROID_PRODUCTION_PROVIDER;

export type AndroidAppCheckProviderConfig = {
  provider: RnfbAndroidAppCheckProviderName;
  /** Never set for production. Optional for debug (logcat registration path). */
  debugToken?: string;
};

export type ResolveAndroidAppCheckProviderConfigInput = {
  appCheckProvider: AndroidAppCheckProviderKind | string;
  debugToken?: string | null;
};

export class AndroidAppCheckProviderConfigError extends Error {
  readonly code:
    | 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN'
    | 'APP_CHECK_PROVIDER_UNSUPPORTED';

  constructor(
    code: AndroidAppCheckProviderConfigError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'AndroidAppCheckProviderConfigError';
    this.code = code;
  }
}

/**
 * Fail-closed resolver for RNFB ReactNativeFirebaseAppCheckProvider Android options.
 *
 * Debug token embedding is optional on Android (existing Nearsy path registers
 * the logcat token in Firebase Console). Production must use Play Integrity
 * and must never carry a debug token.
 */
export function resolveAndroidAppCheckProviderConfig(
  input: ResolveAndroidAppCheckProviderConfigInput,
): AndroidAppCheckProviderConfig {
  const kind = String(input.appCheckProvider ?? '').trim();
  const debugToken =
    typeof input.debugToken === 'string' && input.debugToken.trim()
      ? input.debugToken.trim()
      : undefined;

  if (kind === 'debug') {
    return debugToken
      ? { provider: RNFB_ANDROID_DEBUG_PROVIDER, debugToken }
      : { provider: RNFB_ANDROID_DEBUG_PROVIDER };
  }

  if (kind === 'production') {
    if (debugToken) {
      throw new AndroidAppCheckProviderConfigError(
        'APP_CHECK_DEBUG_TOKEN_FORBIDDEN',
        'App Check production provider must not use a debug token.',
      );
    }
    return { provider: RNFB_ANDROID_PRODUCTION_PROVIDER };
  }

  throw new AndroidAppCheckProviderConfigError(
    'APP_CHECK_PROVIDER_UNSUPPORTED',
    'App Check provider is not supported for this environment.',
  );
}
