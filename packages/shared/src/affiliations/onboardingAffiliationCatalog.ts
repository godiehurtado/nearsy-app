import type { AffiliationCategory } from '../types/profile.ts';

/** CRJ-I6 affiliation category ids — seven onboarding screens plus legacy Identity. */
export type OnboardingAffiliationCategoryId =
  | 'education'
  | 'professional'
  | 'community'
  | 'sports_clubs'
  | 'faith'
  | 'political_civic'
  | 'family'
  | 'identity_lifestyle';

export const FAMILY_CATEGORY_ID = 'family' as const;
export const LEGACY_IDENTITY_CATEGORY_ID = 'identity_lifestyle' as const;
export const AFFILIATION_NAME_MAX_CHARS = 120;

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

export type OnboardingAffiliationTopic = {
  id: string;
  label: string;
  emoji: string;
};

/**
 * How the category collects entries in the CRJ / Own Profile panel.
 * - search: Logo.dev entity suggestions + optional own image
 * - freeText: typed name + optional own image; no entity search / Logo.dev
 */
export type OnboardingAffiliationEntrySource = 'search' | 'freeText';

export type OnboardingAffiliationCategory = {
  id: OnboardingAffiliationCategoryId;
  nameKey: string;
  name: string;
  subtitleKey: string;
  subtitle: string;
  emoji: string;
  icon: string;
  iconColor: string;
  topics: OnboardingAffiliationTopic[];
  /** Defaults to `search` when omitted (legacy categories). */
  entrySource?: OnboardingAffiliationEntrySource;
};

export type OnboardingAffiliationSource = 'provider' | 'custom';

export type OnboardingSelectedAffiliation = {
  id: string;
  name: string;
  categoryId: OnboardingAffiliationCategoryId;
  source: OnboardingAffiliationSource;
  providerId?: string;
  provider?: string;
  logoUrl?: string;
  website?: string;
  topic?: string;
};

function topic(label: string, emoji: string): OnboardingAffiliationTopic {
  const id = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return { id, label, emoji };
}

export const ONBOARDING_AFFILIATION_CATEGORIES: OnboardingAffiliationCategory[] =
  [
    {
      id: 'education',
      nameKey: 'education',
      name: 'Education',
      subtitleKey: 'education',
      subtitle: 'Schools, degrees and alumni life.',
      emoji: '🎓',
      icon: 'school-outline',
      iconColor: '#4F46E5',
      topics: [
        topic('High school', '🏫'),
        topic('College or university', '🎓'),
        topic('Alumni association', '🤝'),
        topic('Major or field of study', '📐'),
        topic('Fraternity or sorority', '🏛️'),
      ],
    },
    {
      id: 'professional',
      nameKey: 'professional',
      name: 'Professional',
      subtitleKey: 'professional',
      subtitle: 'Work, industry and business networks.',
      emoji: '💼',
      icon: 'briefcase-outline',
      iconColor: '#0F766E',
      topics: [
        topic('Company', '🏢'),
        topic('Industry', '🏭'),
        topic('Professional organization', '💼'),
        topic('Chamber of commerce', '🏬'),
        topic('Networking group', '🔗'),
        topic('Trade association', '📋'),
        topic('Business community', '📈'),
      ],
    },
    {
      id: 'community',
      nameKey: 'community',
      name: 'Community',
      subtitleKey: 'community',
      subtitle: 'Groups and causes you are part of.',
      emoji: '👫',
      icon: 'people-outline',
      iconColor: '#DB2777',
      topics: [
        topic('Volunteer organization', '🙋'),
        topic('Nonprofit', '💚'),
        topic('Neighborhood association', '🏘️'),
        topic('Cultural organization', '🎭'),
        topic('Social club', '🥂'),
        topic('Parent organization', '👨‍👩‍👧'),
        topic('Community group', '👫'),
      ],
    },
    {
      id: 'sports_clubs',
      nameKey: 'sports_clubs',
      name: 'Sports & Clubs',
      subtitleKey: 'sports_clubs',
      subtitle: 'Teams, clubs and leagues.',
      emoji: '🏅',
      icon: 'football-outline',
      iconColor: '#059669',
      topics: [
        topic('Sports team', '⚽'),
        topic('Fan club', '📣'),
        topic('Fitness community', '🏋️'),
        topic('Book club', '📚'),
        topic('Painting club', '🎨'),
        topic('Hobby club', '🧩'),
        topic('Recreational league', '🏆'),
      ],
    },
    {
      id: 'faith',
      nameKey: 'faith',
      name: 'Faith & Spirituality',
      subtitleKey: 'faith',
      subtitle: 'Your faith or spiritual path.',
      emoji: '🙏',
      icon: 'heart-outline',
      iconColor: '#7C3AED',
      topics: [
        topic('Christian', '✝️'),
        topic('Catholic', '⛪'),
        topic('Protestant', '📖'),
        topic('Jewish', '✡️'),
        topic('Muslim', '☪️'),
        topic('Hindu', '🕉️'),
        topic('Buddhist', '☸️'),
        topic('Spiritual', '🕯️'),
        topic('Agnostic', '❔'),
        topic('Atheist', '🚫'),
        topic('Other', '🌐'),
      ],
    },
    {
      id: 'political_civic',
      nameKey: 'political_civic',
      name: 'Political & Civic',
      subtitleKey: 'political_civic',
      subtitle: 'Civic life and political affiliation.',
      emoji: '🗳️',
      icon: 'megaphone-outline',
      iconColor: '#DC2626',
      topics: [
        topic('Democratic Party', '🔵'),
        topic('Republican Party', '🔴'),
        topic('Independent', '⚪'),
        topic('Libertarian Party', '🗽'),
        topic('Green Party', '🌿'),
        topic('Other political party', '🗳️'),
        topic('No party affiliation', '⚖️'),
        topic('Civic organization', '🏛️'),
        topic('Advocacy organization', '📣'),
      ],
    },
    {
      id: 'family',
      nameKey: 'family',
      name: 'Family',
      subtitleKey: 'family',
      subtitle: 'Family relationships and pets.',
      emoji: '👨‍👩‍👧',
      icon: 'people-circle-outline',
      iconColor: '#CA8A04',
      entrySource: 'freeText',
      topics: [
        topic('Father of', '👨'),
        topic('Mother of', '👩'),
        topic('Child of', '🧒'),
        topic('Sibling of', '👫'),
        topic('Spouse of', '💍'),
        topic('Partner of', '🤍'),
        topic('Grandparent of', '👴'),
        topic('Grandchild of', '👶'),
        topic('Pet parent', '🐾'),
      ],
    },
  ];

