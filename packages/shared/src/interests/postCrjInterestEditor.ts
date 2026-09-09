import {
  countFinalOnboardingInterests,
  sanitizeOnboardingInterestForPersistence,
  type OnboardingInterestCategoryId,
  type OnboardingSelectedInterest,
} from './onboardingInterestCatalog.ts';
import type { ProfileMode } from '../profile/profileModeFields.ts';

export type PostCrjInterestEditorParams = {
  uid: string;
  mode: ProfileMode;
};

export type ParsedPostCrjInterestEditorParams =
  | { ok: true; params: PostCrjInterestEditorParams }
  | { ok: false; reason: 'missing_auth' | 'missing_uid' | 'invalid_mode' | 'uid_mismatch' };

export function parsePostCrjInterestEditorParams(
  routeParams: Record<string, unknown> | null | undefined,
  authUid: string | null | undefined,
): ParsedPostCrjInterestEditorParams {
  if (!authUid) {
    return { ok: false, reason: 'missing_auth' };
  }

  const uid =
    typeof routeParams?.uid === 'string' && routeParams.uid.trim()
      ? routeParams.uid.trim()
      : null;
  if (!uid) {
    return { ok: false, reason: 'missing_uid' };
  }
  if (uid !== authUid) {
    return { ok: false, reason: 'uid_mismatch' };
  }

  const mode = routeParams?.mode;
  if (mode !== 'personal' && mode !== 'professional') {
    return { ok: false, reason: 'invalid_mode' };
  }

  return { ok: true, params: { uid, mode } };
}

export function onboardingInterestsBagKey(
  mode: ProfileMode,
): 'personalOnboardingInterests' | 'professionalOnboardingInterests' {
  return mode === 'professional'
    ? 'professionalOnboardingInterests'
    : 'personalOnboardingInterests';
}

/**
 * Canonical read for post-CRJ interest editors — onboarding bag only.
 * Does not migrate legacy InterestAffiliations during load.
 */
export function readOnboardingInterestsFromDoc(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): OnboardingSelectedInterest[] {
  const raw = data?.[onboardingInterestsBagKey(mode)];
  if (!Array.isArray(raw)) return [];

  const out: OnboardingSelectedInterest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.categoryId !== 'string'
    ) {
      continue;
    }
    out.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId as OnboardingInterestCategoryId,
      icon: typeof row.icon === 'string' ? row.icon : 'star-outline',
      iconColor:
        typeof row.iconColor === 'string' ? row.iconColor : '#64748B',
      ...(row.isCustom === true ? { isCustom: true } : {}),
      ...(typeof row.groupId === 'string' && row.groupId
        ? { groupId: row.groupId }
        : {}),
    });
  }
  return out;
}

export function countOnboardingInterestsInDoc(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): number {
  return countFinalOnboardingInterests(
    readOnboardingInterestsFromDoc(data, mode),
  );
}

function normalizedSelectionFingerprint(
  selected: OnboardingSelectedInterest[],
): string {
  const normalized = [...selected]
    .map(sanitizeOnboardingInterestForPersistence)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(normalized);
}

export function areOnboardingInterestSelectionsEqual(
  a: OnboardingSelectedInterest[],
  b: OnboardingSelectedInterest[],
): boolean {
  return normalizedSelectionFingerprint(a) === normalizedSelectionFingerprint(b);
}

export function isPostCrjInterestEditorDirty(
  snapshot: OnboardingSelectedInterest[],
  draft: OnboardingSelectedInterest[],
): boolean {
  return !areOnboardingInterestSelectionsEqual(snapshot, draft);
}

export type OwnProfileInterestSummaryCounts = {
  personal: number;
  professional: number;
};

export function extractOwnProfileInterestSummaryCounts(
  data: Record<string, unknown> | null | undefined,
): OwnProfileInterestSummaryCounts {
  return {
    personal: countOnboardingInterestsInDoc(data, 'personal'),
    professional: countOnboardingInterestsInDoc(data, 'professional'),
  };
}
