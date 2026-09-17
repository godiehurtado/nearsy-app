/**
 * Alignment user-facing presentation helpers (M4A).
 * Tier labels come from i18n — never from wire reason codes.
 */
import type { TFunction } from 'i18next';

import type {
  Alignment,
  AlignmentTier,
  AlignmentUnavailableState,
  DiscoveryCompatibilityUnavailableReason,
} from './discoveryCompatibility';
import { mapUnavailableReasonToAlignmentState } from './discoveryCompatibility';

export function shouldShowNearbyTierBadge(
  tier: AlignmentTier | undefined,
): tier is 'strong' | 'full' {
  return tier === 'strong' || tier === 'full';
}

export function alignmentTierLabel(
  t: TFunction,
  tier: AlignmentTier,
): string {
  return t(`alignment.tiers.${tier}`);
}

export function alignmentUnavailableLabel(
  t: TFunction,
  state: AlignmentUnavailableState = 'unavailable',
): string {
  switch (state) {
    case 'insufficient':
      return t('alignment.insufficient');
    case 'processing':
      return t('alignment.processing');
    case 'unavailable':
    default:
      return t('alignment.unavailable');
  }
}

/** Resolve presentation copy from optional wire reason (tests / helpers). */
export function alignmentUnavailableLabelForReason(
  t: TFunction,
  reason: DiscoveryCompatibilityUnavailableReason | undefined,
): string {
  return alignmentUnavailableLabel(
    t,
    mapUnavailableReasonToAlignmentState(reason),
  );
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
  const score = alignment.score;
  if (alignment.tier) {
    return t('alignment.a11yWithTier', {
      score,
      tier: alignmentTierLabel(t, alignment.tier),
    });
  }
  return t('alignment.a11yScoreOnly', { score });
}
