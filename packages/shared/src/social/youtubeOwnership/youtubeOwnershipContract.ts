/**
 * NEARSY-209 YouTube ownership — client contract (Functions Identity).
 * Ownership is per profile mode (personal | professional). Do not invent fields.
 * Never log verifier, codes, or authorizationUrl.
 * Publication toggles are removed — ownership is per mode only.
 */

import type { ProfileMode } from '../../profile/profileModeFields.ts';

/** Network id in verified/get/unlink responses (not the Start `platform` field). */
export const YOUTUBE_OWNERSHIP_PLATFORM = 'youtube' as const;
/**
 * Mobile OS for Start — Identity validates `android` | `ios` only.
 */
export type YoutubeOwnershipMobilePlatform = 'android' | 'ios';
export const YOUTUBE_OWNERSHIP_MOBILE_PLATFORM_ANDROID =
  'android' as const satisfies YoutubeOwnershipMobilePlatform;
export const YOUTUBE_OWNERSHIP_RETURN_URL = 'nearsy://youtube-ownership' as const;
export const YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD = 'S256' as const;

export const YOUTUBE_OWNERSHIP_START = 'youtubeOwnershipStart' as const;
export const YOUTUBE_OWNERSHIP_EXCHANGE = 'youtubeOwnershipExchange' as const;
export const YOUTUBE_OWNERSHIP_SELECT_CHANNEL =
  'youtubeOwnershipSelectChannel' as const;
export const YOUTUBE_OWNERSHIP_GET = 'youtubeOwnershipGet' as const;
export const YOUTUBE_OWNERSHIP_UNLINK = 'youtubeOwnershipUnlink' as const;

export const YOUTUBE_TX_STORAGE_KEY = 'nearsy.youtube.ownership.tx.v1' as const;

export const MIN_CLIENT_PROOF_VERIFIER_LEN = 43;
export const MAX_CLIENT_PROOF_VERIFIER_LEN = 128;
export const MIN_CLIENT_PROOF_CHALLENGE_LEN = 43;
export const MAX_CLIENT_PROOF_CHALLENGE_LEN = 128;
export const MIN_TRANSACTION_ID_LEN = 8;
export const MAX_TRANSACTION_ID_LEN = 128;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export type YoutubeOwnershipMode = ProfileMode;

export type YoutubeOwnershipStartRequest = {
  mode: YoutubeOwnershipMode;
  platform: YoutubeOwnershipMobilePlatform;
  /** BASE64URL(SHA256(utf8(verifier))), length 43–128, charset [A-Za-z0-9_-]. */
  clientProofChallenge: string;
  clientProofMethod: typeof YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD;
};

export type YoutubeOwnershipStartResponse = {
  transactionId: string;
  mode: YoutubeOwnershipMode;
  authorizationUrl: string;
  expiresAt: number;
};

/** Exchange must not include `mode` — it is bound to the transaction by Start. */
export type YoutubeOwnershipExchangeRequest = {
  transactionId: string;
  clientProofVerifier: string;
};

export type YoutubeOwnershipChannelCandidate = {
  channelId: string;
  title?: string;
  canonicalUrl?: string;
  customUrlCache?: string | null;
};

export type YoutubeOwnershipVerified = {
  result: 'verified';
  platform: typeof YOUTUBE_OWNERSHIP_PLATFORM;
  mode: YoutubeOwnershipMode;
  channelId: string;
  canonicalUrl: string;
  customUrlCache: string | null;
  verifiedAt: string;
};

export type YoutubeOwnershipSelectChannelResponse = {
  result: 'select_channel';
  platform: typeof YOUTUBE_OWNERSHIP_PLATFORM;
  mode: YoutubeOwnershipMode;
  transactionId: string;
  channels: YoutubeOwnershipChannelCandidate[];
};

export type YoutubeOwnershipExchangeResponse =
  | YoutubeOwnershipVerified
  | YoutubeOwnershipSelectChannelResponse;

/** SelectChannel must not include `mode`. */
export type YoutubeOwnershipSelectChannelRequest = {
  transactionId: string;
  channelId: string;
};

export type YoutubeOwnershipGetRequest = {
  mode: YoutubeOwnershipMode;
};

export type YoutubeOwnershipGetNotLinked = {
  result: 'not_linked';
  platform: typeof YOUTUBE_OWNERSHIP_PLATFORM;
  mode: YoutubeOwnershipMode;
  linked: false;
};

export type YoutubeOwnershipGetResponse =
  | YoutubeOwnershipVerified
  | YoutubeOwnershipGetNotLinked;

export type YoutubeOwnershipUnlinkRequest = {
  mode: YoutubeOwnershipMode;
};

export type YoutubeOwnershipUnlinkResponse = {
  result: 'unlinked';
  platform: typeof YOUTUBE_OWNERSHIP_PLATFORM;
  mode: YoutubeOwnershipMode;
  unlinked: true;
};

/** Public / callable error tokens from the contract. */
export const YOUTUBE_OWNERSHIP_ERROR_CODES = [
  'youtube-not-enabled',
  'youtube-no-channel',
  'youtube-channel-claimed',
  'youtube-channel-not-in-candidates',
  'youtube-not-linked',
  'TX_EXPIRED',
  'TX_INVALID',
  'TX_FAILED',
  'CLIENT_PROOF_INVALID',
  'unauthenticated',
] as const;

export type YoutubeOwnershipErrorCode =
  (typeof YOUTUBE_OWNERSHIP_ERROR_CODES)[number];

export type YoutubeStoredTransaction = {
  version: 1;
  transactionId: string;
  clientProofVerifier: string;
  createdAt: number;
  expiresAt: number;
  uid: string;
  mode: YoutubeOwnershipMode;
};
