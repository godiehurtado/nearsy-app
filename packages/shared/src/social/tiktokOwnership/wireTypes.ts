import { CLIENT_PROOF_METHOD_S256 } from '../../authentication/linkedinA3/clientProof';
import {
  TIKTOK_OWNERSHIP_PLATFORM,
  type TiktokOwnershipClientPlatform,
  type TiktokOwnershipMode,
} from './names';

export type TiktokOwnershipStartRequest = {
  mode: TiktokOwnershipMode;
  platform: TiktokOwnershipClientPlatform;
  clientProofChallenge: string;
  clientProofMethod: typeof CLIENT_PROOF_METHOD_S256;
};

export type TiktokOwnershipStartResponse = {
  transactionId: string;
  mode: TiktokOwnershipMode;
  authorizationUrl: string;
  expiresAt: string;
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
  usernameCache: string;
  verifiedAt: string;
};

/** Exchange only returns verified — no SelectChannel in this pilot. */
export type TiktokOwnershipExchangeResponse = TiktokOwnershipVerified;

export type TiktokOwnershipGetRequest = {
  mode: TiktokOwnershipMode;
};

export type TiktokOwnershipNotLinked = {
  result: 'not_linked';
  platform: typeof TIKTOK_OWNERSHIP_PLATFORM;
  mode: TiktokOwnershipMode;
  linked: false;
};

export type TiktokOwnershipGetResponse =
  | TiktokOwnershipVerified
  | TiktokOwnershipNotLinked;

export type TiktokOwnershipUnlinkRequest = {
  mode: TiktokOwnershipMode;
};

export type TiktokOwnershipUnlinked = {
  result: 'unlinked';
  platform: typeof TIKTOK_OWNERSHIP_PLATFORM;
  mode: TiktokOwnershipMode;
  unlinked: true;
};
