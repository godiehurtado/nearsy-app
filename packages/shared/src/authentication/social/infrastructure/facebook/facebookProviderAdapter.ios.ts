import type { SocialAuthenticationProviderAdapter } from '../../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../../domain/providerAuthenticationResult';
import type { SocialAuthenticationRequest } from '../../domain/socialAuthProvider';
import {
  createSocialAuthError,
  messageKeyForCode,
  SocialAuthError,
} from '../../domain/socialAuthenticationError';
import {
  createSecureRawNonce,
  sha256Hex,
  type SecureNonceCryptoClient,
} from '../crypto/secureRawNonce';
import {
  describeErrorForTrace,
  inspectLimitedLoginTokenForTrace,
  isFacebookAuthTraceEnabled,
  traceFacebookAuth,
} from '../../application/facebookAuthTrace';

/** Only permissions Nearsy requests from Facebook (no advanced permissions). */
export const FACEBOOK_LOGIN_PERMISSIONS: readonly string[] = Object.freeze([
  'public_profile',
  'email',
]);

export type FacebookLoginResult = {
  isCancelled: boolean;
  grantedPermissions?: string[] | null;
  declinedPermissions?: string[] | null;
};

export type FacebookProfile = {
  userID?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageURL?: string | null;
  email?: string | null;
};

/** Testable surface of react-native-fbsdk-next used by Nearsy. */
export type FacebookSdkClient = {
  Settings: { initializeSDK: () => void };
  LoginManager: {
    logInWithPermissions: (
      permissions: string[],
      loginTrackingIOS?: 'enabled' | 'limited',
      nonceIOS?: string,
    ) => Promise<FacebookLoginResult>;
    logOut: () => void;
  };
  AccessToken: {
    getCurrentAccessToken: () => Promise<{
      accessToken: string;
      userID: string;
    } | null>;
  };
  AuthenticationToken: {
    getAuthenticationTokenIOS: () => Promise<{
      authenticationToken: string;
      nonce?: string;
    } | null>;
  };
  Profile: { getCurrentProfile: () => Promise<FacebookProfile | null> };
};

export type FacebookProviderAdapterDeps = {
  sdk?: FacebookSdkClient;
  crypto?: SecureNonceCryptoClient;
  /** Deterministic override for tests; production uses expo-crypto. */
  createRawNonce?: () => string | Promise<string>;
  /** Public Meta App ID from Expo extra (EXPO_PUBLIC_FACEBOOK_APP_ID). */
  resolveAppId?: () => string | undefined;
  platformOS?: string;
};

function facebookError(
  code: 'CONFIGURATION_ERROR' | 'PROVIDER_UNAVAILABLE' | 'TOKEN_MISSING' | 'TOKEN_INVALID' | 'CANCELLED' | 'NETWORK_ERROR' | 'UNKNOWN',
  diagnosticCode: string,
): SocialAuthError {
  return createSocialAuthError({
    code,
    provider: 'facebook',
    recoverable: code === 'CANCELLED' || code === 'NETWORK_ERROR',
    messageKey: messageKeyForCode(code),
    diagnosticCode,
  });
}

function resolvePlatformOS(override?: string): string {
  if (override) return override;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as { Platform?: { OS?: string } };
    return rn.Platform?.OS ?? 'ios';
  } catch {
    return 'ios';
  }
}

function resolveDefaultSdk(): FacebookSdkClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-fbsdk-next') as FacebookSdkClient;
}

function resolveDefaultCrypto(): SecureNonceCryptoClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-crypto') as SecureNonceCryptoClient;
}

function resolveDefaultAppId(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-constants') as {
      default?: { expoConfig?: { extra?: Record<string, unknown> } };
    };
    const value = mod.default?.expoConfig?.extra?.EXPO_PUBLIC_FACEBOOK_APP_ID;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readErrorText(err: unknown): string {
  if (typeof err !== 'object' || err === null) return '';
  const e = err as {
    message?: unknown;
    domain?: unknown;
    userInfo?: { NSLocalizedDescription?: unknown } | null;
  };
  return [e.message, e.domain, e.userInfo?.NSLocalizedDescription]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}

