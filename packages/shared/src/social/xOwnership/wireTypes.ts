import { CLIENT_PROOF_METHOD_S256 } from '../../authentication/linkedinA3/clientProof';
import {
  X_OWNERSHIP_PLATFORM,
  type XOwnershipClientPlatform,
  type XOwnershipMode,
} from './names';

export type XOwnershipStartRequest = {
  mode: XOwnershipMode;
  platform: XOwnershipClientPlatform;
  clientProofChallenge: string;
  clientProofMethod: typeof CLIENT_PROOF_METHOD_S256;
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

export type XOwnershipExchangeResponse = XOwnershipVerified;

export type XOwnershipGetRequest = {
  mode: XOwnershipMode;
};

export type XOwnershipNotLinked = {
  result: 'not_linked';
  platform: typeof X_OWNERSHIP_PLATFORM;
  mode: XOwnershipMode;
  linked: false;
};

export type XOwnershipGetResponse = XOwnershipVerified | XOwnershipNotLinked;

export type XOwnershipUnlinkRequest = {
  mode: XOwnershipMode;
};

export type XOwnershipUnlinked = {
  result: 'unlinked';
  platform: typeof X_OWNERSHIP_PLATFORM;
  mode: XOwnershipMode;
  unlinked: true;
};
