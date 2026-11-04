import { StyleSheet } from 'react-native';

import { radius } from '../../theme/radius.ts';
import { spacing } from '../../theme/spacing.ts';
import { fontSize, fontWeight } from '../../theme/typography.ts';

/** Extra touch margin around the pill. */
export const SOCIAL_ACTION_HIT_SLOP = {
  top: 10,
  bottom: 10,
  left: 8,
  right: 8,
} as const;

export const socialActionButtonStyles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minWidth: 112,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
});
