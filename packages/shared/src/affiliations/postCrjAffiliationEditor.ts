import type { AffiliationCategory, AffiliationItem } from '../types/profile';
import {
  buildCustomAffiliationId,
  isDuplicateAffiliation,
  normalizeAffiliationName,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog';
import { buildAffiliationFieldPersistencePatch } from './onboardingAffiliationPersistence';
import type { ProfileMode } from '../profile/profileModeFields';

export {
  parsePostCrjInterestEditorParams as parsePostCrjAffiliationEditorParams,
  type PostCrjInterestEditorParams as PostCrjAffiliationEditorParams,
  type ParsedPostCrjInterestEditorParams as ParsedPostCrjAffiliationEditorParams,
} from '../interests/postCrjInterestEditor';

const LEGACY_CATEGORY_TO_CRJ: Record<
  AffiliationCategory,
  OnboardingAffiliationCategoryId
> = {
  schoolCollege: 'education',
  majorField: 'education',
  alumniGroup: 'education',
  favoriteTeam: 'sports_clubs',
  hobbiesClubs: 'identity_lifestyle',
  industry: 'professional',
  communityGroups: 'community',
  pets: 'identity_lifestyle',
};

export function onboardingAffiliationsBagKey(
  mode: ProfileMode,
): 'personalOnboardingAffiliations' | 'professionalOnboardingAffiliations' {
  return mode === 'professional'
    ? 'professionalOnboardingAffiliations'
    : 'personalOnboardingAffiliations';
}

export function legacyAffiliationsBagKey(
  mode: ProfileMode,
): 'personalAffiliations' | 'professionalAffiliations' {
  return mode === 'professional'
    ? 'professionalAffiliations'
    : 'personalAffiliations';
}

export function readOnboardingAffiliationsFromDoc(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): OnboardingSelectedAffiliation[] {
  const raw = data?.[onboardingAffiliationsBagKey(mode)];
  if (!Array.isArray(raw)) return [];

  const out: OnboardingSelectedAffiliation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.categoryId !== 'string' ||
      (row.source !== 'provider' && row.source !== 'custom')
    ) {
      continue;
    }
    out.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId as OnboardingAffiliationCategoryId,
      source: row.source,
      ...(typeof row.providerId === 'string' && row.providerId
        ? { providerId: row.providerId }
        : {}),
      ...(typeof row.provider === 'string' && row.provider
        ? { provider: row.provider }
        : {}),
      ...(typeof row.logoUrl === 'string' && row.logoUrl
        ? { logoUrl: row.logoUrl }
        : {}),
      ...(typeof row.website === 'string' && row.website
        ? { website: row.website }
        : {}),
      ...(typeof row.topic === 'string' && row.topic
        ? { topic: row.topic }
        : {}),
    });
  }
  return out;
}

export function readLegacyAffiliationsFromDoc(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): AffiliationItem[] {
  const raw = data?.[legacyAffiliationsBagKey(mode)];
  if (!Array.isArray(raw)) return [];

  const out: AffiliationItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.category !== 'string' || typeof row.label !== 'string') {
      continue;
    }
    out.push({
      category: row.category as AffiliationCategory,
      label: row.label,
      imageUrl:
        typeof row.imageUrl === 'string' && row.imageUrl.trim()
          ? row.imageUrl.trim()
          : null,
    });
  }
  return out;
}

/**
 * Best-effort legacy → editable onboarding draft.
 * Provider metadata cannot be reconstructed without evidence; custom rows preserve label + logo.
 */
export function legacyAffiliationItemsToOnboardingSelected(
  items: AffiliationItem[],
): OnboardingSelectedAffiliation[] {
  const out: OnboardingSelectedAffiliation[] = [];
  for (const item of items) {
    const name = normalizeAffiliationName(item.label ?? '');
    if (!name) continue;
    const categoryId =
      LEGACY_CATEGORY_TO_CRJ[item.category] ?? 'community';
    const candidate: OnboardingSelectedAffiliation = {
      id: buildCustomAffiliationId(categoryId, name),
      name,
      categoryId,
      source: 'custom',
      ...(item.imageUrl &&
      !/^(file|content|ph|assets-library):/i.test(item.imageUrl)
        ? { logoUrl: item.imageUrl }
        : {}),
    };
    if (isDuplicateAffiliation(out, candidate)) continue;
    out.push(candidate);
  }
  return out;
}

export type PostCrjAffiliationReadResult = {
  affiliations: OnboardingSelectedAffiliation[];
  usedLegacyFallback: boolean;
};

export function readAffiliationsForPostCrjEditor(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): PostCrjAffiliationReadResult {
  const fromOnboarding = readOnboardingAffiliationsFromDoc(data, mode);
  if (fromOnboarding.length > 0) {
    return { affiliations: fromOnboarding, usedLegacyFallback: false };
  }

  const legacy = readLegacyAffiliationsFromDoc(data, mode);
  if (legacy.length === 0) {
    return { affiliations: [], usedLegacyFallback: false };
  }

  return {
    affiliations: legacyAffiliationItemsToOnboardingSelected(legacy),
    usedLegacyFallback: true,
  };
}

function affiliationSelectionFingerprint(
  selected: OnboardingSelectedAffiliation[],
): string {
  const patch = buildAffiliationFieldPersistencePatch('personal', selected);
  return JSON.stringify(patch.personalOnboardingAffiliations ?? []);
}

export function areOnboardingAffiliationSelectionsEqual(
  a: OnboardingSelectedAffiliation[],
  b: OnboardingSelectedAffiliation[],
): boolean {
  return affiliationSelectionFingerprint(a) === affiliationSelectionFingerprint(b);
}

export function isPostCrjAffiliationEditorDirty(
  snapshot: OnboardingSelectedAffiliation[],
  draft: OnboardingSelectedAffiliation[],
): boolean {
  return !areOnboardingAffiliationSelectionsEqual(snapshot, draft);
}

export function countAffiliationsForOwnProfileSummary(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): number {
  const onboarding = readOnboardingAffiliationsFromDoc(data, mode);
  if (onboarding.length > 0) {
    return onboarding.length;
  }
  return readLegacyAffiliationsFromDoc(data, mode).length;
}

export type OwnProfileAffiliationSummaryCounts = {
  personal: number;
  professional: number;
};

export function extractOwnProfileAffiliationSummaryCounts(
  data: Record<string, unknown> | null | undefined,
): OwnProfileAffiliationSummaryCounts {
  return {
    personal: countAffiliationsForOwnProfileSummary(data, 'personal'),
    professional: countAffiliationsForOwnProfileSummary(data, 'professional'),
  };
}
