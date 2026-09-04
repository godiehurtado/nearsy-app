import type { AffiliationItem } from '../types/profile.ts';
import {
  CRJ_AFFILIATION_TO_LEGACY_CATEGORY,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog.ts';
import { isEphemeralProviderLogoUrl } from './affiliationLogoDev.ts';

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
  const row: Record<string, string> = {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    source: item.source,
  };
  if (item.providerId) row.providerId = item.providerId;
  if (item.provider) row.provider = item.provider;
  if (
    item.logoUrl &&
    !/^(file|content|ph|assets-library):/i.test(item.logoUrl) &&
    !isEphemeralProviderLogoUrl(item.logoUrl)
  ) {
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

/** After final affiliation category — CRJ-I7 Social Media. */
export const POST_AFFILIATIONS_CRJ_STEP = 'socialMedia' as const;
