import type { AffiliationItem } from '../types/profile';
import {
  CRJ_AFFILIATION_TO_LEGACY_CATEGORY,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog';

export type CrjAffiliationPersistencePatch = {
  personalAffiliations?: AffiliationItem[];
  professionalAffiliations?: AffiliationItem[];
  personalOnboardingAffiliations?: Record<string, string>[];
  professionalOnboardingAffiliations?: Record<string, string>[];
  profileSetupCompleted: false;
};

function sanitizeOnboardingAffiliationForPersistence(
  item: OnboardingSelectedAffiliation,
): Record<string, string> {
  const row: Record<string, string> = {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    source: item.source,
  };
  if (item.providerId) row.providerId = item.providerId;
  if (item.logoUrl && !/^(file|content|ph|assets-library):/i.test(item.logoUrl)) {
    row.logoUrl = item.logoUrl;
  }
  if (item.website) row.website = item.website;
  if (item.topic) row.topic = item.topic;
  return row;
}

/** Bridge CRJ selections to legacy ProfileDetail AffiliationItem rows. */
export function onboardingAffiliationsToLegacy(
  selected: OnboardingSelectedAffiliation[],
): AffiliationItem[] {
  return selected.map((item) => ({
    category: CRJ_AFFILIATION_TO_LEGACY_CATEGORY[item.categoryId],
    label: item.name,
    imageUrl:
      item.logoUrl && !/^(file|content|ph|assets-library):/i.test(item.logoUrl)
        ? item.logoUrl
        : null,
  }));
}

/**
 * CRJ-I6 write — rich onboarding rows + legacy compatibility list.
 * Active mode only; never contaminates opposite mode.
 */
export function buildCrjAffiliationPersistencePatch(
  mode: 'personal' | 'professional',
  selected: OnboardingSelectedAffiliation[],
): CrjAffiliationPersistencePatch {
  const detailed = selected.map(sanitizeOnboardingAffiliationForPersistence);
  const legacy = onboardingAffiliationsToLegacy(selected);

  if (mode === 'personal') {
    return {
      profileSetupCompleted: false,
      personalAffiliations: legacy,
      personalOnboardingAffiliations: detailed,
    };
  }
  return {
    profileSetupCompleted: false,
    professionalAffiliations: legacy,
    professionalOnboardingAffiliations: detailed,
  };
}

/** After final affiliation category — CRJ-I7 Social Media. */
export const POST_AFFILIATIONS_CRJ_STEP = 'socialMedia' as const;
