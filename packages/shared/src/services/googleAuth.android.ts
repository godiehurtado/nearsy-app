/**
 * Android Google Sign-In foundation (TS-006).
 *
 * Prepares native Google Sign-In configuration and availability checks for
 * TS-007. Does not wire Login UI, Firebase credential exchange, or session
 * establishment.
 */
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

export type GoogleAuthFoundationErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'MISSING_WEB_CLIENT_ID'
  | 'NATIVE_MODULE_UNAVAILABLE'
  | 'PLAY_SERVICES_UNAVAILABLE'
  | 'CONFIGURATION_FAILED'
  | 'SIGN_IN_CANCELLED'
  | 'SIGN_IN_IN_PROGRESS'
  | 'SIGN_IN_FAILED'
  | 'MISSING_ID_TOKEN';

export class GoogleAuthFoundationError extends Error {
  readonly code: GoogleAuthFoundationErrorCode;
  readonly cause?: unknown;

  constructor(
    code: GoogleAuthFoundationErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'GoogleAuthFoundationError';
    this.code = code;
    this.cause = cause;
  }
}

export type GoogleIdTokenResult = {
  idToken: string;
  email: string | null;
  /** Google account display name (`user.name`), when available. */
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  /** HTTPS profile photo URL from Google, when available. */
  photoUrl: string | null;
  userId: string;
};

type ConfigureState = {
  configured: boolean;
  webClientId: string | null;
};

const state: ConfigureState = {
  configured: false,
  webClientId: null,
};

function assertAndroid(): void {
  if (Platform.OS !== 'android') {
    throw new GoogleAuthFoundationError(
      'UNSUPPORTED_PLATFORM',
      'Google Auth foundation is only available on Android.',
    );
  }
}

/**
 * Reads the Firebase Web OAuth client ID used as GoogleSignin `webClientId`.
 * Expected EAS / local env: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 */
export function getGoogleWebClientId(): string | null {
  const value = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return value ? value : null;
}

export function isGoogleSignInNativeModuleAvailable(): boolean {
  try {
    return typeof GoogleSignin?.configure === 'function';
  } catch {
    return false;
  }
}

/**
 * Idempotent, lazy Google Sign-In configuration.
 * Safe to call multiple times; reconfigures only when webClientId changes.
 */
export function ensureGoogleSignInConfigured(): string {
  assertAndroid();

  if (!isGoogleSignInNativeModuleAvailable()) {
    throw new GoogleAuthFoundationError(
      'NATIVE_MODULE_UNAVAILABLE',
      'Google Sign-In native module is unavailable. Rebuild the Android development client after installing @react-native-google-signin/google-signin.',
    );
  }

  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    throw new GoogleAuthFoundationError(
      'MISSING_WEB_CLIENT_ID',
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Set the Firebase Web OAuth client ID (client_type 3) in the environment.',
    );
  }

  if (state.configured && state.webClientId === webClientId) {
    return webClientId;
  }

  try {
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
      scopes: [...GOOGLE_SCOPES],
    });
  } catch (cause) {
    state.configured = false;
    state.webClientId = null;
    throw new GoogleAuthFoundationError(
      'CONFIGURATION_FAILED',
      'Failed to configure Google Sign-In.',
      cause,
    );
  }

  state.configured = true;
  state.webClientId = webClientId;
  return webClientId;
}

export async function ensureGooglePlayServicesAvailable(
  showPlayServicesUpdateDialog = true,
): Promise<boolean> {
  assertAndroid();
  ensureGoogleSignInConfigured();

  try {
    return await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog,
    });
  } catch (cause) {
    throw new GoogleAuthFoundationError(
      'PLAY_SERVICES_UNAVAILABLE',
      'Google Play Services are unavailable or outdated on this device.',
      cause,
    );
  }
}

export type GoogleSignInAvailability = {
  platform: 'android';
  nativeModuleAvailable: boolean;
  webClientIdConfigured: boolean;
  configured: boolean;
  playServicesAvailable: boolean | null;
};

/**
 * Non-throwing availability snapshot for foundation diagnostics.
 * Missing webClientId is reported as webClientIdConfigured=false.
 */
export async function getGoogleSignInAvailability(): Promise<GoogleSignInAvailability> {
  if (Platform.OS !== 'android') {
    return {
      platform: 'android',
      nativeModuleAvailable: false,
      webClientIdConfigured: false,
      configured: false,
      playServicesAvailable: null,
    };
  }

  const nativeModuleAvailable = isGoogleSignInNativeModuleAvailable();
  const webClientIdConfigured = Boolean(getGoogleWebClientId());

  let configured = false;
  let playServicesAvailable: boolean | null = null;

  if (nativeModuleAvailable && webClientIdConfigured) {
    try {
      ensureGoogleSignInConfigured();
      configured = true;
      playServicesAvailable = await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: false,
      });
    } catch {
      configured = false;
      playServicesAvailable = false;
    }
  }

  return {
    platform: 'android',
    nativeModuleAvailable,
    webClientIdConfigured,
    configured,
    playServicesAvailable,
  };
}

/**
 * Real Google account picker → ID token + safe identity fields for TS-007/TS-008.
 * Does not create a Firebase session.
 */
export async function requestGoogleIdToken(): Promise<GoogleIdTokenResult> {
  assertAndroid();
  ensureGoogleSignInConfigured();
  await ensureGooglePlayServicesAvailable(true);

  try {
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      throw new GoogleAuthFoundationError(
        'SIGN_IN_CANCELLED',
        'Google sign-in was cancelled.',
      );
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new GoogleAuthFoundationError(
        'MISSING_ID_TOKEN',
        'Google Sign-In succeeded but did not return an ID token. Verify EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is the Firebase Web client (client_type 3).',
      );
    }

    const profile = response.data.user;

    return {
      idToken,
      email: profile.email ?? null,
      displayName: profile.name ?? null,
      givenName: profile.givenName ?? null,
      familyName: profile.familyName ?? null,
      photoUrl: profile.photo ?? null,
      userId: profile.id,
    };
  } catch (cause) {
    if (cause instanceof GoogleAuthFoundationError) {
      throw cause;
    }

    if (isErrorWithCode(cause)) {
      if (cause.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new GoogleAuthFoundationError(
          'SIGN_IN_CANCELLED',
          'Google sign-in was cancelled.',
          cause,
        );
      }
      if (cause.code === statusCodes.IN_PROGRESS) {
        throw new GoogleAuthFoundationError(
          'SIGN_IN_IN_PROGRESS',
          'Google sign-in is already in progress.',
          cause,
        );
      }
      if (cause.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleAuthFoundationError(
          'PLAY_SERVICES_UNAVAILABLE',
          'Google Play Services are unavailable or outdated on this device.',
          cause,
        );
      }
    }

    throw new GoogleAuthFoundationError(
      'SIGN_IN_FAILED',
      'Google sign-in failed.',
      cause,
    );
  }
}

/** Test helper — resets lazy configure state. */
export function __resetGoogleSignInFoundationForTests(): void {
  state.configured = false;
  state.webClientId = null;
}