/** Frozen 2.0.8 Identity & Lifestyle catalog — readable/editable, never rewritten to Family. */
export const LEGACY_IDENTITY_LIFESTYLE_CATEGORY: OnboardingAffiliationCategory =
  {
    id: 'identity_lifestyle',
    nameKey: 'identity_lifestyle',
    name: 'Identity & Lifestyle',
    subtitleKey: 'identity_lifestyle',
    subtitle: 'How you see yourself and the life you live.',
    emoji: '✨',
    icon: 'sparkles-outline',
    iconColor: '#CA8A04',
    entrySource: 'freeText',
    topics: [
      topic('Cultural background', '🌍'),
      topic('Hometown', '🏠'),
      topic('Parent', '👶'),
      topic('Pet parent', '🐾'),
      topic('Veteran', '🎖️'),
      topic('Personality type', '🧠'),
    ],
  };

/** Maps CRJ category to legacy ProfileDetail AffiliationCategory. */
export const CRJ_AFFILIATION_TO_LEGACY_CATEGORY: Record<
  OnboardingAffiliationCategoryId,
  AffiliationCategory
> = {
  education: 'schoolCollege',
  professional: 'industry',
  community: 'communityGroups',
  sports_clubs: 'favoriteTeam',
  faith: 'communityGroups',
  political_civic: 'communityGroups',
  family: 'hobbiesClubs',
  identity_lifestyle: 'hobbiesClubs',
};

export function listOnboardingAffiliationCategoryIds(): OnboardingAffiliationCategoryId[] {
  return ONBOARDING_AFFILIATION_CATEGORIES.map((c) => c.id);
}

export function listKnownAffiliationCategoryIds(): OnboardingAffiliationCategoryId[] {
  return [
    ...listOnboardingAffiliationCategoryIds(),
    LEGACY_IDENTITY_LIFESTYLE_CATEGORY.id,
  ];
}

export function isOnboardingAffiliationCategoryId(
  value: string,
): value is OnboardingAffiliationCategoryId {
  return listKnownAffiliationCategoryIds().includes(
    value as OnboardingAffiliationCategoryId,
  );
}

export function isFamilyAffiliationCategory(
  categoryId: string | null | undefined,
): boolean {
  return categoryId === FAMILY_CATEGORY_ID;
}

export function isLegacyIdentityLifestyleCategory(
  categoryId: string | null | undefined,
): boolean {
  return categoryId === LEGACY_IDENTITY_CATEGORY_ID;
}

export function editorCategoryIdsFor(
  categoryId: OnboardingAffiliationCategoryId,
): OnboardingAffiliationCategoryId[] {
  if (categoryId === FAMILY_CATEGORY_ID) {
    return [FAMILY_CATEGORY_ID, LEGACY_IDENTITY_CATEGORY_ID];
  }
  return [categoryId];
}

export function affiliationBelongsToEditorCategory(
  rowCategoryId: string,
  editorCategoryId: OnboardingAffiliationCategoryId,
): boolean {
  return editorCategoryIdsFor(editorCategoryId).includes(
    rowCategoryId as OnboardingAffiliationCategoryId,
  );
}

