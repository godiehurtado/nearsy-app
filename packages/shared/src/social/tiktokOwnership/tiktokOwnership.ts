/**
 * Non-Android stub — TikTok ownership pilot is Android-only for NEARSY-209.
 */
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  TiktokOwnershipGetResponse,
  TiktokOwnershipUnlinkResponse,
} from './tiktokOwnershipContract.ts';
import {
  TiktokOwnershipError,
  type TiktokConnectOutcome,
} from './tiktokOwnershipCore.ts';

export {
  TiktokOwnershipError,
  tiktokOwnershipErrorToI18nKey,
} from './tiktokOwnershipCore.ts';
export type { TiktokConnectOutcome } from './tiktokOwnershipCore.ts';
export { parseTiktokOwnershipReturnUrl } from './tiktokOwnershipDeepLink.ts';
export {
  TIKTOK_OWNERSHIP_PLATFORM,
  TIKTOK_OWNERSHIP_RETURN_URL,
} from './tiktokOwnershipContract.ts';
export type {
  TiktokOwnershipGetResponse,
  TiktokOwnershipVerified,
} from './tiktokOwnershipContract.ts';

function unsupported(): never {
  throw new TiktokOwnershipError(
    'PLATFORM_UNSUPPORTED',
    'TikTok ownership is only available on Android in this pilot.',
  );
}

export async function connectTiktokOwnership(
  _mode: ProfileMode,
): Promise<TiktokConnectOutcome> {
  unsupported();
}

export async function getTiktokOwnershipState(
  _mode: ProfileMode,
): Promise<TiktokOwnershipGetResponse> {
  unsupported();
}

export async function unlinkTiktokOwnership(
  _mode: ProfileMode,
): Promise<TiktokOwnershipUnlinkResponse> {
  unsupported();
}
