/**
 * Local presentation helpers for per-profile-mode Instagram connection UI.
 */

import type { ProfileMode } from '../../profile/profileModeFields';
import type { InstagramOwnershipVerified } from './wireTypes';

export type InstagramOwnershipBusyPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'pending'
  | 'disconnecting';

export type InstagramModeConnectionView = {
  connected: boolean;
  igsid: string | null;
  canonicalUrl: string | null;
  usernameCache: string | null;
};

export function instagramConnectedForMode(
  verified: InstagramOwnershipVerified | null,
  mode: ProfileMode,
): boolean {
  if (!verified || verified.result !== 'verified') return false;
  return verified.mode === mode;
}

export function instagramModeConnectionView(
  verified: InstagramOwnershipVerified | null,
  mode: ProfileMode,
): InstagramModeConnectionView {
  const connected = instagramConnectedForMode(verified, mode);
  if (!connected || !verified) {
    return {
      connected: false,
      igsid: null,
      canonicalUrl: null,
      usernameCache: null,
    };
  }
  return {
    connected: true,
    igsid: verified.igsid,
    canonicalUrl: verified.canonicalUrl,
    usernameCache: verified.usernameCache,
  };
}

export function isInstagramActionLocked(
  phase: InstagramOwnershipBusyPhase,
): boolean {
  return (
    phase === 'loading' ||
    phase === 'connecting' ||
    phase === 'disconnecting'
  );
}
