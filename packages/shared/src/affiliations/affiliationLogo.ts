import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog';
import {
  getOnboardingAffiliationCategory,
  listOnboardingAffiliationCategoryIds,
} from './onboardingAffiliationCatalog';

/** CRJ selected-affiliation logo tile (OnboardingAffiliationCategoryPanel). */
export const AFFILIATION_SELECTED_LOGO_SIZE = 64;
export const AFFILIATION_SELECTED_LOGO_RADIUS = 18;

/** CRJ search-result / upload thumb. */
export const AFFILIATION_RESULT_LOGO_SIZE = 40;
export const AFFILIATION_RESULT_LOGO_RADIUS = 12;

/** Claude `LOGO_PALETTE` — deterministic monogram tints. */
export const AFFILIATION_LOGO_PALETTE = [
  '#2563EB',
  '#DB2777',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#0891B2',
  '#DC2626',
  '#4B5563',
] as const;

const KNOWN_CATEGORY_IDS = new Set<string>(listOnboardingAffiliationCategoryIds());

/** Claude `logoTint` hash. */
export function deterministicAffiliationAvatarColor(name: string): string {
  let n = 0;
  const text = name || '';
  for (let i = 0; i < text.length; i += 1) {
    n = (n * 31 + text.charCodeAt(i)) % 997;
  }
  return AFFILIATION_LOGO_PALETTE[n % AFFILIATION_LOGO_PALETTE.length]!;
}

export function affiliationInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function affiliationCategoryIcon(
  categoryId: OnboardingAffiliationCategoryId,
): { icon: string; color: string; emoji: string } {
  const cat = getOnboardingAffiliationCategory(categoryId);
  return { icon: cat.icon, color: cat.iconColor, emoji: cat.emoji };
}

export function asOnboardingAffiliationCategoryId(
  value: string | null | undefined,
): OnboardingAffiliationCategoryId | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!KNOWN_CATEGORY_IDS.has(trimmed)) return null;
  return trimmed as OnboardingAffiliationCategoryId;
}

export type AffiliationLogoPresentation = {
  kind: 'remote' | 'initials' | 'category';
  logoUrl?: string;
  initials?: string;
  avatarColor?: string;
  icon?: string;
  iconColor?: string;
  emoji?: string;
};

/**
 * Pure logo presentation for CRJ + Discovery.
 * Prefer remote HTTPS → monogram initials → category emoji (when known).
 */
export function resolveAffiliationLogoPresentation(input: {
  name: string;
  categoryId?: OnboardingAffiliationCategoryId | null;
  logoUrl?: string | null;
}): AffiliationLogoPresentation {
  if (input.logoUrl?.trim()) {
    return { kind: 'remote', logoUrl: input.logoUrl.trim() };
  }
  const initials = affiliationInitials(input.name);
  if (initials && initials !== '?') {
    return {
      kind: 'initials',
      initials,
      avatarColor: deterministicAffiliationAvatarColor(input.name),
    };
  }
  if (input.categoryId) {
    const { icon, color, emoji } = affiliationCategoryIcon(input.categoryId);
    return { kind: 'category', icon, iconColor: color, emoji };
  }
  return {
    kind: 'initials',
    initials: '?',
    avatarColor: deterministicAffiliationAvatarColor(input.name || '?'),
  };
}
