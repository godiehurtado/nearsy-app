/**
 * Non-Android stub — Instagram ownership pilot is Android-only for NEARSY-209.
 */
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  InstagramOwnershipGetResponse,
  InstagramOwnershipPending,
  InstagramOwnershipUnlinkResponse,
} from './instagramOwnershipContract.ts';
import { InstagramOwnershipError } from './instagramOwnershipCore.ts';

export {
  InstagramOwnershipError,
  instagramOwnershipErrorToI18nKey,
} from './instagramOwnershipCore.ts';
export {
  INSTAGRAM_OWNERSHIP_PLATFORM,
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
} from './instagramOwnershipContract.ts';
export type {
  InstagramOwnershipGetResponse,
  InstagramOwnershipPending,
  InstagramOwnershipVerified,
} from './instagramOwnershipContract.ts';

function unsupported(): never {
  throw new InstagramOwnershipError(
    'PLATFORM_UNSUPPORTED',
    'Instagram ownership is only available on Android in this pilot.',
  );
}

export async function startInstagramOwnership(
  _mode: ProfileMode,
): Promise<InstagramOwnershipPending> {
  unsupported();
}

export async function getInstagramOwnershipState(
  _mode: ProfileMode,
): Promise<InstagramOwnershipGetResponse> {
  unsupported();
}

export async function unlinkInstagramOwnership(
  _mode: ProfileMode,
): Promise<InstagramOwnershipUnlinkResponse> {
  unsupported();
}
