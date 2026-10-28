/**
 * Android CRJ durable resume — named, versioned cursor (not a numeric index).
 * Empty bags are not evidence that a catalog or optional step was finished.
 */
import type { OnboardingAffiliationCategoryId } from '../../affiliations/onboardingAffiliationCatalog.ts';
import type { OnboardingInterestCategoryId } from '../../interests/onboardingInterestCatalog.ts';
import {
  isProfileMode,
  resolveModePresentation,
  type ProfileMode,
} from '../../profile/profileModeFields.ts';
import {
  crjStepIndexFromFlag,
  type CrjResolvedStep,
} from './crjStepOrderCore.ts';

export const ANDROID_CRJ_RESUME_FIELD = 'androidCrjResume';
export const ANDROID_CRJ_RESUME_VERSION = 1;
export const ANDROID_CRJ_RESUME_LAYOUT = 'affiliations-before-interests';

const FIXED_STEP_IDS = [
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
] as const;

export type AndroidCrjResumeRecord = {
  version: typeof ANDROID_CRJ_RESUME_VERSION;
  layout: typeof ANDROID_CRJ_RESUME_LAYOUT;
  mode: ProfileMode;
  step: string;
};

export type AndroidCrjResumeReason =
  | 'cursor'
  | 'conservative'
  | 'safe';

export type AndroidCrjResumeResult = {
  stepIndex: number;
  reason: AndroidCrjResumeReason;
};

function isFixedStepId(
  value: string,
): value is (typeof FIXED_STEP_IDS)[number] {
  return (FIXED_STEP_IDS as readonly string[]).includes(value);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function encodeCrjResumeStepId(step: CrjResolvedStep): string {
  if (step.kind === 'affiliation') return `affiliation:${step.categoryId}`;
  if (step.kind === 'interest') return `interest:${step.categoryId}`;
  return step.kind;
}

export function decodeCrjResumeStepId(
  raw: string,
  affiliationIds: readonly OnboardingAffiliationCategoryId[],
  interestIds: readonly OnboardingInterestCategoryId[],
): CrjResolvedStep | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const id = raw.trim();
  if (id.startsWith('affiliation:')) {
    const categoryId = id.slice('affiliation:'.length);
    const affiliationCategoryIndex = affiliationIds.indexOf(
      categoryId as OnboardingAffiliationCategoryId,
    );
    if (affiliationCategoryIndex < 0) return null;
    return {
      kind: 'affiliation',
      affiliationCategoryIndex,
      categoryId: affiliationIds[affiliationCategoryIndex]!,
    };
  }
  if (id.startsWith('interest:')) {
    const categoryId = id.slice('interest:'.length);
    const interestCategoryIndex = interestIds.indexOf(
      categoryId as OnboardingInterestCategoryId,
    );
    if (interestCategoryIndex < 0) return null;
    return {
      kind: 'interest',
      interestCategoryIndex,
      categoryId: interestIds[interestCategoryIndex]!,
    };
  }
  if (!isFixedStepId(id)) return null;
  return { kind: id } as CrjResolvedStep;
}

export function parseAndroidCrjResumeRecord(
  raw: unknown,
): AndroidCrjResumeRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== ANDROID_CRJ_RESUME_VERSION) return null;
  if (row.layout !== ANDROID_CRJ_RESUME_LAYOUT) return null;
  if (!isProfileMode(row.mode)) return null;
  if (typeof row.step !== 'string' || !row.step.trim()) return null;
  return {
    version: ANDROID_CRJ_RESUME_VERSION,
    layout: ANDROID_CRJ_RESUME_LAYOUT,
    mode: row.mode,
    step: row.step.trim(),
  };
}

export function buildAndroidCrjResumePatch(
  mode: ProfileMode,
  step: CrjResolvedStep,
): { androidCrjResume: AndroidCrjResumeRecord; profileSetupCompleted: false } {
  return {
    androidCrjResume: {
      version: ANDROID_CRJ_RESUME_VERSION,
      layout: ANDROID_CRJ_RESUME_LAYOUT,
      mode,
      step: encodeCrjResumeStepId(step),
    },
    profileSetupCompleted: false,
  };
}

