import type { ProfileMode } from '../../profile/profileModeFields.ts';

export type TiktokOwnershipUiPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'disconnecting';

export function tiktokOwnershipActionBlocked(
  phase: TiktokOwnershipUiPhase,
): boolean {
  return (
    phase === 'loading' || phase === 'connecting' || phase === 'disconnecting'
  );
}

export function tiktokOwnershipHandleLabel(input: {
  usernameCache?: string | null;
  canonicalUrl?: string | null;
}): string | null {
  const user =
    typeof input.usernameCache === 'string' ? input.usernameCache.trim() : '';
  if (user) return `@${user.replace(/^@/, '')}`;
  const canonical =
    typeof input.canonicalUrl === 'string' ? input.canonicalUrl.trim() : '';
  return canonical || null;
}

export function buildTiktokOwnershipModeView(input: {
  mode: ProfileMode;
  connected: boolean;
  channelLabel: string | null;
  phase: TiktokOwnershipUiPhase;
}) {
  return {
    mode: input.mode,
    connected: input.connected,
    channelLabel: input.connected ? input.channelLabel : null,
    phase: input.phase,
  };
}
