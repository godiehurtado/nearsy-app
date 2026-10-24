/**
 * Affiliation display + Family / topic-sufficient rules for Nearsy 2.0.9.
 *
 * Category storage id `identity_lifestyle` is unchanged (legacy rows keep it).
 * Presentation name is Family. Topic ids below are the iOS catalog until
 * Functions publishes docs/design/NEARSY-209-affiliations-final-contract.md;
 * do not invent a second wire contract.
 */

import {
  getOnboardingAffiliationCategory,
  isFreeTextAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog';

export const FAMILY_AFFILIATION_CATEGORY_ID: OnboardingAffiliationCategoryId =
  'identity_lifestyle';

export const FAMILY_TOPIC_IDS = [
  'father_of',
  'mother_of',
  'child_of',
  'sibling_of',
  'spouse_of',
  'partner_of',
  'grandparent_of',
  'grandchild_of',
  'pet_parent',
] as const;

export type FamilyTopicId = (typeof FAMILY_TOPIC_IDS)[number];

const FAMILY_TOPIC_SET = new Set<string>(FAMILY_TOPIC_IDS);

const TOPIC_SUFFICIENT_CATEGORY_IDS = new Set<OnboardingAffiliationCategoryId>([
  'faith',
  'political_civic',
]);

const KNOWN_CATEGORY_IDS = new Set<string>(listOnboardingAffiliationCategoryIds());

/** English labels previously stored as `topic` for Identity & Lifestyle. */
const LEGACY_TOPIC_LABEL_TO_ID: Record<string, string> = {
  'cultural background': 'cultural_background',
  hometown: 'hometown',
  parent: 'parent',
  'pet parent': 'pet_parent',
  veteran: 'veteran',
  'personality type': 'personality_type',
  'father of': 'father_of',
  'mother of': 'mother_of',
  'child of': 'child_of',
  'sibling of': 'sibling_of',
  'spouse of': 'spouse_of',
  'partner of': 'partner_of',
  'grandparent of': 'grandparent_of',
  'grandchild of': 'grandchild_of',
};

export type AffiliationTranslate = (
  key: string,
  fallback: string,
) => string;

export type AffiliationDisplayParts = {
  primary: string;
  secondary: string | null;
  accessibilityLabel: string;
};

export function isFamilyAffiliationCategory(
  categoryId: string | null | undefined,
): boolean {
  return categoryId === FAMILY_AFFILIATION_CATEGORY_ID;
}

export function isTopicSufficientAffiliationCategory(
  categoryId: string | null | undefined,
): boolean {
  return (
    typeof categoryId === 'string' &&
    TOPIC_SUFFICIENT_CATEGORY_IDS.has(
      categoryId as OnboardingAffiliationCategoryId,
    )
  );
}

export function isFamilyTopicId(value: string | null | undefined): boolean {
  return typeof value === 'string' && FAMILY_TOPIC_SET.has(value);
}

export function affiliationRequiresName(
  categoryId: OnboardingAffiliationCategoryId,
): boolean {
  if (isTopicSufficientAffiliationCategory(categoryId)) return false;
  return true;
}

export function affiliationAllowsLogoDev(
  categoryId: OnboardingAffiliationCategoryId,
): boolean {
  return !isFreeTextAffiliationCategory(categoryId);
}

/**
 * Resolve stored topic (id or legacy English label) to a catalog topic id.
 * Unknown values are returned trimmed; never remapped to a Family relation.
 */
export function resolveAffiliationTopicId(
  categoryId: string | null | undefined,
  storedTopic: string | null | undefined,
): string | null {
  if (typeof storedTopic !== 'string') return null;
  const trimmed = storedTopic.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const fromLegacy = LEGACY_TOPIC_LABEL_TO_ID[lower];
  if (fromLegacy) return fromLegacy;

  if (!categoryId || !KNOWN_CATEGORY_IDS.has(categoryId)) {
    return /^[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(trimmed) ? lower : trimmed;
  }

  const category = getOnboardingAffiliationCategory(
    categoryId as OnboardingAffiliationCategoryId,
  );
  const byId = category.topics.find((topic) => topic.id === lower);
  if (byId) return byId.id;
  const byLabel = category.topics.find(
    (topic) => topic.label.toLowerCase() === lower,
  );
  if (byLabel) return byLabel.id;
  return trimmed;
}

export function resolveAffiliationTopicLabel(
  categoryId: string | null | undefined,
  storedTopic: string | null | undefined,
  translate: AffiliationTranslate,
): string | null {
  const topicId = resolveAffiliationTopicId(categoryId, storedTopic);
  if (!topicId) return null;

  if (KNOWN_CATEGORY_IDS.has(categoryId ?? '')) {
    const category = getOnboardingAffiliationCategory(
      categoryId as OnboardingAffiliationCategoryId,
    );
    const topic = category.topics.find((row) => row.id === topicId);
    if (topic) {
      return translate(
        `onboarding.profileCompletion.affiliations.topics.${topic.id}`,
        topic.label,
      );
    }
  }

  const fallback = topicId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  return translate(
    `onboarding.profileCompletion.affiliations.topics.${topicId}`,
    fallback,
  );
}

function trimName(name: string | null | undefined): string {
  return typeof name === 'string' ? name.trim() : '';
}

/**
 * Public / editor label: name + subcategory. Never the general category.
 * Family composes “Father of Sofía” / “Padre de Sofía”.
 * Missing name → subcategory only; never an empty placeholder.
 */
export function formatAffiliationDisplay(input: {
  name?: string | null;
  categoryId?: string | null;
  topic?: string | null;
  translate: AffiliationTranslate;
}): AffiliationDisplayParts | null {
  const name = trimName(input.name);
  const topicLabel = resolveAffiliationTopicLabel(
    input.categoryId,
    input.topic,
    input.translate,
  );

  const topicId = resolveAffiliationTopicId(input.categoryId, input.topic);
  if (
    isFamilyAffiliationCategory(input.categoryId) &&
    topicLabel &&
    isFamilyTopicId(topicId)
  ) {
    const primary = name ? `${topicLabel} ${name}`.replace(/\s+/g, ' ').trim() : topicLabel;
    if (!primary) return null;
    return {
      primary,
      secondary: null,
      accessibilityLabel: primary,
    };
  }

  if (name && topicLabel) {
    return {
      primary: name,
      secondary: topicLabel,
      accessibilityLabel: `${name}, ${topicLabel}`,
    };
  }
  if (name) {
    return {
      primary: name,
      secondary: null,
      accessibilityLabel: name,
    };
  }
  if (topicLabel) {
    return {
      primary: topicLabel,
      secondary: null,
      accessibilityLabel: topicLabel,
    };
  }
  return null;
}

export function formatAffiliationPrimaryLabel(input: {
  name?: string | null;
  categoryId?: string | null;
  topic?: string | null;
  translate: AffiliationTranslate;
}): string {
  return formatAffiliationDisplay(input)?.primary ?? '';
}
