/**
 * Local presentation helpers for per-profile-mode YouTube connection UI.
 */



import type { ProfileMode } from '../../profile/profileModeFields';
import type { YoutubeOwnershipVerified } from './wireTypes';



export type YoutubeOwnershipBusyPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'disconnecting'
  | 'selecting';



export type YoutubeModeConnectionView = {
  connected: boolean;
  channelId: string | null;
  canonicalUrl: string | null;
};



export function youtubeConnectedForMode(
  verified: YoutubeOwnershipVerified | null,
  mode: ProfileMode,
): boolean {
  if (!verified || verified.result !== 'verified') return false;
  return verified.mode === mode;
}



export function youtubeModeConnectionView(
  verified: YoutubeOwnershipVerified | null,
  mode: ProfileMode,
): YoutubeModeConnectionView {
  const connected = youtubeConnectedForMode(verified, mode);
  if (!connected || !verified) {
    return { connected: false, channelId: null, canonicalUrl: null };
  }
  return {
    connected: true,
    channelId: verified.channelId,
    canonicalUrl: verified.canonicalUrl,
  };
}



/** True while Connect/Disconnect/Get must not be re-entered. Channel pick uses `selecting`. */
export function isYoutubeActionLocked(
  phase: YoutubeOwnershipBusyPhase,
): boolean {
  return (
    phase === 'loading' ||
    phase === 'connecting' ||
    phase === 'disconnecting'
  );
}



export function isYoutubeChannelPickLocked(
  phase: YoutubeOwnershipBusyPhase,
): boolean {
  return phase === 'connecting' || phase === 'disconnecting' || phase === 'loading';
}

