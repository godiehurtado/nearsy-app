import type { ProfileMode } from '../../profile/profileModeFields.ts';

export type XOwnershipUiPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'disconnecting';

export function xOwnershipManualRetryAllowed(code: string): boolean {
  switch (code) {
    case 'x-oauth-failed':
    case 'X_OAUTH':
    case 'x-rate-limited':
    case 'X_RATE_LIMITED':
    case 'x-credits-or-access':
    case 'X_CREDITS_OR_ACCESS':
    case 'x-api-forbidden':
    case 'X_FORBIDDEN':
      return false;
    default:
      return true;
  }
}

export function xOwnershipActionBlocked(
  phase: XOwnershipUiPhase,
): boolean {
  return (
    phase === 'loading' || phase === 'connecting' || phase === 'disconnecting'
  );
}

export function xOwnershipHandleLabel(input: {
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

export function buildXOwnershipModeView(input: {
  mode: ProfileMode;
  connected: boolean;
  channelLabel: string | null;
  phase: XOwnershipUiPhase;
}) {
  return {
    mode: input.mode,
    connected: input.connected,
    channelLabel: input.connected ? input.channelLabel : null,
    phase: input.phase,
  };
}
