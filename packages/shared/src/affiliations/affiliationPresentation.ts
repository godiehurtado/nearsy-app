/**
 * Own Profile / editor / public caption for CRJ affiliations.
 *
 * Category storage ids stay on the Functions catalog (`identity_lifestyle` is
 * Family). Display never uses the general category as a caption label.
 * Legacy Identity & Lifestyle rows keep their stored topic/name as-is.
 */

import {
  getOnboardingAffiliationCategory,
  type OnboardingAffiliationCategoryId,
  type OnboardingAffiliationTopic,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog.ts';

export const FAMILY_CATEGORY_ID = 'identity_lifestyle' as const;

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

/** Retired Identity & Lifestyle topics — still rendered if already saved. */
export const LEGACY_IDENTITY_TOPICS: readonly OnboardingAffiliationTopic[] = [
  { id: 'cultural_background', label: 'Cultural background', emoji: '🌍' },
  { id: 'hometown', label: 'Hometown', emoji: '🏠' },
  { id: 'parent', label: 'Parent', emoji: '👶' },
  { id: 'veteran', label: 'Veteran', emoji: '🎖️' },
  { id: 'personality_type', label: 'Personality type', emoji: '🧠' },
];

export function isFamilyAffiliationCategory(
  categoryId: string | null | undefined,
): boolean {
  return categoryId === FAMILY_CATEGORY_ID;
}

export function isTopicOptionalNameCategory(
  categoryId: string | null | undefined,
): boolean {
  return categoryId === 'political_civic' || categoryId === 'faith';
}

export function affiliationNameRequired(
  categoryId: OnboardingAffiliationCategoryId,
): boolean {
  if (isTopicOptionalNameCategory(categoryId)) return false;
  return true;
}

export function affiliationAllowsLogoDev(
  categoryId: OnboardingAffiliationCategoryId,
): boolean {
  return !isFamilyAffiliationCategory(categoryId);
}

function normalizeMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function topicCatalog(
  categoryId: OnboardingAffiliationCategoryId,
): OnboardingAffiliationTopic[] {
  const current = getOnboardingAffiliationCategory(categoryId).topics;
  if (!isFamilyAffiliationCategory(categoryId)) return current;
  const seen = new Set(current.map((topic) => topic.id));
  return [
    ...current,
    ...LEGACY_IDENTITY_TOPICS.filter((topic) => !seen.has(topic.id)),
  ];
}

export function resolveAffiliationTopic(
  categoryId: OnboardingAffiliationCategoryId,
  topic: string | undefined,
): OnboardingAffiliationTopic | null {
  if (!topic) return null;
  const needle = normalizeMatch(topic);
  if (!needle) return null;
  return (
    topicCatalog(categoryId).find(
      (row) => row.id === needle || normalizeMatch(row.label) === needle,
    ) ?? null
  );
}

export type AffiliationTopicLocalizer = (
  topicId: string,
  fallback: string,
) => string;

function captionAlreadyIncludesTopic(
  name: string,
  labels: string[],
): boolean {
  const lower = normalizeMatch(name);
  return labels.some((label) => {
    const token = normalizeMatch(label);
    return token.length > 0 && lower.startsWith(token);
  });
}

/**
 * One-line caption: name + subcategory, never the general category.
 * Family reads "Father of Sofia" / "Padre de Sofía".
 * Named rows read "Florida Democrats / Democratic Party".
 * Topic-only rows read just the subcategory.
 */
export function formatAffiliationCaption(
  item: Pick<OnboardingSelectedAffiliation, 'name' | 'categoryId' | 'topic'>,
  localizeTopic: AffiliationTopicLocalizer,
): string {
  const name = (item.name ?? '').trim();
  const resolved = resolveAffiliationTopic(item.categoryId, item.topic);
  const englishLabel = resolved?.label ?? (item.topic ?? '').trim();
  const localized = resolved
    ? localizeTopic(resolved.id, englishLabel)
    : englishLabel;
  const topicLabel = localized.trim();

  if (!topicLabel) return name;
  if (!name) return topicLabel;
  if (
    normalizeMatch(name) === normalizeMatch(topicLabel) ||
    normalizeMatch(name) === normalizeMatch(englishLabel)
  ) {
    return topicLabel;
  }
  if (captionAlreadyIncludesTopic(name, [topicLabel, englishLabel])) {
    return name;
  }
  if (isFamilyAffiliationCategory(item.categoryId)) {
    return `${topicLabel} ${name}`.trim();
  }
  return `${name} / ${topicLabel}`;
}

export function formatDiscoveryAffiliationCaption(
  name: string,
  type: string | null | undefined,
  topic: string | null | undefined,
  localizeTopic: AffiliationTopicLocalizer,
): string {
  if (!type) return name.trim();
  return formatAffiliationCaption(
    {
      name,
      categoryId: type as OnboardingAffiliationCategoryId,
      ...(topic ? { topic } : {}),
    },
    localizeTopic,
  );
}
