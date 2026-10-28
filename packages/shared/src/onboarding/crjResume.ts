/**
 * Incomplete-CRJ resume.
 *
 * Prior progress was never a stored numeric index. Each persist helper wrote
 * field bags (`personalOnboardingAffiliations`, `personalOnboardingInterests`,
 * social/gallery shells, names, photo, mode) with `profileSetupCompleted: false`.
 * `stepIndex` lived in React state only.
 *
 * Going forward the durable cursor is a named v2 token (`v2:affiliation:education`),
 * never an offset into the wizard. Pre-reorder incomplete docs have no cursor:
 * recover the old-journey stage from bags, then map it through
 * `mapLegacyCrjStageToCurrent`. Do not apply an old integer to `resolveCrjStep`.
 *
 * Legacy `identity_lifestyle` rows are not a CRJ screen. They stay in the bag.
 */
import {
  CRJ_AFFILIATION_CATEGORY_IDS,
  CRJ_INTEREST_CATEGORY_IDS,
  crjStepForAffiliationCategory,
  firstAffiliationCrjStep,
  type ResolvedCrjStep,
} from './crjJourney';
import {
  isCrjProfileDetailsValid,
} from '../profile/crjProfileDetails';
import {
  isCrjProfileContextLanguagesValid,
  isCrjProfileContextOriginValid,
  parseUserProfileContext,
} from '../profile/profileContextFields';
import {
  isProfileMode,
  resolveModePresentation,
  type ProfileMode,
} from '../profile/profileModeFields';
import type { OnboardingAffiliationCategoryId } from '../affiliations/onboardingAffiliationCatalog';
import type { OnboardingInterestCategoryId } from '../interests/onboardingInterestCatalog';

export const CRJ_RESUME_STAGE_FIELD = 'crjResumeStage';
export const CRJ_RESUME_STAGE_VERSION_PREFIX = 'v2:';

/**
 * Old CRJ walk (IPA 64 / develop-ios @ 51a5b62), before affiliations-before-interests
 * and before per-category affiliation screens:
 *   type → identity → photo → details → interestsIntro → 11 interest categories
 *   → interestsCelebration → single affiliation accordion → socialMedia
 *   → gallery → location → notifications → success
 */
export type LegacyCrjStage =
  | { kind: 'type' }
  | { kind: 'identity' }
  | { kind: 'photo' }
  | { kind: 'details' }
  | { kind: 'interestsIntro' }
  | {
      kind: 'interest';
      categoryId: OnboardingInterestCategoryId;
    }
  | { kind: 'interestsCelebration' }
  | { kind: 'affiliation' }
  | { kind: 'affiliationComplete' }
  | { kind: 'socialMedia' }
  | { kind: 'gallery' }
  | { kind: 'location' }
  | { kind: 'notifications' }
  | { kind: 'success' };

export type CrjResumeSource = 'named-cursor' | 'legacy-correspondence' | 'bag-recovery';

export type CrjResumeResult = {
  step: ResolvedCrjStep;
  source: CrjResumeSource;
  /**
   * Present when bags cannot identify the exact screen. Recovery is still
   * justified from existing fields; later steps are never marked complete.
   */
  limitation?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(doc: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(doc, key);
}

function onboardingAffiliationsKey(mode: ProfileMode): string {
  return mode === 'professional'
    ? 'professionalOnboardingAffiliations'
    : 'personalOnboardingAffiliations';
}

function onboardingInterestsKey(mode: ProfileMode): string {
  return mode === 'professional'
    ? 'professionalOnboardingInterests'
    : 'personalOnboardingInterests';
}

function socialLinksKey(mode: ProfileMode): string {
  return mode === 'professional'
    ? 'socialLinksProfessional'
    : 'socialLinksPersonal';
}

function galleryKey(mode: ProfileMode): string {
  return mode === 'professional' ? 'professionalGallery' : 'personalGallery';
}

function asStringArrayCategoryIds(raw: unknown, field: 'categoryId'): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const id = item[field];
    if (typeof id === 'string' && id.trim()) ids.push(id);
  }
  return ids;
}

export function readStoredAffiliationCategoryIds(
  doc: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): string[] {
  if (!doc) return [];
  return asStringArrayCategoryIds(doc[onboardingAffiliationsKey(mode)], 'categoryId');
}

export function socialBagHasUserContent(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'custom') {
      if (Array.isArray(nested) && nested.length > 0) return true;
      continue;
    }
    if (typeof nested === 'string' && nested.trim()) return true;
  }
  return false;
}

function galleryBagHasPhotos(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((row) => {
    if (!isPlainObject(row)) return false;
    return typeof row.url === 'string' && /^https:\/\//i.test(row.url);
  });
}

