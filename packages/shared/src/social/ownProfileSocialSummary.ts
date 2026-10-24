/**
 * Own Profile social quick-action summary — bag + verified ownership.
 * Loading/error are distinct from a confirmed empty bag.
 */
import type { ProfileMode } from '../profile/profileModeFields.ts';
import type { AndroidOwnershipCardId } from './postCrjSocialEditor.ts';
import {
  extractOwnProfileSocialSummaryCounts,
  type OwnProfileSocialSummaryCountOptions,
} from './postCrjSocialEditor.ts';

export type OwnershipPresenceStatus =
  | 'pending'
  | 'verified'
  | 'not_linked'
  | 'error';

export type OwnershipPresenceByMode = Record<
  'personal' | 'professional',
  Record<AndroidOwnershipCardId, OwnershipPresenceStatus>
>;

export type SocialSummaryPresentation =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; count: number };

function presenceRow(
  status: OwnershipPresenceStatus,
): Record<AndroidOwnershipCardId, OwnershipPresenceStatus> {
  return {
    youtube: status,
    tiktok: status,
    instagram: status,
    x: status,
  };
}

export function emptyOwnershipPresenceByMode(): OwnershipPresenceByMode {
  return { personal: presenceRow('pending'), professional: presenceRow('pending') };
}

/** Bag-only / non-Android: do not treat missing Identity as still loading. */
export function bagOnlyOwnershipPresenceByMode(): OwnershipPresenceByMode {
  return {
    personal: presenceRow('not_linked'),
    professional: presenceRow('not_linked'),
  };
}

export function presenceFromOwnershipGetResult(
  result: string | undefined,
  failed: boolean,
): OwnershipPresenceStatus {
  if (failed) return 'error';
  return result === 'verified' ? 'verified' : 'not_linked';
}

export function overlayOptionsFromPresence(
  presence: OwnershipPresenceByMode,
): OwnProfileSocialSummaryCountOptions {
  return {
    personalYoutubeConnected: presence.personal.youtube === 'verified',
    professionalYoutubeConnected: presence.professional.youtube === 'verified',
    personalTiktokConnected: presence.personal.tiktok === 'verified',
    professionalTiktokConnected: presence.professional.tiktok === 'verified',
    personalInstagramConnected: presence.personal.instagram === 'verified',
    professionalInstagramConnected:
      presence.professional.instagram === 'verified',
    personalXConnected: presence.personal.x === 'verified',
    professionalXConnected: presence.professional.x === 'verified',
  };
}

export function presentOwnProfileSocialSummary(
  presence: Record<AndroidOwnershipCardId, OwnershipPresenceStatus>,
  count: number,
): SocialSummaryPresentation {
  const statuses = Object.values(presence);
  if (statuses.some((status) => status === 'pending')) {
    return { kind: 'loading' };
  }
  if (count > 0) {
    return { kind: 'ready', count };
  }
  if (statuses.some((status) => status === 'error')) {
    return { kind: 'error' };
  }
  return { kind: 'ready', count: 0 };
}

export function sameSocialSummaryPresentation(
  a: SocialSummaryPresentation,
  b: SocialSummaryPresentation,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'ready' && b.kind === 'ready') return a.count === b.count;
  return true;
}

export function shouldApplyOwnProfileSocialSummary(input: {
  requestGen: number;
  currentGen: number;
  requestUid: string;
  currentUid: string | null;
}): boolean {
  return (
    input.requestGen === input.currentGen &&
    input.currentUid !== null &&
    input.requestUid === input.currentUid
  );
}

export function buildOwnProfileSocialSummary(input: {
  doc: Record<string, unknown> | null | undefined;
  presence: OwnershipPresenceByMode;
  mode: ProfileMode;
}): {
  personal: number;
  professional: number;
  presentation: SocialSummaryPresentation;
} {
  const counts = extractOwnProfileSocialSummaryCounts(
    input.doc,
    overlayOptionsFromPresence(input.presence),
  );
  const presentation = presentOwnProfileSocialSummary(
    input.presence[input.mode],
    input.mode === 'professional' ? counts.professional : counts.personal,
  );
  return {
    personal: counts.personal,
    professional: counts.professional,
    presentation,
  };
}

export function ownProfileSocialSummarySubtitle(
  presentation: SocialSummaryPresentation,
  labels: {
    configured: (count: number) => string;
    empty: string;
    checking: string;
    checkError: string;
  },
): string {
  if (presentation.kind === 'loading') return labels.checking;
  if (presentation.kind === 'error') return labels.checkError;
  if (presentation.count > 0) return labels.configured(presentation.count);
  return labels.empty;
}

export async function resolveOwnProfileSocialSummaryRequest(input: {
  platform: string;
  doc: Record<string, unknown> | null | undefined;
  mode: ProfileMode;
  isCurrent: () => boolean;
  loadOverlay: () => Promise<OwnershipPresenceByMode>;
}): Promise<{
  personal: number;
  professional: number;
  presentation: SocialSummaryPresentation;
  presence: OwnershipPresenceByMode;
} | null> {
  if (!input.isCurrent()) return null;
  const presence =
    input.platform === 'android'
      ? await input.loadOverlay()
      : bagOnlyOwnershipPresenceByMode();
  if (!input.isCurrent()) return null;
  const built = buildOwnProfileSocialSummary({
    doc: input.doc,
    presence,
    mode: input.mode,
  });
  return { ...built, presence };
}
