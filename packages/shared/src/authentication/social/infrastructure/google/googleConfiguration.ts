import Constants from 'expo-constants';
import {
  CANONICAL_IOS_BUNDLE_ID,
  FIREBASE_PROJECT_ID_PRODUCTION,
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
 * Client IDs must come from environment (EAS / app config), never from
 * hardcoded Ops fallbacks.
 */
export function resolveGoogleAuthenticationConfiguration(options?: {
  plistBundleId?: string;
  plistProjectId?: string;
  enabled?: boolean;
}): GoogleAuthenticationConfiguration {
  const extra = readExtra();

  const webClientId = asString(extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  const iosClientId = asString(extra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const iosUrlScheme = asString(extra.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME);
  const firebaseEnvironmentProjectId =
    asString(extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ??
    FIREBASE_PROJECT_ID_PRODUCTION;

  return {
    enabled: options?.enabled ?? true,
    webClientId,
    iosClientId,
    iosUrlScheme,
    expectedIosBundleId: CANONICAL_IOS_BUNDLE_ID,
    plistBundleId: options?.plistBundleId,
    plistProjectId: options?.plistProjectId ?? firebaseEnvironmentProjectId,
    firebaseEnvironmentProjectId,
    scopes: GOOGLE_DEFAULT_SCOPES,
  };
}
