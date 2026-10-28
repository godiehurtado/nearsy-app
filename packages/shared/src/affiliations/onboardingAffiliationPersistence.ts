import type { AffiliationItem } from '../types/profile';
import {
  CRJ_AFFILIATION_TO_LEGACY_CATEGORY,
  getOnboardingAffiliationCategory,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog';
import { isEphemeralProviderLogoUrl } from './affiliationLogoDev';
import {
  isFamilyAffiliationCategory,
  isTopicSufficientAffiliationCategory,
  resolveAffiliationTopicId,
} from './affiliationPresentation';

/** Field-only affiliation bags — never includes lifecycle keys. */
export type AffiliationFieldPersistencePatch = {
  personalAffiliations?: AffiliationItem[];
  professionalAffiliations?: AffiliationItem[];
  personalOnboardingAffiliations?: Record<string, string>[];
  professionalOnboardingAffiliations?: Record<string, string>[];
};

export type CrjAffiliationPersistencePatch = AffiliationFieldPersistencePatch & {
  profileSetupCompleted: false;
};

function sanitizeOnboardingAffiliationForPersistence(
  item: OnboardingSelectedAffiliation,
): Record<string, string> {
  const topicId =
    resolveAffiliationTopicId(item.categoryId, item.topic) ??
    (item.topic?.trim() || undefined);
  const name = item.name.trim();
  const family = isFamilyAffiliationCategory(item.categoryId);
  const namelessCivic =
    isTopicSufficientAffiliationCategory(item.categoryId) && !name;
  const source = family || namelessCivic ? 'custom' : item.source;
  const row: Record<string, string> = {
    id: item.id,
    name,
    categoryId: item.categoryId,
    source,
  };
  if (!family && !namelessCivic) {
    if (item.providerId) row.providerId = item.providerId;
    if (item.provider) row.provider = item.provider;
    if (item.website) row.website = item.website;
  }
  if (
    item.logoUrl &&
    !/^(file|content|ph|assets-library):/i.test(item.logoUrl) &&
    !isEphemeralProviderLogoUrl(item.logoUrl)
  ) {
    row.logoUrl = item.logoUrl;
  }
  if (topicId) row.topic = topicId;
  return row;
}

function legacyAffiliationLabel(item: OnboardingSelectedAffiliation): string {
  const name = item.name.trim();
  if (name) return name;
  if (item.topic) {
    try {
      const topic = getOnboardingAffiliationCategory(item.categoryId).topics.find(
        (row) => row.id === item.topic,
      );
      if (topic?.label) return topic.label;
    } catch {
      // Unknown category ids stay as stored topic.
    }
    return item.topic;
  }
  return item.categoryId;
}

/** Bridge CRJ selections to legacy ProfileDetail AffiliationItem rows. */
export function onboardingAffiliationsToLegacy(
  selected: OnboardingSelectedAffiliation[],
): AffiliationItem[] {
  return selected.map((item) => ({
    category: CRJ_AFFILIATION_TO_LEGACY_CATEGORY[item.categoryId],
    label: legacyAffiliationLabel(item),
    imageUrl:
      item.logoUrl &&
      !/^(file|content|ph|assets-library):/i.test(item.logoUrl) &&
      !isEphemeralProviderLogoUrl(item.logoUrl)
        ? item.logoUrl
        : null,
  }));
}

/**
 * Pure field builder — onboarding bag + intentional legacy bridge for one mode.
 * Never contaminates the opposite mode; never touches lifecycle.
 */
export function buildAffiliationFieldPersistencePatch(
  mode: 'personal' | 'professional',
  selected: OnboardingSelectedAffiliation[],
): AffiliationFieldPersistencePatch {
  const detailed = selected.map(sanitizeOnboardingAffiliationForPersistence);
  const legacy = onboardingAffiliationsToLegacy(selected);

  if (mode === 'personal') {
    return {
      personalAffiliations: legacy,
      personalOnboardingAffiliations: detailed,
    };
  }
  return {
    professionalAffiliations: legacy,
    professionalOnboardingAffiliations: detailed,
  };
}

/**
 * CRJ-I6 write — field bags + explicit mid-wizard lifecycle.
 * Callers: ProfileCompletionScreen only.
 */
export function buildCrjAffiliationPersistencePatch(
  mode: 'personal' | 'professional',
  selected: OnboardingSelectedAffiliation[],
): CrjAffiliationPersistencePatch {
  return {
    ...buildAffiliationFieldPersistencePatch(mode, selected),
    profileSetupCompleted: false,
  };
}

/**
 * Post-CRJ Own Profile affiliation editor write.
 * Same bags as CRJ fields (canonical + bridge); never includes lifecycle keys.
 */
export function buildPostCrjAffiliationPersistencePatch(
  mode: 'personal' | 'professional',
  selected: OnboardingSelectedAffiliation[],
): AffiliationFieldPersistencePatch {
  return buildAffiliationFieldPersistencePatch(mode, selected);
}

/** After final affiliation category — Interests intro (affiliations before interests). */
export const POST_AFFILIATIONS_CRJ_STEP = 'interestsIntro' as const;
