import { CLIENT_PROOF_METHOD_S256 } from '../../authentication/linkedinA3/clientProof';
import {
  YOUTUBE_OWNERSHIP_PLATFORM,
  type YoutubeOwnershipClientPlatform,
  type YoutubeOwnershipMode,
} from './names';

export type YoutubeOwnershipStartRequest = {
  mode: YoutubeOwnershipMode;
  platform: YoutubeOwnershipClientPlatform;
  clientProofChallenge: string;
  clientProofMethod: typeof CLIENT_PROOF_METHOD_S256;
};

export type YoutubeOwnershipStartResponse = {
  transactionId: string;
  mode: YoutubeOwnershipMode;
  authorizationUrl: string;
  expiresAt: string;
};

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

export type YoutubeOwnershipSelectChannelRequest = {
  transactionId: string;
  channelId: string;
};

export type YoutubeOwnershipGetRequest = {
  mode: YoutubeOwnershipMode;
};

export type YoutubeOwnershipNotLinked = {
  result: 'not_linked';
  platform: typeof YOUTUBE_OWNERSHIP_PLATFORM;
  mode: YoutubeOwnershipMode;
  linked: false;
};

export type YoutubeOwnershipGetResponse =
  | YoutubeOwnershipVerified
  | YoutubeOwnershipNotLinked;

export type YoutubeOwnershipUnlinkRequest = {
  mode: YoutubeOwnershipMode;
};

export type YoutubeOwnershipUnlinked = {
  result: 'unlinked';
  platform: typeof YOUTUBE_OWNERSHIP_PLATFORM;
  mode: YoutubeOwnershipMode;
  unlinked: true;
};
