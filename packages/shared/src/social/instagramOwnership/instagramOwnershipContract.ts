/**
 * NEARSY-209 Instagram reverse-DM ownership — Identity client contract (per mode).
 * Start / Get / Unlink only. Never Exchange or Confirm. Never log the DM code.
 */

import type { ProfileMode } from '../../profile/profileModeFields.ts';

export const INSTAGRAM_OWNERSHIP_PLATFORM = 'instagram' as const;
export type InstagramOwnershipMobilePlatform = 'android' | 'ios';
export const INSTAGRAM_OWNERSHIP_MOBILE_PLATFORM_ANDROID =
  'android' as const satisfies InstagramOwnershipMobilePlatform;

export const INSTAGRAM_OWNERSHIP_START = 'instagramOwnershipStart' as const;
export const INSTAGRAM_OWNERSHIP_GET = 'instagramOwnershipGet' as const;
export const INSTAGRAM_OWNERSHIP_UNLINK = 'instagramOwnershipUnlink' as const;

export const INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS = 5_000;
export const INSTAGRAM_CHALLENGE_CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/;
export const INSTAGRAM_USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
export const INSTAGRAM_IGSID_RE = /^[0-9]{5,32}$/;
export const INSTAGRAM_CANONICAL_URL_RE =
  /^https:\/\/www\.instagram\.com\/([A-Za-z0-9._]{1,30})$/;
export const INSTAGRAM_CHALLENGE_ID_RE = /^[A-Za-z0-9_-]+$/;
export const MIN_CHALLENGE_ID_LEN = 8;
export const MAX_CHALLENGE_ID_LEN = 128;

export type InstagramOwnershipMode = ProfileMode;

export type InstagramOwnershipStartRequest = {
  mode: InstagramOwnershipMode;
  platform: InstagramOwnershipMobilePlatform;
};

export type InstagramOwnershipPending = {
  result: 'pending';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  challengeId: string;
  code: string;
  inboxUsername: string;
  inboxProfileUrl: string;
  expiresAt: number;
};

export type InstagramOwnershipStartResponse = InstagramOwnershipPending;

export type InstagramOwnershipVerified = {
  result: 'verified';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  igsid: string;
  canonicalUrl: string;
  usernameCache: string;
  verifiedAt: string;
};

export type InstagramOwnershipExpired = {
  result: 'expired';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  challengeId: string;
  expiresAt: number;
};

export type InstagramOwnershipConflict = {
  result: 'conflict';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  reason: 'instagram-account-claimed';
};

export type InstagramOwnershipGetNotLinked = {
  result: 'not_linked';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  linked: false;
};

export type InstagramOwnershipGetResponse =
  | InstagramOwnershipVerified
  | InstagramOwnershipPending
  | InstagramOwnershipExpired
  | InstagramOwnershipConflict
  | InstagramOwnershipGetNotLinked;

export type InstagramOwnershipUnlinkResponse = {
  result: 'unlinked';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  unlinked: true;
};

export const INSTAGRAM_OWNERSHIP_ERROR_CODES = [
  'instagram-not-enabled',
  'instagram-inbox-not-connected',
  'instagram-account-claimed',
  'instagram-rate-limited',
  'instagram-no-username',
  'unauthenticated',
] as const;

export type InstagramOwnershipErrorCode =
  (typeof INSTAGRAM_OWNERSHIP_ERROR_CODES)[number];

export const INSTAGRAM_BANNED_CLIENT_FIELDS = [
  'url',
  'profileUrl',
  'handle',
  'username',
  'igsid',
  'code',
  'redirectUri',
  'returnUrl',
] as const;
