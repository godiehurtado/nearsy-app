import type { SocialAuthenticationProviderAdapter } from '../../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../../domain/providerAuthenticationResult';
import type { SocialAuthenticationRequest } from '../../domain/socialAuthProvider';
import {
  createSocialAuthError,
  mapUnknownProviderError,
  messageKeyForCode,
  SocialAuthError,
} from '../../domain/socialAuthenticationError';

/** Testable surface for Apple Sign-In native module. */
export type AppleAuthenticationClient = {
  isAvailableAsync: () => Promise<boolean>;
  signInAsync: (options: {
    requestedScopes: unknown[];
    nonce: string;
  }) => Promise<{
    user: string;
    identityToken: string | null;
    email?: string | null;
    fullName?: {
      givenName?: string | null;
      familyName?: string | null;
      nickname?: string | null;
    } | null;
    authorizationCode?: string | null;
  }>;
  AppleAuthenticationScope: {
    FULL_NAME: unknown;
    EMAIL: unknown;
  };
};

export type AppleCryptoClient = {
  digestStringAsync: (
    algorithm: unknown,
    data: string,
  ) => Promise<string>;
  CryptoDigestAlgorithm: { SHA256: unknown };
  /** Cryptographically secure RNG (expo-crypto getRandomBytesAsync). */
  getRandomBytesAsync: (byteCount: number) => Promise<Uint8Array>;
};

export type AppleProviderAdapterDeps = {
  appleAuth?: AppleAuthenticationClient;
  crypto?: AppleCryptoClient;
  /**
   * Optional deterministic override for tests.
   * Production path always uses expo-crypto getRandomBytesAsync.
   */
  createRawNonce?: () => string | Promise<string>;
  platformOS?: string;
};

/** Fixed length raw nonce for Apple → Firebase credential pairing. */
export const APPLE_RAW_NONCE_LENGTH = 32;

/** Unbiased alphanumeric alphabet (Apple/Firebase compatible). */
export const APPLE_RAW_NONCE_CHARSET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function nonceGenerationFailedError(): SocialAuthError {
  return createSocialAuthError({
    code: 'CONFIGURATION_ERROR',
    provider: 'apple',
    recoverable: false,
    messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
    diagnosticCode: 'APPLE_NONCE_GENERATION_FAILED',
  });
}

/**
 * Cryptographically secure raw nonce via expo-crypto getRandomBytesAsync.
 * Rejection sampling avoids modulo bias for the 62-char alphabet.
 * Never falls back to weak PRNG or wall-clock seeding.
 */
async function createSecureRawNonce(
  crypto: AppleCryptoClient,
): Promise<string> {
  if (typeof crypto.getRandomBytesAsync !== 'function') {
    throw nonceGenerationFailedError();
  }

  const charset = APPLE_RAW_NONCE_CHARSET;
  const charsetLength = charset.length;
  const unbiasedLimit = Math.floor(256 / charsetLength) * charsetLength;
  const chars: string[] = [];

  try {
    while (chars.length < APPLE_RAW_NONCE_LENGTH) {
      const bytes = await crypto.getRandomBytesAsync(64);
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
        throw new Error('empty_random_bytes');
      }
      for (let i = 0; i < bytes.length; i += 1) {
        const value = bytes[i]!;
        if (value < unbiasedLimit) {
          chars.push(charset[value % charsetLength]!);
          if (chars.length === APPLE_RAW_NONCE_LENGTH) {
            break;
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof SocialAuthError) throw err;
    throw nonceGenerationFailedError();
  }

  return chars.join('');
}

function resolvePlatformOS(override?: string): string {
  if (override) return override;
  try {
    // Lazy require keeps Node unit tests free of react-native resolution.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as { Platform?: { OS?: string } };
    return rn.Platform?.OS ?? 'ios';
  } catch {
    return 'ios';
  }
}

function mapDisplayName(fullName: {
  givenName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
} | null | undefined): string | undefined {
  if (!fullName) return undefined;
  const given = fullName.givenName?.trim() ?? '';
  const family = fullName.familyName?.trim() ?? '';
  if (given || family) {
    return [given, family].filter(Boolean).join(' ');
  }
  const nick = fullName.nickname?.trim();
  return nick || undefined;
}

function mapAppleError(err: unknown): SocialAuthError {
  if (err instanceof SocialAuthError) return err;

  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

  if (
    code === 'ERR_REQUEST_CANCELED' ||
    code === 'ERR_CANCELED' ||
    code === 'ERR_REQUEST_UNKNOWN'
  ) {
    if (code === 'ERR_REQUEST_UNKNOWN') {
      const message =
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '';
      if (!/cancel/i.test(message)) {
        return mapUnknownProviderError('apple', err);
      }
    }
    return createSocialAuthError({
      code: 'CANCELLED',
      provider: 'apple',
      recoverable: true,
      messageKey: messageKeyForCode('CANCELLED'),
      diagnosticCode: code,
    });
  }

  return mapUnknownProviderError('apple', err);
}

function resolveDefaultAppleAuth(): AppleAuthenticationClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-apple-authentication') as AppleAuthenticationClient;
}

function resolveDefaultCrypto(): AppleCryptoClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-crypto') as AppleCryptoClient;
}

