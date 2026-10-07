/**
 * Non-Android stub — Facebook account linking is Android-only (ENH-AUTH-LINK-01).
 * The type-only import keeps signatures in parity and is erased at runtime.
 */
import type * as FacebookAccountLinkingAndroid from './facebookAccountLinking.android';

type FacebookAccountLinkingApi = typeof FacebookAccountLinkingAndroid;

export const createFacebookAccountLinker: FacebookAccountLinkingApi['createFacebookAccountLinker'] =
  () => async () => ({
    status: 'failed',
    code: 'NOT_CONFIGURED',
    diagnosticCode: 'UNSUPPORTED_PLATFORM',
  });