/** Map native SDK failures to the social taxonomy without leaking payloads. */
export function mapFacebookSdkError(err: unknown): SocialAuthError {
  if (err instanceof SocialAuthError) return err;
  const text = readErrorText(err);
  if (/NSURLErrorDomain|network|offline|internet connection/i.test(text)) {
    return facebookError('NETWORK_ERROR', 'FACEBOOK_NETWORK');
  }
  if (/cancel/i.test(text)) {
    return facebookError('CANCELLED', 'FACEBOOK_CANCELLED');
  }
  return facebookError('UNKNOWN', 'FACEBOOK_SDK_ERROR');
}

/**
 * Facebook Login provider adapter (iOS, react-native-fbsdk-next).
 *
 * Requests only public_profile + email. Returns the classic Access Token when
 * the SDK provides one; otherwise (no ATT → Limited Login) returns the OIDC
 * authentication token paired with the raw nonce. Never exchanges Firebase
 * credentials, writes Firestore, or navigates.
 */
export function createFacebookProviderAdapter(
  deps: FacebookProviderAdapterDeps = {},
): SocialAuthenticationProviderAdapter {
  const platformOS = resolvePlatformOS(deps.platformOS);
  let sdkInitialized = false;

  const getSdk = (): FacebookSdkClient => {
    try {
      const sdk = deps.sdk ?? resolveDefaultSdk();
      if (typeof sdk?.LoginManager?.logInWithPermissions !== 'function') {
        throw new Error('fbsdk_native_module_missing');
      }
      return sdk;
    } catch {
      throw facebookError('PROVIDER_UNAVAILABLE', 'FACEBOOK_NATIVE_MODULE_MISSING');
    }
  };

  const assertConfigured = (): string => {
    if (platformOS !== 'ios') {
      throw facebookError('PROVIDER_UNAVAILABLE', 'FACEBOOK_NOT_IOS');
    }
    const appId = (deps.resolveAppId ?? resolveDefaultAppId)();
    if (!appId) {
      throw facebookError('CONFIGURATION_ERROR', 'FACEBOOK_APP_ID_MISSING');
    }
    return appId;
  };

  const configure = async (): Promise<FacebookSdkClient> => {
    assertConfigured();
    const sdk = getSdk();
    if (!sdkInitialized) {
      // FacebookAutoInitEnabled is false: initialize only when the user
      // explicitly starts Facebook Login.
      sdk.Settings.initializeSDK();
      sdkInitialized = true;
    }
    return sdk;
  };

  return {
    provider: 'facebook',

    async isAvailable() {
      try {
        assertConfigured();
        getSdk();
        return true;
      } catch {
        return false;
      }
    },

    async configure() {
      await configure();
    },

    async authenticate(
      _request: SocialAuthenticationRequest,
    ): Promise<ProviderAuthenticationResult> {
      const sdk = await configure();
      const appId = assertConfigured();
      const crypto = deps.crypto ?? resolveDefaultCrypto();

      let rawNonce: string;
      let hashedNonce: string;
      try {
        rawNonce = deps.createRawNonce
          ? String(await deps.createRawNonce()).trim()
          : await createSecureRawNonce(crypto);
        if (!rawNonce) throw new Error('empty_nonce');
        hashedNonce = await sha256Hex(crypto, rawNonce);
      } catch {
        throw facebookError('CONFIGURATION_ERROR', 'FACEBOOK_NONCE_GENERATION_FAILED');
      }

      try {
        // Drop any cached token so a stale or different Facebook identity is
        // never exchanged with Firebase.
        sdk.LoginManager.logOut();

        traceFacebookAuth('native_login_started', { platform: platformOS });
        const result = await sdk.LoginManager.logInWithPermissions(
          [...FACEBOOK_LOGIN_PERMISSIONS],
          'enabled',
          hashedNonce,
        );
        traceFacebookAuth('native_login_completed', {
          resultPresent: Boolean(result),
          isCancelled: Boolean(result?.isCancelled),
          emailGranted: Boolean(result?.grantedPermissions?.includes('email')),
          emailDeclined: Boolean(result?.declinedPermissions?.includes('email')),
        });

        if (!result || result.isCancelled) {
          traceFacebookAuth('cancelled');
          throw facebookError('CANCELLED', 'FACEBOOK_LOGIN_CANCELLED');
        }

        const accessToken = await sdk.AccessToken.getCurrentAccessToken().catch(
          () => null,
        );
        const classicToken = trimToUndefined(accessToken?.accessToken);
        traceFacebookAuth('access_token_present', { value: Boolean(classicToken) });

        let idToken: string | undefined;
        if (!classicToken) {
          const authToken = await sdk.AuthenticationToken
            .getAuthenticationTokenIOS()
            .catch((tokenErr: unknown) => {
              traceFacebookAuth('native_error', {
                step: 'get_authentication_token_ios',
                ...describeErrorForTrace(tokenErr),
              });
              return null;
            });
          idToken = trimToUndefined(authToken?.authenticationToken);
          const tokenNonce = trimToUndefined(authToken?.nonce);
          traceFacebookAuth('authentication_token_present', { value: Boolean(idToken) });
          traceFacebookAuth('nonce_present', {
            sdkNonce: Boolean(tokenNonce),
            rawNonce: Boolean(rawNonce),
          });
          traceFacebookAuth('nonce_match', {
            sdkNonceMatchesHash: tokenNonce === hashedNonce,
            rawNonceDiffersFromHash: rawNonce !== hashedNonce,
          });
          if (idToken && isFacebookAuthTraceEnabled()) {
            traceFacebookAuth(
              'token_claims_checked',
              inspectLimitedLoginTokenForTrace(idToken, { appId, hashedNonce }),
            );
          }
          if (idToken && tokenNonce && tokenNonce !== hashedNonce) {
            throw facebookError('TOKEN_INVALID', 'FACEBOOK_NONCE_MISMATCH');
          }
        }

        if (!classicToken && !idToken) {
          throw facebookError('TOKEN_MISSING', 'FACEBOOK_TOKEN_MISSING');
        }

        const profile = await sdk.Profile.getCurrentProfile().catch(() => null);
        const emailGranted =
          !result.declinedPermissions?.includes('email') &&
          (result.grantedPermissions?.includes('email') ?? true);

        return {
          provider: 'facebook',
          providerUserId:
            trimToUndefined(accessToken?.userID) ??
            trimToUndefined(profile?.userID) ??
            '',
          ...(classicToken
            ? { accessToken: classicToken }
            : { idToken, rawNonce }),
          email: emailGranted ? trimToUndefined(profile?.email) : undefined,
          displayName: trimToUndefined(profile?.name),
          givenName: trimToUndefined(profile?.firstName),
          familyName: trimToUndefined(profile?.lastName),
          photoUrl: trimToUndefined(profile?.imageURL),
          grantedScopes: result.grantedPermissions ?? undefined,
        };
      } catch (err) {
        if (!(err instanceof SocialAuthError)) {
          traceFacebookAuth('native_error', describeErrorForTrace(err));
        }
        // A cancelled, rejected or mismatched attempt must not leave a cached
        // Facebook token/profile behind for a later attempt to pick up.
        try {
          sdk.LoginManager.logOut();
        } catch {
          // Best-effort cleanup only.
        }
        throw mapFacebookSdkError(err);
      }
    },

    async clearProviderSession() {
      try {
        getSdk().LoginManager.logOut();
      } catch {
        // Idempotent best-effort: no Facebook session or SDK unavailable.
      }
    },
  };
}
