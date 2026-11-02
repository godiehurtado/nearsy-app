/**
 * Alignment user-facing presentation helpers (M4A).
 * Tier / unavailable labels come from i18n — never from wire reason codes.
 */
import type { TFunction } from 'i18next';

import type {
  Alignment,
  AlignmentTier,
  AlignmentUnavailablePresentation,
} from './discoveryCompatibility';

/** Visible Nearby/Discovery surfaces show percent only — never tier copy. */
export function shouldShowNearbyTierBadge(
  _tier: AlignmentTier | undefined,
): boolean {
  return false;
}

export function alignmentTierLabel(
  t: TFunction,
  tier: AlignmentTier,
): string {
  return t(`alignment.tiers.${tier}`);
}

export function alignmentUnavailableLabel(
  t: TFunction,
  presentation: AlignmentUnavailablePresentation = 'unavailable',
): string {
  switch (presentation) {
    case 'insufficient':
      return t('alignment.insufficient');
    case 'processing':
      return t('alignment.processing');
    case 'unavailable':
    default:
      return t('alignment.unavailable');
  }
}

export function alignmentTitleLabel(t: TFunction): string {
  return t('alignment.title');
}

export function formatAlignmentPercent(score: number): string {
  return `${score}%`;
}

export function alignmentAccessibilityLabel(
  t: TFunction,
  alignment: Extract<Alignment, { available: true }>,
): string {
  return t('alignment.a11yScoreOnly', { score: alignment.score });
}
