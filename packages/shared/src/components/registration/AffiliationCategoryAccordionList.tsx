/**
 * Affiliation categories as initially closed accordions (Android Own Profile
 * structure, iOS chrome). Selected rows live in parent state so they survive
 * collapse. Panel chrome is hidden; the header is the only title.
 */
import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { OnboardingAffiliationCategoryPanel } from './OnboardingAffiliationCategoryPanel';
import {
  getOnboardingAffiliationCategory,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from '../../affiliations/onboardingAffiliationCatalog';
import {
  IDLE_AFFILIATION_SEARCH_UI,
  type AffiliationSearchUiSnapshot,
} from '../../affiliations/affiliationSearchInteraction';
import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

type Props = {
  categoryIds: readonly OnboardingAffiliationCategoryId[];
  selected: OnboardingSelectedAffiliation[];
  onChangeSelected: (next: OnboardingSelectedAffiliation[]) => void;
  expandedId: OnboardingAffiliationCategoryId | null;
  onExpandedIdChange: (next: OnboardingAffiliationCategoryId | null) => void;
  onSearchUiChange: (
    categoryId: OnboardingAffiliationCategoryId,
    ui: AffiliationSearchUiSnapshot,
  ) => void;
  getAddRef: (
    categoryId: OnboardingAffiliationCategoryId,
  ) => React.MutableRefObject<(() => void) | null>;
  contentScrollRef: React.RefObject<ScrollView | null>;
  headerHeightRef?: React.MutableRefObject<number>;
  removeAffiliationAccessibilityLabel?: (name: string) => string;
};

export function AffiliationCategoryAccordionList({
  categoryIds,
  selected,
  onChangeSelected,
  expandedId,
  onExpandedIdChange,
  onSearchUiChange,
  getAddRef,
  contentScrollRef,
  headerHeightRef,
  removeAffiliationAccessibilityLabel,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const categoryLocalYRef = useRef(
    {} as Partial<Record<OnboardingAffiliationCategoryId, number>>,
  );
  const scrollAnchorByCategoryRef = useRef(
    {} as Partial<
      Record<OnboardingAffiliationCategoryId, React.MutableRefObject<number>>
    >,
  );

  const getScrollAnchorRef = (
    categoryId: OnboardingAffiliationCategoryId,
  ): React.MutableRefObject<number> => {
    const existing = scrollAnchorByCategoryRef.current[categoryId];
    if (existing) return existing;
    const created: React.MutableRefObject<number> = {
      get current() {
        return (
          (headerHeightRef?.current ?? 0) +
          (categoryLocalYRef.current[categoryId] ?? 0)
        );
      },
      set current(_value: number) {
        // Layout writes live in categoryLocalYRef / headerHeightRef.
      },
    };
    scrollAnchorByCategoryRef.current[categoryId] = created;
    return created;
  };

  const toggle = (categoryId: OnboardingAffiliationCategoryId) => {
    if (expandedId === categoryId) {
      onSearchUiChange(categoryId, IDLE_AFFILIATION_SEARCH_UI);
      onExpandedIdChange(null);
      return;
    }
    if (expandedId) {
      onSearchUiChange(expandedId, IDLE_AFFILIATION_SEARCH_UI);
    }
    onExpandedIdChange(categoryId);
  };

  return (
    <View style={styles.list}>
      {categoryIds.map((categoryId) => {
        const category = getOnboardingAffiliationCategory(categoryId);
        const open = expandedId === categoryId;
        const count = selected.filter((row) => row.categoryId === categoryId)
          .length;
        const title = t(
          `onboarding.profileCompletion.affiliations.categories.${category.nameKey}` as any,
          { defaultValue: category.name },
        );
        const summary =
          count > 0
            ? t('onboarding.profileCompletion.affiliations.addedCount' as any, {
                count,
              })
            : t(
                `onboarding.profileCompletion.affiliations.subtitles.${category.subtitleKey}` as any,
                { defaultValue: category.subtitle },
              );

        return (
          <View
            key={categoryId}
            style={[
              styles.card,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            onLayout={(e) => {
              categoryLocalYRef.current[categoryId] = e.nativeEvent.layout.y;
            }}
          >
            <Pressable
              onPress={() => toggle(categoryId)}
              style={({ pressed }) => [
                styles.header,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${title}. ${summary}`}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${category.iconColor}22` },
                ]}
              >
                <Ionicons
                  name={category.icon as any}
                  size={18}
                  color={category.iconColor}
                />
              </View>
              <View style={styles.headerText}>
                <Text
                  style={[styles.title, { color: palette.textPrimary }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Text
                  style={[styles.summary, { color: palette.textSecondary }]}
                  numberOfLines={2}
                >
                  {summary}
                </Text>
              </View>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={palette.textSecondary}
              />
            </Pressable>

            {open ? (
              <View style={styles.panelWrap}>
                <OnboardingAffiliationCategoryPanel
                  categoryId={categoryId}
                  selected={selected}
                  onChangeSelected={onChangeSelected}
                  embeddedInAccordion
                  onSearchUiChange={(ui) => onSearchUiChange(categoryId, ui)}
                  searchAddRef={getAddRef(categoryId)}
                  contentScrollRef={contentScrollRef}
                  scrollAnchorYRef={getScrollAnchorRef(categoryId)}
                  removeAffiliationAccessibilityLabel={
                    removeAffiliationAccessibilityLabel
                  }
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    minHeight: 56,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  summary: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  panelWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  pressed: {
    opacity: 0.88,
  },
});
