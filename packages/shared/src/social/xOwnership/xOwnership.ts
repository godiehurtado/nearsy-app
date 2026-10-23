/**
 * Non-Android stub — X ownership pilot is Android-only for NEARSY-209.
 */
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  XOwnershipGetResponse,
  XOwnershipUnlinkResponse,
} from './xOwnershipContract.ts';
import {
  XOwnershipError,
  type XConnectOutcome,
} from './xOwnershipCore.ts';

export {
  XOwnershipError,
  xOwnershipErrorToI18nKey,
} from './xOwnershipCore.ts';
export type { XConnectOutcome } from './xOwnershipCore.ts';
export { parseXOwnershipReturnUrl } from './xOwnershipDeepLink.ts';
export {
  X_OWNERSHIP_PLATFORM,
  X_OWNERSHIP_RETURN_URL,
} from './xOwnershipContract.ts';
export type {
  XOwnershipGetResponse,
  XOwnershipVerified,
} from './xOwnershipContract.ts';

function unsupported(): never {
  throw new XOwnershipError(
    'PLATFORM_UNSUPPORTED',
    'X ownership is only available on Android in this pilot.',
  );
}

export async function connectXOwnership(
  _mode: ProfileMode,
): Promise<XConnectOutcome> {
  unsupported();
}

export async function getXOwnershipState(
  _mode: ProfileMode,
): Promise<XOwnershipGetResponse> {
  unsupported();
}

export async function unlinkXOwnership(
  _mode: ProfileMode,
): Promise<XOwnershipUnlinkResponse> {
  unsupported();
}
