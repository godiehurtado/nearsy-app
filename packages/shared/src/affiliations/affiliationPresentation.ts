/**
 * Affiliation display + Family / topic-sufficient rules.
 * Contract: docs/design/NEARSY-209-affiliations-final-contract.md
 * (`family` for new writes; `identity_lifestyle` legacy read/edit only).
 */

import {
  getOnboardingAffiliationCategory,
  isFreeTextAffiliationCategory,
  listAllAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
} from './onboardingAffiliationCatalog';

export const FAMILY_AFFILIATION_CATEGORY_ID: OnboardingAffiliationCategoryId =
  'family';

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

const KNOWN_CATEGORY_IDS = new Set<string>(listAllAffiliationCategoryIds());

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

export function isKnownAffiliationCategoryId(
  value: string | null | undefined,
): value is OnboardingAffiliationCategoryId {
  return typeof value === 'string' && KNOWN_CATEGORY_IDS.has(value);
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

function slugTopicLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolve stored topic (id or historical EN label) within that category.
 * Never maps identity_lifestyle `parent` / `pet_parent` onto Family relations.
 */
export function resolveAffiliationTopicId(
  categoryId: string | null | undefined,
  storedTopic: string | null | undefined,
): string | null {
  if (typeof storedTopic !== 'string') return null;
  const trimmed = storedTopic.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (isFamilyTopicId(lower) && !categoryId) return lower;
  if (
    isKnownAffiliationCategoryId(categoryId) === false &&
    /^[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(trimmed)
  ) {
    return lower;
  }

  if (!isKnownAffiliationCategoryId(categoryId)) {
    return trimmed;
  }

  const category = getOnboardingAffiliationCategory(categoryId);
  const byId = category.topics.find((topic) => topic.id === lower);
  if (byId) return byId.id;
  const slugged = slugTopicLabel(trimmed);
  const bySlug = category.topics.find((topic) => topic.id === slugged);
  if (bySlug) return bySlug.id;
  const byLabel = category.topics.find(
    (topic) => slugTopicLabel(topic.label) === slugged,
  );
  if (byLabel) return byLabel.id;
  return null;
}

export function resolveAffiliationTopicLabel(
  categoryId: string | null | undefined,
  storedTopic: string | null | undefined,
  translate: AffiliationTranslate,
): string | null {
  const topicId =
    resolveAffiliationTopicId(categoryId, storedTopic) ??
    (typeof storedTopic === 'string' && storedTopic.trim()
      ? storedTopic.trim()
      : null);
  if (!topicId) return null;
  if (isKnownAffiliationCategoryId(topicId)) return null;

  let fallback = topicId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  if (isKnownAffiliationCategoryId(categoryId)) {
    const topic = getOnboardingAffiliationCategory(categoryId).topics.find(
      (row) => row.id === topicId,
    );
    if (topic?.label) fallback = topic.label;
  } else if (isFamilyTopicId(topicId)) {
    const topic = getOnboardingAffiliationCategory('family').topics.find(
      (row) => row.id === topicId,
    );
    if (topic?.label) fallback = topic.label;
  }

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
  const inferredCategory = isFamilyTopicId(input.topic)
    ? FAMILY_AFFILIATION_CATEGORY_ID
    : input.categoryId;
  const topicLabel = resolveAffiliationTopicLabel(
    inferredCategory,
    input.topic,
    input.translate,
  );

  const topicId = resolveAffiliationTopicId(inferredCategory, input.topic);
  if (
    (isFamilyAffiliationCategory(inferredCategory) || isFamilyTopicId(topicId)) &&
    topicLabel &&
    isFamilyTopicId(topicId)
  ) {
    const primary = name
      ? `${topicLabel} ${name}`.replace(/\s+/g, ' ').trim()
      : topicLabel;
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