/**
 * Explicit old-journey → new-journey correspondence.
 * Never maps by integer offset.
 *
 * Anyone who had not left the old affiliation accordion still owes the new
 * per-category affiliation walk (inserted before interests). Completing that
 * accordion maps to Social — the old next screen — because interests were
 * already persisted before the accordion.
 */
export function mapLegacyCrjStageToCurrent(
  legacy: LegacyCrjStage,
): ResolvedCrjStep {
  switch (legacy.kind) {
    case 'type':
    case 'identity':
    case 'photo':
    case 'details':
      return { kind: legacy.kind };
    case 'interestsIntro':
    case 'interest':
    case 'interestsCelebration':
    case 'affiliation':
      return firstAffiliationCrjStep();
    case 'affiliationComplete':
      return { kind: 'socialMedia' };
    case 'socialMedia':
    case 'gallery':
    case 'location':
    case 'notifications':
    case 'success':
      return { kind: legacy.kind };
  }
}

export function encodeCrjResumeStage(step: ResolvedCrjStep): string {
  if (step.kind === 'affiliation') {
    return `${CRJ_RESUME_STAGE_VERSION_PREFIX}affiliation:${step.categoryId}`;
  }
  if (step.kind === 'interest') {
    return `${CRJ_RESUME_STAGE_VERSION_PREFIX}interest:${step.categoryId}`;
  }
  return `${CRJ_RESUME_STAGE_VERSION_PREFIX}${step.kind}`;
}

export function decodeCrjResumeStage(
  raw: unknown,
): ResolvedCrjStep | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (!token) return null;
  // Old indexes must never be reused against the reordered map.
  if (/^\d+$/.test(token)) return null;
  if (!token.startsWith(CRJ_RESUME_STAGE_VERSION_PREFIX)) return null;

  const rest = token.slice(CRJ_RESUME_STAGE_VERSION_PREFIX.length);
  if (!rest || /^\d+$/.test(rest)) return null;

  if (rest.startsWith('affiliation:')) {
    const categoryId = rest.slice('affiliation:'.length);
    return crjStepForAffiliationCategory(
      categoryId as OnboardingAffiliationCategoryId,
    );
  }
  if (rest.startsWith('interest:')) {
    const categoryId = rest.slice('interest:'.length);
    const index = CRJ_INTEREST_CATEGORY_IDS.indexOf(
      categoryId as OnboardingInterestCategoryId,
    );
    if (index < 0) return null;
    return {
      kind: 'interest',
      interestCategoryIndex: index,
      categoryId: CRJ_INTEREST_CATEGORY_IDS[index]!,
    };
  }

  const fixed: ResolvedCrjStep['kind'][] = [
    'type',
    'identity',
    'photo',
    'details',
    'interestsIntro',
    'interestsCelebration',
    'socialMedia',
    'gallery',
    'location',
    'notifications',
    'success',
  ];
  if ((fixed as string[]).includes(rest) && rest !== 'success') {
    return { kind: rest } as ResolvedCrjStep;
  }
  return null;
}

function prefixComplete(doc: Record<string, unknown>, mode: ProfileMode): {
  identity: boolean;
  photo: boolean;
  details: boolean;
} {
  const presentation = resolveModePresentation(doc, mode);
  const ctx = parseUserProfileContext(doc);
  return {
    identity:
      !!presentation.realName?.trim() &&
      !!presentation.lastName?.trim() &&
      isCrjProfileContextOriginValid(ctx.birthCountryCode),
    photo: !!presentation.profileImage?.trim(),
    details:
      isCrjProfileDetailsValid({
        mode,
        occupation: presentation.occupation ?? '',
        bio: presentation.bio ?? '',
        company: presentation.company,
      }) && isCrjProfileContextLanguagesValid(ctx.languageCodes),
  };
}

function nextAffiliationAfterEvidence(
  storedCategoryIds: string[],
): ResolvedCrjStep {
  const writable = storedCategoryIds.filter((id) =>
    (CRJ_AFFILIATION_CATEGORY_IDS as readonly string[]).includes(id),
  );
  if (writable.length === 0) return firstAffiliationCrjStep();

  let lastIndex = -1;
  for (const id of writable) {
    const index = CRJ_AFFILIATION_CATEGORY_IDS.indexOf(
      id as OnboardingAffiliationCategoryId,
    );
    if (index > lastIndex) lastIndex = index;
  }
  if (lastIndex < 0) return firstAffiliationCrjStep();
  if (lastIndex >= CRJ_AFFILIATION_CATEGORY_IDS.length - 1) {
    return { kind: 'interestsIntro' };
  }
  const categoryId = CRJ_AFFILIATION_CATEGORY_IDS[lastIndex + 1]!;
  return {
    kind: 'affiliation',
    affiliationCategoryIndex: lastIndex + 1,
    categoryId,
  };
}

