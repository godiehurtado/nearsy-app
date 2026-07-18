import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import type { SocialAuthenticationProviderAdapter } from '../../application/socialAuthenticationPort';
import {
  validateGoogleAuthenticationConfiguration,
} from '../../application/configurationValidator';
import type { ProviderAuthenticationResult } from '../../domain/providerAuthenticationResult';
import type { SocialAuthenticationRequest } from '../../domain/socialAuthProvider';
import {
  createSocialAuthError,
  isRecoverableCode,
  mapUnknownProviderError,
  messageKeyForCode,
  SocialAuthError,
} from '../../domain/socialAuthenticationError';
import { resolveGoogleAuthenticationConfiguration } from './googleConfiguration';
import { GOOGLE_IOS_NATIVE_CONFIG } from './googleIosNativeConfig';

function assertConfigured(): void {
  const config = resolveGoogleAuthenticationConfiguration({
    plistBundleId: GOOGLE_IOS_NATIVE_CONFIG.bundleId,
    plistProjectId: GOOGLE_IOS_NATIVE_CONFIG.projectId,
    iosClientIdFromPlist: GOOGLE_IOS_NATIVE_CONFIG.iosClientId,
    iosUrlSchemeFromPlist: GOOGLE_IOS_NATIVE_CONFIG.iosUrlScheme,
  });

  const nativeModulePresent = typeof GoogleSignin?.configure === 'function';
  const validation = validateGoogleAuthenticationConfiguration(config, {
    nativeModulePresent,
  });

  if (!validation.ok) {
    const primary = validation.issues[0];
    throw createSocialAuthError({
      code: 'CONFIGURATION_ERROR',
      provider: 'google',
      recoverable: false,
      messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
      diagnosticCode: primary?.code ?? 'GOOGLE_CONFIG_MISSING',
    });
  }
}

function mapGoogleStatusCode(code: string | undefined): SocialAuthError | null {
  if (!code) return null;

  if (code === statusCodes.SIGN_IN_CANCELLED) {
    return createSocialAuthError({
      code: 'CANCELLED',
      provider: 'google',
      recoverable: true,
      messageKey: messageKeyForCode('CANCELLED'),
      diagnosticCode: 'SIGN_IN_CANCELLED',
    });
  }

  if (code === statusCodes.IN_PROGRESS) {
    return createSocialAuthError({
      code: 'IN_PROGRESS',
      provider: 'google',
      recoverable: true,
      messageKey: messageKeyForCode('IN_PROGRESS'),
      diagnosticCode: 'IN_PROGRESS',
    });
  }

  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return createSocialAuthError({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'google',
      recoverable: false,
      messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
      diagnosticCode: 'PLAY_SERVICES_NOT_AVAILABLE',
    });
  }

  return null;
}

export function createGoogleProviderAdapter(): SocialAuthenticationProviderAdapter {
  let configured = false;

  return {
    provider: 'google',

    async isAvailable() {
      try {
        assertConfigured();
        return typeof GoogleSignin?.configure === 'function';
      } catch (err) {
        if (err instanceof SocialAuthError) {
          return false;
        }
        return false;
      }
    },

    async configure() {
      const config = resolveGoogleAuthenticationConfiguration({
        plistBundleId: GOOGLE_IOS_NATIVE_CONFIG.bundleId,
        plistProjectId: GOOGLE_IOS_NATIVE_CONFIG.projectId,
        iosClientIdFromPlist: GOOGLE_IOS_NATIVE_CONFIG.iosClientId,
        iosUrlSchemeFromPlist: GOOGLE_IOS_NATIVE_CONFIG.iosUrlScheme,
      });

      const validation = validateGoogleAuthenticationConfiguration(config, {
        nativeModulePresent: typeof GoogleSignin?.configure === 'function',
      });

      if (!validation.ok) {
        throw createSocialAuthError({
          code: 'CONFIGURATION_ERROR',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
          diagnosticCode: validation.issues[0]?.code ?? 'GOOGLE_CONFIG_MISSING',
        });
      }

      GoogleSignin.configure({
        webClientId: config.webClientId,
        iosClientId: config.iosClientId,
        scopes: [...config.scopes],
        offlineAccess: false,
      });

      configured = true;
    },

    async authenticate(
      _request: SocialAuthenticationRequest,
    ): Promise<ProviderAuthenticationResult> {
      if (!configured) {
        await this.configure();
      }

      try {
        const response = await GoogleSignin.signIn();

        if (!isSuccessResponse(response)) {
          throw createSocialAuthError({
            code: 'CANCELLED',
            provider: 'google',
            recoverable: true,
            messageKey: messageKeyForCode('CANCELLED'),
            diagnosticCode: response.type,
          });
        }

        const user = response.data;
        let idToken = user.idToken ?? undefined;
        let accessToken: string | undefined;

        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens.idToken || idToken;
          accessToken = tokens.accessToken || undefined;
        } catch {
          // getTokens may fail; idToken from signIn is preferred for Firebase.
        }

        if (!idToken) {
          throw createSocialAuthError({
            code: 'TOKEN_MISSING',
            provider: 'google',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_MISSING'),
            diagnosticCode: 'ID_TOKEN_MISSING',
          });
        }

        if (!user.user.id) {
          throw createSocialAuthError({
            code: 'TOKEN_INVALID',
            provider: 'google',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_INVALID'),
            diagnosticCode: 'PROVIDER_USER_ID_MISSING',
          });
        }

        return {
          provider: 'google',
          providerUserId: user.user.id,
          idToken,
          accessToken,
          email: user.user.email ?? undefined,
          emailVerified: true,
          displayName: user.user.name ?? undefined,
          givenName: user.user.givenName ?? undefined,
          familyName: user.user.familyName ?? undefined,
          photoUrl: user.user.photo ?? undefined,
          grantedScopes: user.scopes,
        };
      } catch (err) {
        if (err instanceof SocialAuthError) {
          throw err;
        }

        if (isErrorWithCode(err)) {
          const mapped = mapGoogleStatusCode(err.code);
          if (mapped) throw mapped;
        }

        throw mapUnknownProviderError('google', err);
      }
    },

    async clearProviderSession() {
      try {
        await GoogleSignin.signOut();
      } catch (err) {
        if (err instanceof SocialAuthError && isRecoverableCode(err.social.code)) {
          return;
        }
        // Clearing a provider session is best-effort for foundation/logout prep.
      }
    },
  };
}