export function getOnboardingAffiliationCategory(
  id: OnboardingAffiliationCategoryId,
): OnboardingAffiliationCategory {
  const cat =
    ONBOARDING_AFFILIATION_CATEGORIES.find((c) => c.id === id) ??
    (id === LEGACY_IDENTITY_CATEGORY_ID
      ? LEGACY_IDENTITY_LIFESTYLE_CATEGORY
      : undefined);
  if (!cat) throw new Error(`Unknown affiliation category: ${id}`);
  return cat;
}

function slugAffiliationToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function buildCustomAffiliationId(
  categoryId: OnboardingAffiliationCategoryId,
  name: string,
  topic?: string,
): string {
  const nameSlug = slugAffiliationToken(name);
  if (nameSlug) return `custom_${categoryId}_${nameSlug}`;
  const topicSlug = slugAffiliationToken(topic ?? '');
  if (topicSlug) return `custom_${categoryId}_${topicSlug}`;
  return `custom_${categoryId}_entry`;
}

/**
 * Custom id that stays under the `custom_<categoryId>_…` scheme while avoiding
 * slug collisions between distinct free-text entries (e.g. "C++" vs "C#").
 * Nameless civic/faith rows disambiguate with topic, never a shared `org` id.
 */
export function buildUniqueCustomAffiliationId(
  categoryId: OnboardingAffiliationCategoryId,
  name: string,
  existingIds: ReadonlySet<string> | readonly string[],
  topic?: string,
): string {
  const taken = existingIds instanceof Set ? existingIds : new Set(existingIds);
  const base = buildCustomAffiliationId(categoryId, name, topic);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function isFreeTextAffiliationCategory(
  categoryId: OnboardingAffiliationCategoryId,
): boolean {
  return getOnboardingAffiliationCategory(categoryId).entrySource === 'freeText';
}

export function normalizeAffiliationName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function affiliationAllowsProviderIdentity(
  item: Pick<
    OnboardingSelectedAffiliation,
    'name' | 'providerId' | 'source' | 'categoryId'
  >,
): boolean {
  if (
    isFamilyAffiliationCategory(item.categoryId) ||
    isLegacyIdentityLifestyleCategory(item.categoryId)
  ) {
    return false;
  }
  if (!normalizeAffiliationName(item.name)) return false;
  return item.source === 'provider' && !!item.providerId;
}

export function affiliationIdentityKey(
  item: Pick<
    OnboardingSelectedAffiliation,
    'name' | 'providerId' | 'source' | 'topic' | 'categoryId'
  >,
): string {
  if (affiliationAllowsProviderIdentity(item) && item.providerId) {
    return `provider:${item.providerId}`;
  }
  const name = normalizeAffiliationName(item.name).toLowerCase();
  const topic = (item.topic ?? '').trim().toLowerCase();
  const categoryId = item.categoryId ?? '';
  if (!name) {
    return `topic:${categoryId}:${topic || 'entry'}`;
  }
  if (
    isFamilyAffiliationCategory(categoryId) ||
    isLegacyIdentityLifestyleCategory(categoryId)
  ) {
    return `name:${categoryId}:${topic}:${name}`;
  }
  return `name:${name}`;
}

export function isDuplicateAffiliation(
  list: OnboardingSelectedAffiliation[],
  candidate: Pick<
    OnboardingSelectedAffiliation,
    'name' | 'providerId' | 'source' | 'topic' | 'categoryId'
  >,
  options?: { categoryId?: OnboardingAffiliationCategoryId },
): boolean {
  const key = affiliationIdentityKey(candidate);
  const normalizedName = normalizeAffiliationName(candidate.name).toLowerCase();
  const scope = options?.categoryId;
  const scopeIds = scope ? editorCategoryIdsFor(scope) : null;
  return list.some((entry) => {
    if (scopeIds && !scopeIds.includes(entry.categoryId)) return false;
    if (affiliationIdentityKey(entry) === key) return true;
    if (!normalizedName) return false;
    return (
      normalizeAffiliationName(entry.name).toLowerCase() === normalizedName &&
      !(candidate.topic && entry.topic && candidate.topic !== entry.topic)
    );
  });
}

export function validateCustomAffiliationName(name: string): {
  ok: true;
  name: string;
} | { ok: false; reason: 'empty' | 'tooLong' } {
  const trimmed = normalizeAffiliationName(name);
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > AFFILIATION_NAME_MAX_CHARS) {
    return { ok: false, reason: 'tooLong' };
  }
  return { ok: true, name: trimmed };
}

export function validateAffiliationEntryName(
  name: string,
  options?: { allowEmpty?: boolean },
): { ok: true; name: string } | { ok: false; reason: 'empty' | 'tooLong' } {
  const trimmed = normalizeAffiliationName(name);
  if (!trimmed) {
    return options?.allowEmpty
      ? { ok: true, name: '' }
      : { ok: false, reason: 'empty' };
  }
  return validateCustomAffiliationName(trimmed);
}