/**
 * Apple Sign-In provider adapter (iOS).
 * Does not exchange Firebase credentials — returns identityToken + rawNonce only.
 */
export function createAppleProviderAdapter(
  deps: AppleProviderAdapterDeps = {},
): SocialAuthenticationProviderAdapter {
  const platformOS = resolvePlatformOS(deps.platformOS);

  return {
    provider: 'apple',

    async isAvailable() {
      if (platformOS !== 'ios') return false;
      try {
        const appleAuth = deps.appleAuth ?? resolveDefaultAppleAuth();
        return await appleAuth.isAvailableAsync();
      } catch {
        return false;
      }
    },

    async configure() {
      if (platformOS !== 'ios') {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'APPLE_NOT_IOS',
        });
      }
    },

    async authenticate(
      _request: SocialAuthenticationRequest,
    ): Promise<ProviderAuthenticationResult> {
      if (platformOS !== 'ios') {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'APPLE_NOT_IOS',
        });
      }

      const appleAuth = deps.appleAuth ?? resolveDefaultAppleAuth();
      const crypto = deps.crypto ?? resolveDefaultCrypto();

      let available = false;
      try {
        available = await appleAuth.isAvailableAsync();
      } catch {
        available = false;
      }

      if (!available) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'APPLE_UNAVAILABLE',
        });
      }

      let rawNonce: string;
      try {
        if (deps.createRawNonce) {
          rawNonce = String(await deps.createRawNonce()).trim();
        } else {
          rawNonce = (await createSecureRawNonce(crypto)).trim();
        }
      } catch (err) {
        if (err instanceof SocialAuthError) throw err;
        throw nonceGenerationFailedError();
      }

      if (!rawNonce) {
        throw createSocialAuthError({
          code: 'CONFIGURATION_ERROR',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
          diagnosticCode: 'APPLE_NONCE_EMPTY',
        });
      }

      const hashedNonce = await crypto.digestStringAsync(
        crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      try {
        const result = await appleAuth.signInAsync({
          requestedScopes: [
            appleAuth.AppleAuthenticationScope.FULL_NAME,
            appleAuth.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });

        if (!result.identityToken?.trim()) {
          throw createSocialAuthError({
            code: 'TOKEN_MISSING',
            provider: 'apple',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_MISSING'),
            diagnosticCode: 'IDENTITY_TOKEN_MISSING',
          });
        }

        if (!result.user?.trim()) {
          throw createSocialAuthError({
            code: 'TOKEN_INVALID',
            provider: 'apple',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_INVALID'),
            diagnosticCode: 'APPLE_USER_ID_MISSING',
          });
        }

        const givenName = result.fullName?.givenName?.trim() || undefined;
        const familyName = result.fullName?.familyName?.trim() || undefined;
        const displayName = mapDisplayName(result.fullName);
        const email = result.email?.trim() || undefined;

        return {
          provider: 'apple',
          providerUserId: result.user,
          idToken: result.identityToken,
          rawNonce,
          authorizationCode: result.authorizationCode ?? undefined,
          email,
          emailVerified: email ? true : undefined,
          displayName,
          givenName,
          familyName,
        };
      } catch (err) {
        throw mapAppleError(err);
      }
    },
  };
}
