/**
 * Maps Nearsy environment App Check kind → RNFB Apple provider options.
 * Pure module — no Firebase SDK imports.
 */

import type { AppCheckProviderKind } from '../environment/nearsyFirebaseEnvironment';

export const RNFB_APPLE_DEBUG_PROVIDER = 'debug' as const;
export const RNFB_APPLE_PRODUCTION_PROVIDER =
  'appAttestWithDeviceCheckFallback' as const;

export type RnfbAppleAppCheckProviderName =
  | typeof RNFB_APPLE_DEBUG_PROVIDER
  | typeof RNFB_APPLE_PRODUCTION_PROVIDER;

export type AppleAppCheckProviderConfig = {
  provider: RnfbAppleAppCheckProviderName;
  debugToken?: string;
};

export type ResolveAppleAppCheckProviderConfigInput = {
  appCheckProvider: AppCheckProviderKind | string;
  debugToken?: string | null;
};

export class AppleAppCheckProviderConfigError extends Error {
  readonly code:
    | 'APP_CHECK_DEBUG_TOKEN_MISSING'
    | 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN'
    | 'APP_CHECK_PROVIDER_UNSUPPORTED';

  constructor(
    code: AppleAppCheckProviderConfigError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'AppleAppCheckProviderConfigError';
    this.code = code;
  }
}

/**
 * Fail-closed resolver for RNFB `ReactNativeFirebaseAppCheckProvider` Apple options.
 */
export function resolveAppleAppCheckProviderConfig(
  input: ResolveAppleAppCheckProviderConfigInput,
): AppleAppCheckProviderConfig {
  const kind = String(input.appCheckProvider ?? '').trim();
  const debugToken =
    typeof input.debugToken === 'string' && input.debugToken.trim()
      ? input.debugToken.trim()
      : undefined;

  if (kind === 'debug') {
    if (!debugToken) {
      throw new AppleAppCheckProviderConfigError(
        'APP_CHECK_DEBUG_TOKEN_MISSING',
        'App Check debug provider requires a debug token.',
      );
    }
    return {
      provider: RNFB_APPLE_DEBUG_PROVIDER,
      debugToken,
    };
  }

  if (kind === 'production') {
    if (debugToken) {
      throw new AppleAppCheckProviderConfigError(
        'APP_CHECK_DEBUG_TOKEN_FORBIDDEN',
        'App Check production provider must not use a debug token.',
      );
    }
    return {
      provider: RNFB_APPLE_PRODUCTION_PROVIDER,
    };
  }

  throw new AppleAppCheckProviderConfigError(
    'APP_CHECK_PROVIDER_UNSUPPORTED',
    'App Check provider is not supported for this environment.',
  );
}