function recoverFromBags(
  doc: Record<string, unknown>,
  mode: ProfileMode,
): CrjResumeResult {
  const prefix = prefixComplete(doc, mode);
  if (!prefix.identity) {
    return {
      step: { kind: 'identity' },
      source: 'legacy-correspondence',
    };
  }
  if (!prefix.photo) {
    return {
      step: { kind: 'photo' },
      source: 'legacy-correspondence',
    };
  }
  if (!prefix.details) {
    return {
      step: { kind: 'details' },
      source: 'legacy-correspondence',
    };
  }

  const affKey = onboardingAffiliationsKey(mode);
  const interestKey = onboardingInterestsKey(mode);
  const hasAffBag = hasOwn(doc, affKey) && Array.isArray(doc[affKey]);
  const hasInterestBag =
    hasOwn(doc, interestKey) && Array.isArray(doc[interestKey]);
  const storedAffIds = readStoredAffiliationCategoryIds(doc, mode);
  const hasSocial = socialBagHasUserContent(doc[socialLinksKey(mode)]);
  const hasGallery = galleryBagHasPhotos(doc[galleryKey(mode)]);
  const hasLocation = hasOwn(doc, 'bgVisible');

  if (hasLocation) {
    return {
      step: mapLegacyCrjStageToCurrent({ kind: 'notifications' }),
      source: 'legacy-correspondence',
    };
  }
  if (hasGallery) {
    return {
      step: mapLegacyCrjStageToCurrent({ kind: 'location' }),
      source: 'legacy-correspondence',
    };
  }
  if (hasSocial) {
    return {
      step: mapLegacyCrjStageToCurrent({ kind: 'gallery' }),
      source: 'legacy-correspondence',
    };
  }

  // Interests persisted, affiliations bag missing: old walk was on
  // celebration or the affiliation accordion. Equivalent new stage is the
  // first per-category affiliation screen. Interest chips stay in the bag.
  if (hasInterestBag && !hasAffBag) {
    return {
      step: mapLegacyCrjStageToCurrent({ kind: 'affiliation' }),
      source: 'legacy-correspondence',
    };
  }

  // Affiliations bag without interests: impossible on the old walk (interests
  // persisted before the accordion). This is a new-order doc mid-affiliations
  // or at interests intro. Do not skip remaining categories without rows.
  if (hasAffBag && !hasInterestBag) {
    const next = nextAffiliationAfterEvidence(storedAffIds);
    return {
      step: next,
      source: 'bag-recovery',
      ...(storedAffIds.length === 0
        ? {
            limitation:
              'Empty onboarding affiliation persist cannot identify which category was last left; resume at Education and keep the bag (including identity_lifestyle).',
          }
        : {}),
    };
  }

  // Both onboarding bags: old accordion was left → Social was next. New-order
  // users who finished the last interest also have both bags; celebration is
  // not persisted, so landing on Social does not invent later completion.
  if (hasAffBag && hasInterestBag) {
    return {
      step: mapLegacyCrjStageToCurrent({ kind: 'affiliationComplete' }),
      source: 'legacy-correspondence',
    };
  }

  // Details done, neither onboarding bag: old interestsIntro / in-progress
  // interest categories (chips were memory-only until the last category) or
  // new-order first affiliation. Affiliations now come first.
  return {
    step: mapLegacyCrjStageToCurrent({ kind: 'interestsIntro' }),
    source: 'legacy-correspondence',
    limitation:
      'Interest-category progress was not persisted until the last category, so a mid-interest cursor cannot be restored. Resume at Education (affiliations now precede interests) with empty interest chips.',
  };
}

export function resolveCrjResume(
  doc: Record<string, unknown> | null | undefined,
): CrjResumeResult {
  if (!doc) {
    return { step: { kind: 'type' }, source: 'bag-recovery' };
  }

  const named = decodeCrjResumeStage(doc[CRJ_RESUME_STAGE_FIELD]);
  if (named) {
    return { step: named, source: 'named-cursor' };
  }

  const mode = isProfileMode(doc.mode) ? doc.mode : null;
  if (!mode) {
    return { step: { kind: 'type' }, source: 'legacy-correspondence' };
  }

  return recoverFromBags(doc, mode);
}

export function crjResumePatch(step: ResolvedCrjStep): {
  crjResumeStage: string;
  profileSetupCompleted: false;
} {
  return {
    crjResumeStage: encodeCrjResumeStage(step),
    profileSetupCompleted: false,
  };
}