export function androidCrjResumeEvidence(doc: Record<string, unknown> | null) {
  const mode = isProfileMode(doc?.mode) ? doc.mode : null;
  if (!mode || !doc) {
    return {
      mode: null,
      identityComplete: false,
      photoComplete: false,
      detailsComplete: false,
    };
  }
  const presentation = resolveModePresentation(doc, mode);
  const identityComplete =
    hasText(presentation.realName) &&
    hasText(presentation.lastName) &&
    hasText(doc.birthCountryCode);
  const photoComplete = hasText(presentation.profileImage);
  const languageCodes = Array.isArray(doc.languageCodes)
    ? doc.languageCodes.filter(
        (code): code is string => typeof code === 'string' && !!code.trim(),
      )
    : [];
  const detailsComplete =
    hasText(presentation.occupation) &&
    hasText(presentation.bio) &&
    (mode !== 'professional' || hasText(presentation.company)) &&
    languageCodes.length >= 1 &&
    languageCodes.length <= 10;
  return { mode, identityComplete, photoComplete, detailsComplete };
}

function conservativeStepIndex(
  evidence: ReturnType<typeof androidCrjResumeEvidence>,
  affiliationIds: readonly OnboardingAffiliationCategoryId[],
): { stepIndex: number; reason: AndroidCrjResumeReason } {
  if (!evidence.mode) return { stepIndex: 0, reason: 'conservative' };
  if (!evidence.identityComplete) {
    return {
      stepIndex: crjStepIndexFromFlag({ kind: 'identity' }, true),
      reason: 'conservative',
    };
  }
  if (!evidence.photoComplete) {
    return {
      stepIndex: crjStepIndexFromFlag({ kind: 'photo' }, true),
      reason: 'conservative',
    };
  }
  if (!evidence.detailsComplete) {
    return {
      stepIndex: crjStepIndexFromFlag({ kind: 'details' }, true),
      reason: 'conservative',
    };
  }
  const firstAffiliation = affiliationIds[0];
  if (!firstAffiliation) return { stepIndex: 0, reason: 'safe' };
  return {
    stepIndex: crjStepIndexFromFlag(
      {
        kind: 'affiliation',
        affiliationCategoryIndex: 0,
        categoryId: firstAffiliation,
      },
      true,
    ),
    reason: 'conservative',
  };
}

/**
 * Resume the Android CRJ walk.
 * Valid cursor for the document mode wins. Unknown / mismatched / unversioned
 * cursors fall back conservatively. Catalog and optional steps are never
 * inferred from empty bags. Never marks the profile complete.
 */
export function recoverAndroidCrjResume(input: {
  doc: Record<string, unknown> | null | undefined;
  affiliationIds: readonly OnboardingAffiliationCategoryId[];
  interestIds: readonly OnboardingInterestCategoryId[];
}): AndroidCrjResumeResult {
  const doc = input.doc ?? null;
  const evidence = androidCrjResumeEvidence(doc);
  const parsed = parseAndroidCrjResumeRecord(
    doc ? doc[ANDROID_CRJ_RESUME_FIELD] : undefined,
  );
  if (parsed && evidence.mode === parsed.mode) {
    const decoded = decodeCrjResumeStepId(
      parsed.step,
      input.affiliationIds,
      input.interestIds,
    );
    if (decoded) {
      const stepIndex = crjStepIndexFromFlag(decoded, true);
      if (decoded.kind === 'type') {
        return { stepIndex: 0, reason: 'cursor' };
      }
      if (stepIndex > 0) {
        return { stepIndex, reason: 'cursor' };
      }
    }
  }
  if (!evidence.mode) {
    return { stepIndex: 0, reason: 'safe' };
  }
  return conservativeStepIndex(evidence, input.affiliationIds);
}
