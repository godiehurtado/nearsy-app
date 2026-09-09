import type { AffiliationCategory } from '../types/profile.ts';

/** CRJ-I6 affiliation category ids — seven onboarding screens. */
export type OnboardingAffiliationCategoryId =
  | 'education'
  | 'professional'
  | 'community'
  | 'sports_clubs'
  | 'faith'
  | 'political_civic'
  | 'identity_lifestyle';

export type OnboardingAffiliationTopic = {
  id: string;
  label: string;
  emoji: string;
};

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
      id: 'identity_lifestyle',
      nameKey: 'identity_lifestyle',
      name: 'Identity & Lifestyle',
      subtitleKey: 'identity_lifestyle',
      subtitle: 'What shapes who you are.',
      emoji: '🪪',
      icon: 'sparkles-outline',
      iconColor: '#CA8A04',
      topics: [
        topic('Zodiac sign', '♈'),
        topic('Languages', '🗣️'),
        topic('Cultural background', '🌍'),
        topic('Nationality', '🛂'),
        topic('Hometown', '🏠'),
        topic('Parent', '👶'),
        topic('Pet parent', '🐾'),
        topic('Veteran', '🎖️'),
        topic('Personality type', '🧠'),
      ],
    },
  ];

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
  identity_lifestyle: 'hobbiesClubs',
};

export function listOnboardingAffiliationCategoryIds(): OnboardingAffiliationCategoryId[] {
  return ONBOARDING_AFFILIATION_CATEGORIES.map((c) => c.id);
}

export function getOnboardingAffiliationCategory(
  id: OnboardingAffiliationCategoryId,
): OnboardingAffiliationCategory {
  const cat = ONBOARDING_AFFILIATION_CATEGORIES.find((c) => c.id === id);
  if (!cat) throw new Error(`Unknown affiliation category: ${id}`);
  return cat;
}

export function buildCustomAffiliationId(
  categoryId: OnboardingAffiliationCategoryId,
  name: string,
): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `custom_${categoryId}_${slug || 'org'}`;
}

export function normalizeAffiliationName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function affiliationIdentityKey(item: Pick<
  OnboardingSelectedAffiliation,
  'name' | 'providerId' | 'source'
>): string {
  if (item.source === 'provider' && item.providerId) {
    return `provider:${item.providerId}`;
  }
  return `name:${normalizeAffiliationName(item.name).toLowerCase()}`;
}

export function isDuplicateAffiliation(
  list: OnboardingSelectedAffiliation[],
  candidate: Pick<OnboardingSelectedAffiliation, 'name' | 'providerId' | 'source'>,
): boolean {
  const key = affiliationIdentityKey(candidate);
  const normalizedName = normalizeAffiliationName(candidate.name).toLowerCase();
  return list.some((entry) => {
    if (affiliationIdentityKey(entry) === key) return true;
    return normalizeAffiliationName(entry.name).toLowerCase() === normalizedName;
  });
}

export function validateCustomAffiliationName(name: string): {
  ok: true;
  name: string;
} | { ok: false; reason: 'empty' | 'tooLong' } {
  const trimmed = normalizeAffiliationName(name);
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > 80) return { ok: false, reason: 'tooLong' };
  return { ok: true, name: trimmed };
}
