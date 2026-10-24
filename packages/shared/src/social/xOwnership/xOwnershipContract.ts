/**
 * NEARSY-209 X ownership — Identity client contract (per mode).
 * No channel picker. Never log verifier, codes, or authorizationUrl.
 */

import type { ProfileMode } from '../../profile/profileModeFields.ts';

export const X_OWNERSHIP_PLATFORM = 'x' as const;
export type XOwnershipMobilePlatform = 'android' | 'ios';
export const X_OWNERSHIP_MOBILE_PLATFORM_ANDROID =
  'android' as const satisfies XOwnershipMobilePlatform;
export const X_OWNERSHIP_RETURN_URL = 'nearsy://x-ownership' as const;
export const X_OWNERSHIP_CLIENT_PROOF_METHOD = 'S256' as const;

export const X_OWNERSHIP_START = 'xOwnershipStart' as const;
export const X_OWNERSHIP_EXCHANGE = 'xOwnershipExchange' as const;
export const X_OWNERSHIP_GET = 'xOwnershipGet' as const;
export const X_OWNERSHIP_UNLINK = 'xOwnershipUnlink' as const;

export const X_TX_STORAGE_KEY = 'nearsy.x.ownership.tx.v1' as const;

export const MIN_CLIENT_PROOF_VERIFIER_LEN = 43;
export const MAX_CLIENT_PROOF_VERIFIER_LEN = 128;
export const MIN_CLIENT_PROOF_CHALLENGE_LEN = 43;
export const MAX_CLIENT_PROOF_CHALLENGE_LEN = 128;
export const MIN_TRANSACTION_ID_LEN = 8;
export const MAX_TRANSACTION_ID_LEN = 128;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export type XOwnershipMode = ProfileMode;

export type XOwnershipStartRequest = {
  mode: XOwnershipMode;
  platform: XOwnershipMobilePlatform;
  clientProofChallenge: string;
  clientProofMethod: typeof X_OWNERSHIP_CLIENT_PROOF_METHOD;
};

export type XOwnershipStartResponse = {
  transactionId: string;
  mode: XOwnershipMode;
  authorizationUrl: string;
  expiresAt: number;
};

export type XOwnershipExchangeRequest = {
  transactionId: string;
  clientProofVerifier: string;
};

export type XOwnershipVerified = {
  result: 'verified';
  platform: typeof X_OWNERSHIP_PLATFORM;
  mode: XOwnershipMode;
  userId: string;
  canonicalUrl: string;
  usernameCache: string | null;
  verifiedAt: string;
};

export type XOwnershipGetNotLinked = {
  result: 'not_linked';
  platform: typeof X_OWNERSHIP_PLATFORM;
  mode: XOwnershipMode;
  linked: false;
};

export type XOwnershipGetResponse =
  | XOwnershipVerified
  | XOwnershipGetNotLinked;

export type XOwnershipUnlinkResponse = {
  result: 'unlinked';
  platform: typeof X_OWNERSHIP_PLATFORM;
  mode: XOwnershipMode;
  unlinked: true;
};

export const X_OWNERSHIP_ERROR_CODES = [
  'x-not-enabled',
  'x-no-account',
  'x-account-claimed',
  'x-oauth-failed',
  'x-rate-limited',
  'x-credits-or-access',
  'x-api-forbidden',
  'X_OAUTH',
  'X_RATE_LIMITED',
  'X_CREDITS_OR_ACCESS',
  'X_FORBIDDEN',
  'TX_EXPIRED',
  'TX_INVALID',
  'TX_FAILED',
  'CLIENT_PROOF_INVALID',
  'unauthenticated',
] as const;

export type XOwnershipErrorCode =
  (typeof X_OWNERSHIP_ERROR_CODES)[number];

export type XStoredTransaction = {
  version: 1;
  transactionId: string;
  clientProofVerifier: string;
  createdAt: number;
  expiresAt: number;
  uid: string;
  mode: XOwnershipMode;
};
