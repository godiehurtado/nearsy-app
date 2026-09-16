import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { spacing } from '../../theme/spacing.ts';
import { InterestGroupPill } from './InterestGroupPill.tsx';
import type {
  OnboardingInterestCategoryId,
  OnboardingInterestGroup,
} from '../../interests/onboardingInterestCatalog.ts';

type ChipRenderArgs = {
  id: string;
  name: string;
  nameKey: string;
  icon: string;
  iconColor: string;
  isOther?: boolean;
  groupId: string;
};

type Props = {
  categoryId: OnboardingInterestCategoryId;
  groups: OnboardingInterestGroup[];
  activeGroupId: string;
  onSelectGroup: (groupId: string) => void;
  groupLabel: (nameKey: string, fallback: string) => string;
  renderChip: (args: ChipRenderArgs) => React.ReactNode;
  composer: React.ReactNode;
};

export function HierarchicalInterestSelector({
  categoryId,
  groups,
  activeGroupId,
  onSelectGroup,
  groupLabel,
  renderChip,
  composer,
}: Props) {
  const { palette } = useAppTheme();
  const activeGroup =
    groups.find((g) => g.id === activeGroupId) ?? groups[0];

  if (!groups.length || !activeGroup) {
    if (__DEV__) {
      console.error(
        `[HierarchicalInterestSelector] No groups to render for ${categoryId}`,
      );
    }
    return null;
  }

  return (
    <View style={styles.root} accessibilityLabel={categoryId}>
      <View style={styles.pillWrap}>
        {groups.map((g) => (
          <InterestGroupPill
            key={g.id}
            label={groupLabel(g.nameKey, g.name)}
            active={g.id === activeGroup.id}
            onPress={() => onSelectGroup(g.id)}
          />
        ))}
      </View>

      <View
        style={[styles.divider, { backgroundColor: palette.border }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      <View
        style={[
          styles.level2Panel,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.chipWrap}>
          {activeGroup.items.map((it) =>
            renderChip({
              id: it.id,
              name: it.name,
              nameKey: it.nameKey,
              icon: it.icon,
              iconColor: it.iconColor,
              isOther: it.isOther,
              groupId: activeGroup.id,
            }),
          )}
        </View>
        {composer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.xs,
  },
  level2Panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
});
