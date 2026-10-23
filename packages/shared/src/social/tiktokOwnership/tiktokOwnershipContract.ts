/**
 * NEARSY-209 TikTok ownership — Identity client contract (per mode).
 * No channel picker. Never log verifier, codes, or authorizationUrl.
 */

import type { ProfileMode } from '../../profile/profileModeFields.ts';

export const TIKTOK_OWNERSHIP_PLATFORM = 'tiktok' as const;
export type TiktokOwnershipMobilePlatform = 'android' | 'ios';
export const TIKTOK_OWNERSHIP_MOBILE_PLATFORM_ANDROID =
  'android' as const satisfies TiktokOwnershipMobilePlatform;
export const TIKTOK_OWNERSHIP_RETURN_URL = 'nearsy://tiktok-ownership' as const;
export const TIKTOK_OWNERSHIP_CLIENT_PROOF_METHOD = 'S256' as const;

export const TIKTOK_OWNERSHIP_START = 'tiktokOwnershipStart' as const;
export const TIKTOK_OWNERSHIP_EXCHANGE = 'tiktokOwnershipExchange' as const;
export const TIKTOK_OWNERSHIP_GET = 'tiktokOwnershipGet' as const;
export const TIKTOK_OWNERSHIP_UNLINK = 'tiktokOwnershipUnlink' as const;

export const TIKTOK_TX_STORAGE_KEY = 'nearsy.tiktok.ownership.tx.v1' as const;

export const MIN_CLIENT_PROOF_VERIFIER_LEN = 43;
export const MAX_CLIENT_PROOF_VERIFIER_LEN = 128;
export const MIN_CLIENT_PROOF_CHALLENGE_LEN = 43;
export const MAX_CLIENT_PROOF_CHALLENGE_LEN = 128;
export const MIN_TRANSACTION_ID_LEN = 8;
export const MAX_TRANSACTION_ID_LEN = 128;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export type TiktokOwnershipMode = ProfileMode;

export type TiktokOwnershipStartRequest = {
  mode: TiktokOwnershipMode;
  platform: TiktokOwnershipMobilePlatform;
  clientProofChallenge: string;
  clientProofMethod: typeof TIKTOK_OWNERSHIP_CLIENT_PROOF_METHOD;
};

export type TiktokOwnershipStartResponse = {
  transactionId: string;
  mode: TiktokOwnershipMode;
  authorizationUrl: string;
  expiresAt: number;
};

export type TiktokOwnershipExchangeRequest = {
  transactionId: string;
  clientProofVerifier: string;
};

export type TiktokOwnershipVerified = {
  result: 'verified';
  platform: typeof TIKTOK_OWNERSHIP_PLATFORM;
  mode: TiktokOwnershipMode;
  openId: string;
  canonicalUrl: string;
  usernameCache: string | null;
  verifiedAt: string;
};

export type TiktokOwnershipGetNotLinked = {
  result: 'not_linked';
  platform: typeof TIKTOK_OWNERSHIP_PLATFORM;
  mode: TiktokOwnershipMode;
  linked: false;
};

export type TiktokOwnershipGetResponse =
  | TiktokOwnershipVerified
  | TiktokOwnershipGetNotLinked;

export type TiktokOwnershipUnlinkResponse = {
  result: 'unlinked';
  platform: typeof TIKTOK_OWNERSHIP_PLATFORM;
  mode: TiktokOwnershipMode;
  unlinked: true;
};

export const TIKTOK_OWNERSHIP_ERROR_CODES = [
  'tiktok-not-enabled',
  'tiktok-no-account',
  'tiktok-account-claimed',
  'TX_EXPIRED',
  'TX_INVALID',
  'TX_FAILED',
  'CLIENT_PROOF_INVALID',
  'unauthenticated',
] as const;

export type TiktokOwnershipErrorCode =
  (typeof TIKTOK_OWNERSHIP_ERROR_CODES)[number];

export type TiktokStoredTransaction = {
  version: 1;
  transactionId: string;
  clientProofVerifier: string;
  createdAt: number;
  expiresAt: number;
  uid: string;
  mode: TiktokOwnershipMode;
};
