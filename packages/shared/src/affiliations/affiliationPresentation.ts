/**
 * Own Profile / editor / public caption for CRJ affiliations.
 *
 * New Family writes use `family`. `identity_lifestyle` stays legacy-readable.
 * Display never uses the general category as a caption label.
 */

import {
  FAMILY_CATEGORY_ID,
  FAMILY_TOPIC_IDS,
  getOnboardingAffiliationCategory,
  isFamilyAffiliationCategory,
  isLegacyIdentityLifestyleCategory,
  isOnboardingAffiliationCategoryId,
  listKnownAffiliationCategoryIds,
  type FamilyTopicId,
  type OnboardingAffiliationCategoryId,
  type OnboardingAffiliationTopic,
  type OnboardingSelectedAffiliation,
} from './onboardingAffiliationCatalog.ts';

export {
  FAMILY_CATEGORY_ID,
  FAMILY_TOPIC_IDS,
  isFamilyAffiliationCategory,
  isLegacyIdentityLifestyleCategory,
};
export type { FamilyTopicId };

export function isFamilyTopicId(value: string | null | undefined): boolean {
  return !!value && (FAMILY_TOPIC_IDS as readonly string[]).includes(value);
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
  return (
    !isFamilyAffiliationCategory(categoryId) &&
    !isLegacyIdentityLifestyleCategory(categoryId)
  );
}

function normalizeMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function topicCatalog(
  categoryId: OnboardingAffiliationCategoryId,
): OnboardingAffiliationTopic[] {
  return getOnboardingAffiliationCategory(categoryId).topics;
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

export function persistAffiliationTopicId(
  categoryId: OnboardingAffiliationCategoryId,
  topic: string | undefined,
): string | undefined {
  const resolved = resolveAffiliationTopic(categoryId, topic);
  if (resolved) return resolved.id;
  const trimmed = (topic ?? '').trim();
  return trimmed || undefined;
}

export function findAffiliationCategoryForTopic(
  topic: string,
): OnboardingAffiliationCategoryId | null {
  const needle = normalizeMatch(topic);
  if (!needle) return null;
  const familyHit = topicCatalog(FAMILY_CATEGORY_ID).find(
    (row) => row.id === needle || normalizeMatch(row.label) === needle,
  );
  if (familyHit) return FAMILY_CATEGORY_ID;
  for (const categoryId of listKnownAffiliationCategoryIds()) {
    if (categoryId === FAMILY_CATEGORY_ID) continue;
    const hit = topicCatalog(categoryId).find(
      (row) => row.id === needle || normalizeMatch(row.label) === needle,
    );
    if (hit) return categoryId;
  }
  return null;
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
  const resolved = isOnboardingAffiliationCategoryId(item.categoryId)
    ? resolveAffiliationTopic(item.categoryId, item.topic)
    : null;
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

/**
 * Public Discovery `type` is the subcategory ID when known, else categoryId.
 */
export function formatPublicAffiliationCaption(
  item: { name?: string | null; type?: string | null },
  localizeTopic: AffiliationTopicLocalizer,
): string {
  const name = (item.name ?? '').trim();
  const type = (item.type ?? '').trim();
  if (!type) return name;
  if (isFamilyTopicId(type) || type === FAMILY_CATEGORY_ID) {
    return formatAffiliationCaption(
      {
        name,
        categoryId: FAMILY_CATEGORY_ID,
        ...(type === FAMILY_CATEGORY_ID ? {} : { topic: type }),
      },
      localizeTopic,
    );
  }
  if (isOnboardingAffiliationCategoryId(type)) {
    return name;
  }
  const categoryId = findAffiliationCategoryForTopic(type);
  if (categoryId) {
    return formatAffiliationCaption(
      { name, categoryId, topic: type },
      localizeTopic,
    );
  }
  return name;
}

export function publicTypeSuppressesLogoDev(
  type: string | null | undefined,
): boolean {
  if (!type) return false;
  if (isFamilyTopicId(type)) return true;
  if (!isOnboardingAffiliationCategoryId(type)) return false;
  return !affiliationAllowsLogoDev(type);
}

export function resolvePublicAffiliationCategoryId(
  type: string | null | undefined,
): OnboardingAffiliationCategoryId | null {
  if (!type) return null;
  if (isFamilyTopicId(type)) return FAMILY_CATEGORY_ID;
  if (isOnboardingAffiliationCategoryId(type)) return type;
  return findAffiliationCategoryForTopic(type);
}

export function formatDiscoveryAffiliationCaption(
  name: string,
  type: string | null | undefined,
  topic: string | null | undefined,
  localizeTopic: AffiliationTopicLocalizer,
): string {
  if (topic) {
    const categoryId = isOnboardingAffiliationCategoryId(type ?? '')
      ? (type as OnboardingAffiliationCategoryId)
      : findAffiliationCategoryForTopic(topic);
    if (categoryId) {
      return formatAffiliationCaption(
        { name, categoryId, topic },
        localizeTopic,
      );
    }
  }
  return formatPublicAffiliationCaption({ name, type: type ?? null }, localizeTopic);
}
