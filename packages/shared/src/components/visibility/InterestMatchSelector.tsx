import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { InterestChip } from '../InterestChip';
import { useTranslation } from '../../i18n';
import {
  buildInterestSearchEntries,
  findInterestEntryById,
  searchInterestEntries,
  type InterestSearchEntry,
} from '../../visibility/interestSearchCatalog';
import { MAX_SEARCH_INTEREST_IDS } from '../../visibility/constants';

type Props = {
  officialIds: ReadonlySet<string>;
  selectedIds: string[];
  atLimit: boolean;
  limitMessage: string | null;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onLimitReached: () => void;
};

/** Delay blur so a result tap can fire before results unmount. */
const BLUR_HIDE_MS = 180;

export function InterestMatchSelector({
  officialIds,
  selectedIds,
  atLimit,
  limitMessage,
  onAdd,
  onRemove,
  onLimitReached,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const blurHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurHideTimer.current) clearTimeout(blurHideTimer.current);
    };
  }, []);

  const labels = useMemo(
    () => ({
      category: (nameKey: string, fallback: string) =>
        t(`onboarding.profileCompletion.interests.categories.${nameKey}` as any, {
          defaultValue: fallback,
        }),
      group: (nameKey: string, fallback: string) =>
        t(`onboarding.profileCompletion.interests.groups.${nameKey}` as any, {
          defaultValue: fallback,
        }),
      item: (nameKey: string, fallback: string) =>
        t(`onboarding.profileCompletion.interests.items.${nameKey}` as any, {
          defaultValue: fallback,
        }),
    }),
    [t],
  );

  const catalog = useMemo(
    () => buildInterestSearchEntries(officialIds, labels),
    [officialIds, labels],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedEntries = useMemo(
    () =>
      selectedIds
        .map((id) => findInterestEntryById(catalog, id))
        .filter((entry): entry is InterestSearchEntry => !!entry),
    [catalog, selectedIds],
  );

  const groupedResults = useMemo(
    () => searchInterestEntries(catalog, query, selectedSet),
    [catalog, query, selectedSet],
  );

  const showResults = focused && query.trim().length > 0;

  const clearBlurHideTimer = () => {
    if (blurHideTimer.current) {
      clearTimeout(blurHideTimer.current);
      blurHideTimer.current = null;
    }
  };

  const handleSelect = (id: string) => {
    selectingRef.current = true;
    clearBlurHideTimer();
    setFocused(true);

    if (selectedSet.has(id)) {
      selectingRef.current = false;
      return;
    }
    if (atLimit) {
      onLimitReached();
      selectingRef.current = false;
      return;
    }

    onAdd(id);
    setQuery('');
    setFocused(false);
    Keyboard.dismiss();
    selectingRef.current = false;
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionEyebrow, { color: palette.textMuted }]}>
          {t('home.discovery.interestsTitle')}
        </Text>
        <Text style={[styles.counter, { color: palette.textMuted }]}>
          {t('home.discovery.interestsCounter', {
            count: selectedIds.length,
            max: MAX_SEARCH_INTEREST_IDS,
          })}
        </Text>
      </View>
      <Text style={[styles.support, { color: palette.textMuted }]}>
        {t('home.discovery.interestsHint')}
      </Text>

      {selectedEntries.length === 0 ? (
        <Text style={[styles.empty, { color: palette.textSecondary }]}>
          {t('home.discovery.anyInterest')}
        </Text>
      ) : (
        <View style={styles.chips}>
          {selectedEntries.map((entry) => (
            <InterestChip
              key={entry.id}
              name={entry.itemLabel}
              icon={entry.icon}
              iconColor={entry.iconColor}
              selected
              onPress={() => onRemove(entry.id)}
            />
          ))}
        </View>
      )}

      {limitMessage ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.limitMessage, { color: palette.danger }]}
        >
          {limitMessage}
        </Text>
      ) : null}

      <View
        style={[
          styles.searchField,
          {
            backgroundColor: palette.surface,
            borderColor: focused ? palette.primary : palette.border,
          },
        ]}
      >
        <Ionicons name="search-outline" size={16} color={palette.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            clearBlurHideTimer();
            setFocused(true);
          }}
          onBlur={() => {
            if (selectingRef.current) return;
            clearBlurHideTimer();
            blurHideTimer.current = setTimeout(() => {
              if (!selectingRef.current) setFocused(false);
            }, BLUR_HIDE_MS);
          }}
          placeholder={t('home.discovery.interestsSearchPlaceholder')}
          placeholderTextColor={palette.placeholder}
          style={[styles.searchInput, { color: palette.textPrimary }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('home.discovery.interestsSearchPlaceholder')}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.discovery.clearSearch')}
            onPress={() => setQuery('')}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {showResults ? (
        <View
          style={[
            styles.results,
            { borderColor: palette.border, backgroundColor: palette.surface },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            style={styles.resultsScroll}
          >
            {groupedResults.length === 0 ? (
              <Text style={[styles.noResults, { color: palette.textMuted }]}>
                {t('home.discovery.interestsNoResults')}
              </Text>
            ) : (
              groupedResults.map((group) => (
                <View key={group.categoryId} style={styles.resultGroup}>
                  <Text
                    style={[styles.resultCategory, { color: palette.textMuted }]}
                  >
                    {group.categoryLabel}
                  </Text>
                  {group.items.map((entry) => (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityLabel={entry.itemLabel}
                      onPressIn={() => {
                        selectingRef.current = true;
                        clearBlurHideTimer();
                      }}
                      onPress={() => handleSelect(entry.id)}
                      style={({ pressed }) => [
                        styles.resultRow,
                        pressed ? { backgroundColor: palette.chipBg } : undefined,
                      ]}
                    >
                      {/* pointerEvents none: avoid nested Pressable swallowing the tap */}
                      <View pointerEvents="none">
                        <InterestChip
                          name={entry.itemLabel}
                          icon={entry.icon}
                          iconColor={entry.iconColor}
                          selected={false}
                        />
                      </View>
                      {entry.groupLabel ? (
                        <Text
                          style={[
                            styles.resultMeta,
                            { color: palette.textMuted },
                          ]}
                          pointerEvents="none"
                        >
                          {entry.groupLabel}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  sectionEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  counter: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  support: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginTop: spacing.xxs,
  },
  empty: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  limitMessage: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  searchField: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  results: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    maxHeight: 220,
    overflow: 'hidden',
  },
  resultsScroll: {
    padding: spacing.sm,
  },
  noResults: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  resultGroup: {
    marginBottom: spacing.md,
  },
  resultCategory: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  resultRow: {
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  resultMeta: {
    fontSize: fontSize.xs,
    marginLeft: spacing.xxs,
  },
});
