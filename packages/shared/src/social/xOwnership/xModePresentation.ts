/**
 * Local presentation helpers for per-profile-mode X connection UI.
 */

import type { ProfileMode } from '../../profile/profileModeFields';
import type { XOwnershipVerified } from './wireTypes';

export type XOwnershipBusyPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'disconnecting';

export type XModeConnectionView = {
  connected: boolean;
  userId: string | null;
  canonicalUrl: string | null;
  usernameCache: string | null;
};

export function xConnectedForMode(
  verified: XOwnershipVerified | null,
  mode: ProfileMode,
): boolean {
  if (!verified || verified.result !== 'verified') return false;
  return verified.mode === mode;
}

export function xModeConnectionView(
  verified: XOwnershipVerified | null,
  mode: ProfileMode,
): XModeConnectionView {
  const connected = xConnectedForMode(verified, mode);
  if (!connected || !verified) {
    return {
      connected: false,
      userId: null,
      canonicalUrl: null,
      usernameCache: null,
    };
  }
  return {
    connected: true,
    userId: verified.userId,
    canonicalUrl: verified.canonicalUrl,
    usernameCache: verified.usernameCache,
  };
}

export function isXActionLocked(phase: XOwnershipBusyPhase): boolean {
  return (
    phase === 'loading' ||
    phase === 'connecting' ||
    phase === 'disconnecting'
  );
}
