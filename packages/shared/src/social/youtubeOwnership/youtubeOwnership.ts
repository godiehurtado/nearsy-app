/**
 * Non-Android stub — YouTube ownership pilot is Android-only for NEARSY-209.
 */
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  YoutubeOwnershipGetResponse,
  YoutubeOwnershipUnlinkResponse,
} from './youtubeOwnershipContract.ts';
import {
  YoutubeOwnershipError,
  type YoutubeConnectOutcome,
} from './youtubeOwnershipCore.ts';

export {
  YoutubeOwnershipError,
  youtubeOwnershipErrorToI18nKey,
} from './youtubeOwnershipCore.ts';
export type { YoutubeConnectOutcome } from './youtubeOwnershipCore.ts';
export { parseYoutubeOwnershipReturnUrl } from './youtubeOwnershipDeepLink.ts';
export {
  YOUTUBE_OWNERSHIP_PLATFORM,
  YOUTUBE_OWNERSHIP_RETURN_URL,
} from './youtubeOwnershipContract.ts';
export type {
  YoutubeOwnershipChannelCandidate,
  YoutubeOwnershipGetResponse,
  YoutubeOwnershipVerified,
} from './youtubeOwnershipContract.ts';

function unsupported(): never {
  throw new YoutubeOwnershipError(
    'PLATFORM_UNSUPPORTED',
    'YouTube ownership is only available on Android in this pilot.',
  );
}

export async function connectYoutubeOwnership(
  _mode: ProfileMode,
): Promise<YoutubeConnectOutcome> {
  unsupported();
}

export async function selectYoutubeOwnershipChannel(
  _transactionId: string,
  _channelId: string,
  _expectedMode: ProfileMode,
): Promise<YoutubeConnectOutcome> {
  unsupported();
}

export async function getYoutubeOwnershipState(
  _mode: ProfileMode,
): Promise<YoutubeOwnershipGetResponse> {
  unsupported();
}

export async function unlinkYoutubeOwnership(
  _mode: ProfileMode,
): Promise<YoutubeOwnershipUnlinkResponse> {
  unsupported();
}

export async function resumeYoutubeOwnershipReturn(
  _mode: ProfileMode,
): Promise<YoutubeConnectOutcome | { status: 'ignored' }> {
  return { status: 'ignored' };
}

export function watchYoutubeOwnershipReturns(
  _mode: ProfileMode,
  _onOutcome: (outcome: YoutubeConnectOutcome) => void,
): { remove: () => void } {
  return { remove: () => {} };
}

