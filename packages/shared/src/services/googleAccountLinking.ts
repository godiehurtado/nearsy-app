/**
 * Non-Android stub — Google account linking is Android-only (ENH-AUTH-LINK-01).
 * The type-only import keeps signatures in parity and is erased at runtime.
 */
import type * as GoogleAccountLinkingAndroid from './googleAccountLinking.android';

type GoogleAccountLinkingApi = typeof GoogleAccountLinkingAndroid;

export const isGoogleAccountLinkingConfigured: GoogleAccountLinkingApi['isGoogleAccountLinkingConfigured'] =
  () => false;

export const createGoogleAccountLinker: GoogleAccountLinkingApi['createGoogleAccountLinker'] =
  () => async () => ({
    status: 'failed',
    code: 'NOT_CONFIGURED',
    diagnosticCode: 'UNSUPPORTED_PLATFORM',
  });
