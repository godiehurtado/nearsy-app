/**
 * Client interpretation of setActiveProfileMode Unit 4A responses.
 *
 * visibility = GLOBAL users/{uid}.visibility intent (not face discoverability).
 * targetProfileComplete = whether the selected face is complete.
 * discoverySynced = whether the active face projection is currently synced.
 */

import type { SetActiveProfileModeResponse } from './callables';

/**
 * Incomplete active face must NOT imply global Off on the client.
 * Backend may return visibility:true with targetProfileComplete:false.
 */
export function shouldCallDeactivateVisibilityAfterModeSwitch(
  response: Pick<
    SetActiveProfileModeResponse,
    'visibility' | 'targetProfileComplete' | 'discoverySynced'
  >,
): boolean {
  void response;
  return false;
}

/**
 * Apply authoritative mode + global visibility from the callable.
 * Completeness/discovery flags are returned separately for UI — they must not
 * override visibility.
 */
export function resolveGlobalVisibilityFromModeSwitchResponse(
  response: Pick<SetActiveProfileModeResponse, 'visibility' | 'targetProfileComplete'>,
): boolean {
  void response.targetProfileComplete;
  return response.visibility === true;
}

export function isActiveFaceIncomplete(
  response: Pick<SetActiveProfileModeResponse, 'targetProfileComplete'>,
): boolean {
  return response.targetProfileComplete === false;
}

/**
 * Successful targetProfileComplete:false is the same-mode no-op only.
 * Never treat it as a completed switch to the other face.
 */
export function shouldApplyActiveProfileModeSwitch(input: {
  confirmedMode: 'personal' | 'professional';
  response: Pick<SetActiveProfileModeResponse, 'mode' | 'targetProfileComplete'>;
}): boolean {
  if (
    input.response.targetProfileComplete === false &&
    input.response.mode !== input.confirmedMode
  ) {
    return false;
  }
  return true;
}
