/**
 * Pure helpers for Profile Exploration (safe Discovery Detail surface).
 * Shared interests = viewer active-mode onboarding ∩ candidate public interestIds.
 * Never uses searchPreferences as "own interests".
 */

import type { ProfileMode } from './types';
import {
  countSharedInterestIds,
  resolveInterestChip,
  type ResolvedInterestChip,
} from './interestDisplay';

export type OnboardingInterestRow = {
  id?: string;
  isCustom?: boolean;
};

export type ViewerProfileExplorationDoc = {
  mode?: string;
  personalOnboardingInterests?: OnboardingInterestRow[];
  professionalOnboardingInterests?: OnboardingInterestRow[];
  /** Must not be used for Compatibility / shared interests. */
  searchPreferences?: unknown;
};

export const PROFILE_EXPLORATION_BLOCK_SOURCE = 'profile_exploration' as const;

/** Rules SoT allowlist: blockedUid, createdAt, source, at */
export type BlockUserDoc = {
  blockedUid: string;
  createdAt: number;
  source: typeof PROFILE_EXPLORATION_BLOCK_SOURCE;
};

export function resolveViewerActiveMode(
  mode: unknown,
): ProfileMode {
  return mode === 'professional' ? 'professional' : 'personal';
}

/**
 * Extract official onboarding interest IDs for the viewer's active profile face.
 * Skips custom / empty ids (aligned with backend projection).
 */
export function extractViewerOnboardingInterestIds(
  doc: ViewerProfileExplorationDoc | null | undefined,
  mode?: ProfileMode,
): string[] {
  if (!doc) return [];
  const active = mode ?? resolveViewerActiveMode(doc.mode);
  const rows =
    active === 'professional'
      ? doc.professionalOnboardingInterests
      : doc.personalOnboardingInterests;
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (row.isCustom === true) continue;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Ordered intersection: preserve candidate order; only IDs present in viewer set. */
export function intersectOnboardingInterestIds(
  viewerOnboardingIds: readonly string[],
  candidateInterestIds: readonly string[],
): string[] {
  if (viewerOnboardingIds.length === 0 || candidateInterestIds.length === 0) {
    return [];
  }
  const viewer = new Set(viewerOnboardingIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of candidateInterestIds) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (!viewer.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function countSharedOnboardingInterests(
  viewerOnboardingIds: readonly string[],
  candidateInterestIds: readonly string[],
): number {
  return countSharedInterestIds(viewerOnboardingIds, candidateInterestIds);
}

export function resolveSharedInterestPills(
  sharedIds: readonly string[],
  translateItem: (nameKey: string, fallback: string) => string,
): ResolvedInterestChip[] {
  const out: ResolvedInterestChip[] = [];
  for (const id of sharedIds) {
    const chip = resolveInterestChip(id, translateItem);
    if (chip) out.push(chip);
  }
  return out;
}

export function shouldShowCompany(
  mode: ProfileMode,
  company: string | null | undefined,
): boolean {
  if (mode !== 'professional') return false;
  return typeof company === 'string' && company.trim().length > 0;
}

export function shouldShowOccupation(
  occupation: string | null | undefined,
): boolean {
  return typeof occupation === 'string' && occupation.trim().length > 0;
}

export function shouldShowBio(bio: string | null | undefined): boolean {
  return typeof bio === 'string' && bio.trim().length > 0;
}

export function galleryPreviewUrls(
  urls: readonly { url: string }[],
  maxPreview = 3,
): { url: string }[] {
  return urls
    .filter((g) => typeof g?.url === 'string' && g.url.length > 0)
    .slice(0, Math.max(0, maxPreview));
}

/** N in `+N` overlay on the third preview tile when gallery.length > 3. */
export function galleryPreviewOverflowCount(
  totalCount: number,
  maxPreview = 3,
): number {
  const total = Math.max(0, Math.floor(totalCount));
  const max = Math.max(0, Math.floor(maxPreview));
  return Math.max(0, total - max);
}

export function shouldShowGalleryPreviewOverflow(
  totalCount: number,
  previewIndex: number,
  maxPreview = 3,
): boolean {
  return (
    galleryPreviewOverflowCount(totalCount, maxPreview) > 0 &&
    previewIndex === maxPreview - 1
  );
}

export function clampGalleryIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.floor(index)), length - 1);
}

export function nextGalleryIndex(
  current: number,
  length: number,
): number | null {
  if (length <= 1) return null;
  const i = clampGalleryIndex(current, length);
  return i < length - 1 ? i + 1 : null;
}

export function prevGalleryIndex(
  current: number,
  length: number,
): number | null {
  if (length <= 1) return null;
  const i = clampGalleryIndex(current, length);
  return i > 0 ? i - 1 : null;
}

export function buildBlockUserDoc(candidateUid: string): BlockUserDoc {
  const blockedUid = String(candidateUid || '').trim();
  if (!blockedUid) {
    throw new Error('invalid-candidate-uid');
  }
  return {
    blockedUid,
    createdAt: Date.now(),
    source: PROFILE_EXPLORATION_BLOCK_SOURCE,
  };
}

export function blockedUsersDocPath(myUid: string, candidateUid: string): {
  collectionPath: ['users', string, 'blockedUsers'];
  docId: string;
} {
  return {
    collectionPath: ['users', myUid, 'blockedUsers'],
    docId: candidateUid,
  };
}

/** Guard: Profile Exploration must not treat searchPreferences as own interests. */
export function assertSharedInterestsIgnoreSearchPreferences(
  doc: ViewerProfileExplorationDoc,
): string[] {
  const fromOnboarding = extractViewerOnboardingInterestIds(doc);
  const prefs = doc.searchPreferences as
    | {
        personal?: { interestIds?: string[] };
        professional?: { interestIds?: string[] };
      }
    | undefined;
  const mode = resolveViewerActiveMode(doc.mode);
  const fromPrefs = prefs?.[mode]?.interestIds;
  // Pure documentation helper for tests — returns onboarding ids only.
  void fromPrefs;
  return fromOnboarding;
}
