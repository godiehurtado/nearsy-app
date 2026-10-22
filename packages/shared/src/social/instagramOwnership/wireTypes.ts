import {
  INSTAGRAM_OWNERSHIP_PLATFORM,
  type InstagramOwnershipClientPlatform,
  type InstagramOwnershipMode,
} from './names';

export type InstagramOwnershipStartRequest = {
  mode: InstagramOwnershipMode;
  platform: InstagramOwnershipClientPlatform;
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

export type InstagramOwnershipNotLinked = {
  result: 'not_linked';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  linked: false;
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

export type InstagramOwnershipGetRequest = {
  mode: InstagramOwnershipMode;
};

export type InstagramOwnershipGetResponse =
  | InstagramOwnershipVerified
  | InstagramOwnershipPending
  | InstagramOwnershipExpired
  | InstagramOwnershipConflict
  | InstagramOwnershipNotLinked;

export type InstagramInboxAuthorizeStartRequest = Record<string, never>;

export type InstagramInboxAuthorizeStartResponse = {
  authorizationUrl: string;
};

export type InstagramOwnershipUnlinkRequest = {
  mode: InstagramOwnershipMode;
};

export type InstagramOwnershipUnlinked = {
  result: 'unlinked';
  platform: typeof INSTAGRAM_OWNERSHIP_PLATFORM;
  mode: InstagramOwnershipMode;
  unlinked: true;
};
