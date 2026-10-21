/**
 * Local presentation helpers for per-profile-mode TikTok connection UI.
 */

import type { ProfileMode } from '../../profile/profileModeFields';
import type { TiktokOwnershipVerified } from './wireTypes';

export type TiktokOwnershipBusyPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'disconnecting';

export type TiktokModeConnectionView = {
  connected: boolean;
  openId: string | null;
  canonicalUrl: string | null;
  usernameCache: string | null;
};

export function tiktokConnectedForMode(
  verified: TiktokOwnershipVerified | null,
  mode: ProfileMode,
): boolean {
  if (!verified || verified.result !== 'verified') return false;
  return verified.mode === mode;
}

export function tiktokModeConnectionView(
  verified: TiktokOwnershipVerified | null,
  mode: ProfileMode,
): TiktokModeConnectionView {
  const connected = tiktokConnectedForMode(verified, mode);
  if (!connected || !verified) {
    return {
      connected: false,
      openId: null,
      canonicalUrl: null,
      usernameCache: null,
    };
  }
  return {
    connected: true,
    openId: verified.openId,
    canonicalUrl: verified.canonicalUrl,
    usernameCache: verified.usernameCache,
  };
}

export function isTiktokActionLocked(phase: TiktokOwnershipBusyPhase): boolean {
  return (
    phase === 'loading' ||
    phase === 'connecting' ||
    phase === 'disconnecting'
  );
}
