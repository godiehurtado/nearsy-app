/**
 * Non-Android stub — Sign-in methods is Android-only (ENH-AUTH-LINK-01).
 * The type-only import keeps signatures in parity and is erased at runtime.
 */
import type * as AccountLinkSessionAndroid from './accountLinkSession.android';

type AccountLinkSessionApi = typeof AccountLinkSessionAndroid;

export const getAccountLinkUserSnapshot: AccountLinkSessionApi['getAccountLinkUserSnapshot'] =
  () => null;

export const reloadAccountLinkUser: AccountLinkSessionApi['reloadAccountLinkUser'] =
  async () => null;
