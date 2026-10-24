import { StyleSheet } from 'react-native';

import { radius } from '../../theme/radius.ts';
import { spacing } from '../../theme/spacing.ts';
import { fontSize, fontWeight } from '../../theme/typography.ts';

/** Extra hit area around the compact pill so it stays near 44pt without growing visually. */
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 112,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
