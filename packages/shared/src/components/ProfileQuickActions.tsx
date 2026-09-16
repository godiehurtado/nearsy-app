import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  PixelRatio,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/radius';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { cardShadow } from '../theme/shadows';
import { shouldUseSingleColumnQuickActions } from './profile/profileQuickActionsLayout';

type QuickActionId = 'interests' | 'affiliations' | 'social' | 'gallery';

type ActionConfig = {
  id: QuickActionId;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onPress: () => void;
};

type Props = {
  sectionTitle: string;
  actions: ActionConfig[];
};

export default function ProfileQuickActions({
  sectionTitle,
  actions,
}: Props) {
  const { palette } = useAppTheme();
  const { width } = useWindowDimensions();
  const singleColumn = shouldUseSingleColumnQuickActions(
    width,
    PixelRatio.getFontScale(),
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        {sectionTitle}
      </Text>
      <View style={[styles.grid, singleColumn && styles.gridSingle]}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            accessibilityHint={action.subtitle}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.card,
              singleColumn ? styles.cardSingle : styles.cardHalf,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
              cardShadow,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: palette.chipBg },
              ]}
            >
              <Ionicons name={action.icon} size={20} color={palette.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
                {action.title}
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: palette.textSecondary }]}
              >
                {action.subtitle}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette.textMuted}
              style={styles.chevron}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    marginHorizontal: screenPadding.horizontal,
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    paddingHorizontal: spacing.xxs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridSingle: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 72,
  },
  cardHalf: {
    width: '48%',
    flexGrow: 1,
  },
  cardSingle: {
    width: '100%',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  chevron: {
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  cardSubtitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
