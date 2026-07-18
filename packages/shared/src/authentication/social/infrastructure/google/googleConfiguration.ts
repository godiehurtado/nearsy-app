import Constants from 'expo-constants';
import {
  CANONICAL_FIREBASE_PROJECT_ID,
  CANONICAL_IOS_BUNDLE_ID,
  GOOGLE_DEFAULT_SCOPES,
  type GoogleAuthenticationConfiguration,
} from '../../application/configurationValidator';

type Extra = Record<string, unknown>;

function readExtra(): Extra {
  return (
    (Constants.expoConfig?.extra as Extra | undefined) ??
    ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as
      | Extra
      | undefined) ??
    {}
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Build Google configuration from Expo public config.
 * Plist-derived values are supplied by the caller after reading the active plist
 * metadata (never logged as secrets).
 */
export function resolveGoogleAuthenticationConfiguration(options?: {
  plistBundleId?: string;
  plistProjectId?: string;
  iosClientIdFromPlist?: string;
  iosUrlSchemeFromPlist?: string;
  enabled?: boolean;
}): GoogleAuthenticationConfiguration {
  const extra = readExtra();

  const webClientId = asString(extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  const iosClientId =
    asString(extra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) ??
    options?.iosClientIdFromPlist;
  const iosUrlScheme =
    asString(extra.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME) ??
    options?.iosUrlSchemeFromPlist;

  return {
    enabled: options?.enabled ?? true,
    webClientId,
    iosClientId,
    iosUrlScheme,
    expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
    plistBundleId: options?.plistBundleId,
    plistProjectId: options?.plistProjectId ?? CANONICAL_FIREBASE_PROJECT_ID,
    scopes: GOOGLE_DEFAULT_SCOPES,
  };
}
