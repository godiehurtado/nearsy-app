/**
 * Multi-select languages field with searchable catalog and wrapped chips.
 *
 * Keyboard (QA 2.1.0): with a parent scrollRef, focusing the search, the
 * keyboard appearing and each new query scroll the field to the top of the
 * visible area, so the input and its results stay above the keyboard. Results
 * scroll inside a capped list; the form itself stays scrollable.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { InterestChip } from '../InterestChip';
import { useTranslation } from '../../i18n';
import {
  filterLanguages,
  getLanguageDisplayName,
  MAX_PROFILE_LANGUAGES,
} from '../../profile/languageCatalog';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';

export type LanguageMultiSelectFieldProps = {
  value: string[];
  onChange: (codes: string[]) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  maxLanguages?: number;
  disabled?: boolean;
  /** The form's ScrollView, so the field can bring itself into view. */
  scrollRef?: React.RefObject<ScrollView | null>;
};

/** Gap kept above the field when it is scrolled into view. */
export const LANGUAGE_FIELD_SCROLL_MARGIN = 12;
/** Results list height cap (about six rows); it scrolls inside. */
export const LANGUAGE_RESULTS_MAX_HEIGHT = 264;

export function LanguageMultiSelectField({
  value,
  onChange,
  label,
  placeholder,
  searchPlaceholder,
  maxLanguages = MAX_PROFILE_LANGUAGES,
  disabled = false,
  scrollRef,
}: LanguageMultiSelectFieldProps) {
  const { palette } = useAppTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.language || 'en';

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<View | null>(null);

  const scrollIntoView = useCallback(() => {
    const scroll = scrollRef?.current;
    const wrap = wrapRef.current;
    if (!scroll || !wrap) return;
    const inner = (scroll as any).getInnerViewRef?.() ?? null;
    if (!inner) return;
    // Two frames: let the keyboard inset and the results layout settle first.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          wrap.measureLayout(
            inner,
            (_x, y) =>
              scroll.scrollTo({
                y: Math.max(0, y - LANGUAGE_FIELD_SCROLL_MARGIN),
                animated: true,
              }),
            () => {},
          );
        } catch {
          // Measuring is best effort; the form stays scrollable by hand.
        }
      }),
    );
  }, [scrollRef]);

  useEffect(() => {
    if (!focused) return;
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, scrollIntoView);
    return () => sub.remove();
  }, [focused, scrollIntoView]);

  const hasQuery = query.trim().length > 0;
  useEffect(() => {
    if (focused && hasQuery) scrollIntoView();
  }, [focused, hasQuery, scrollIntoView]);

  const selected = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : []),
    [value],
  );

  const atMax = selected.length >= maxLanguages;

  const selectedChips = useMemo(
    () =>
      selected.map((code) => ({
        code,
        name: getLanguageDisplayName(code, locale),
      })),
    [locale, selected],
  );

  const results = useMemo(() => {
    const rows = filterLanguages(query, locale, selected);
    return rows.slice(0, 40);
  }, [locale, query, selected]);

  const removeLanguage = useCallback(
    (code: string) => {
      if (disabled) return;
      onChange(selected.filter((c) => c !== code));
    },
    [disabled, onChange, selected],
  );

  const addLanguage = useCallback(
    (code: string) => {
      if (disabled || atMax) return;
      if (selected.includes(code)) return;
      onChange([...selected, code]);
      setQuery('');
    },
    [atMax, disabled, onChange, selected],
  );

  return (
    <View ref={wrapRef} style={styles.wrap} collapsable={false}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>

      {selectedChips.length > 0 ? (
        <View style={styles.chipsRow}>
          {selectedChips.map((chip) => (
            <InterestChip
              key={chip.code}
              name={chip.name}
              selected
              accessibilityLabel={t('profile.context.removeLanguageA11y', {
                language: chip.name,
              })}
              onPress={disabled ? undefined : () => removeLanguage(chip.code)}
            />
          ))}
        </View>
      ) : (
        <Text
          style={[styles.emptyHint, { color: palette.textSecondary }]}
          numberOfLines={2}
        >
          {placeholder}
        </Text>
      )}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={palette.placeholder}
        editable={!disabled}
        autoCorrect={false}
        autoCapitalize="none"
        onFocus={() => {
          setFocused(true);
          scrollIntoView();
        }}
        onBlur={() => setFocused(false)}
        style={[
          styles.searchInput,
          {
            color: palette.textPrimary,
            borderColor: focused ? palette.primary : palette.borderStrong,
            backgroundColor: palette.surface,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
        accessibilityLabel={searchPlaceholder}
      />

      {atMax ? (
        <Text style={[styles.maxHint, { color: palette.textMuted }]}>
          {t('profile.context.maxLanguages', { count: maxLanguages })}
        </Text>
      ) : null}

      {!atMax && query.trim().length > 0 ? (
        <View
          style={[
            styles.resultsCard,
            {
              backgroundColor: palette.panel,
              borderColor: palette.border,
            },
          ]}
        >
          {results.length === 0 ? (
            <Text style={[styles.noResults, { color: palette.textMuted }]}>
              {t('profile.context.noLanguageResults')}
            </Text>
          ) : (
            <ScrollView
              style={styles.resultsList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
            {results.map((item) => (
              <Pressable
                key={item.code}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                disabled={disabled}
                onPress={() => addLanguage(item.code)}
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && { backgroundColor: palette.chipBg },
                ]}
              >
                <Text
                  style={[styles.optionName, { color: palette.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: spacing.sm },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginBottom: 1,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  searchInput: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    fontSize: fontSize.md,
  },
  maxHint: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  resultsCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  resultsList: {
    maxHeight: LANGUAGE_RESULTS_MAX_HEIGHT,
  },
  optionRow: {
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  optionName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  noResults: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
  },
});
