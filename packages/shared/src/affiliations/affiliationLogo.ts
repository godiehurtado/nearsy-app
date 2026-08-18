import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog';
import { getOnboardingAffiliationCategory } from './onboardingAffiliationCatalog';

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
): { icon: string; color: string } {
  const cat = getOnboardingAffiliationCategory(categoryId);
  return { icon: cat.icon, color: cat.iconColor };
}

export type AffiliationLogoPresentation = {
  kind: 'remote' | 'initials' | 'category';
  logoUrl?: string;
  initials?: string;
  avatarColor?: string;
  icon?: string;
  iconColor?: string;
};

export function resolveAffiliationLogoPresentation(input: {
  name: string;
  categoryId: OnboardingAffiliationCategoryId;
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
  const { icon, color } = affiliationCategoryIcon(input.categoryId);
  return { kind: 'category', icon, iconColor: color };
}
