/**
 * Searchable multi-select languages (CRJ + Edit Profile).
 * Shows all selected chips; no +N collapse.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  buildLanguageSearchEntries,
  canAddLanguageCode,
  MAX_PROFILE_LANGUAGE_CODES,
  normalizeLanguageCode,
  searchLanguageEntries,
  type LanguageSearchEntry,
} from '../../profileContext/languageCatalog';

type Props = {
  label: string;
  searchPlaceholder: string;
  emptyLabel: string;
  limitMessage: string;
  selectedCodes: string[];
  locale: string;
  editable?: boolean;
  max?: number;
  onChange: (codes: string[]) => void;
};

const BLUR_HIDE_MS = 180;

export function LanguageMultiSelectField({
  label,
  searchPlaceholder,
  emptyLabel,
  limitMessage,
  selectedCodes,
  locale,
  editable = true,
  max = MAX_PROFILE_LANGUAGE_CODES,
  onChange,
}: Props) {
  const { palette } = useAppTheme();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [limitHint, setLimitHint] = useState(false);
  const blurHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurHideTimer.current) clearTimeout(blurHideTimer.current);
    };
  }, []);

  const catalog = useMemo(
    () => buildLanguageSearchEntries(locale),
    [locale],
  );

  const selectedSet = useMemo(
    () => new Set(selectedCodes),
    [selectedCodes],
  );

  const selectedEntries = useMemo(() => {
    return selectedCodes
      .map((code) => catalog.find((e) => e.code === code))
      .filter((e): e is LanguageSearchEntry => !!e);
  }, [catalog, selectedCodes]);

  const results = useMemo(
    () => searchLanguageEntries(catalog, query, selectedSet).slice(0, 40),
    [catalog, query, selectedSet],
  );

  const atLimit = selectedCodes.length >= max;
  const showResults = focused && query.trim().length > 0;

  const clearBlurHideTimer = () => {
    if (blurHideTimer.current) {
      clearTimeout(blurHideTimer.current);
      blurHideTimer.current = null;
    }
  };

  const handleAdd = (entry: LanguageSearchEntry) => {
    selectingRef.current = true;
    clearBlurHideTimer();
    if (!canAddLanguageCode(selectedCodes, entry.code, max)) {
      setLimitHint(true);
      selectingRef.current = false;
      return;
    }
    const code = normalizeLanguageCode(entry.code);
    if (!code) {
      selectingRef.current = false;
      return;
    }
    setLimitHint(false);
    onChange([...selectedCodes, code]);
    setQuery('');
    selectingRef.current = false;
  };

  const handleRemove = (code: string) => {
    onChange(selectedCodes.filter((c) => c !== code));
    setLimitHint(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.textSecondary }]}>
        {label}
      </Text>

      {selectedEntries.length > 0 ? (
        <View style={styles.chips}>
          {selectedEntries.map((entry) => (
            <View
              key={entry.code}
              style={[
                styles.chip,
                {
                  backgroundColor: palette.chipBg,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text
                style={[styles.chipText, { color: palette.textPrimary }]}
                numberOfLines={1}
              >
                {entry.label}
              </Text>
              {editable ? (
                <Pressable
                  onPress={() => handleRemove(entry.code)}
                  hitSlop={6}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="close"
                    size={14}
                    color={palette.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {editable && !atLimit ? (
        <>
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setLimitHint(false);
            }}
            placeholder={searchPlaceholder}
            placeholderTextColor={palette.textMuted}
            onFocus={() => {
              clearBlurHideTimer();
              setFocused(true);
            }}
            onBlur={() => {
              blurHideTimer.current = setTimeout(() => {
                if (!selectingRef.current) setFocused(false);
              }, BLUR_HIDE_MS);
            }}
            style={[
              styles.input,
              {
                color: palette.textPrimary,
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {showResults ? (
            <View
              style={[
                styles.results,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={styles.resultsScroll}
              >
                {results.length === 0 ? (
                  <Text style={[styles.empty, { color: palette.textMuted }]}>
                    {emptyLabel}
                  </Text>
                ) : (
                  results.map((entry) => (
                    <Pressable
                      key={entry.code}
                      onPress={() => handleAdd(entry)}
                      style={styles.resultRow}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.resultLabel,
                          { color: palette.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : null}

      {limitHint || (editable && atLimit) ? (
        <Text style={[styles.hint, { color: palette.textMuted }]}>
          {limitMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
  },
  results: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    maxHeight: 220,
    overflow: 'hidden',
  },
  resultsScroll: {
    maxHeight: 220,
  },
  resultRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultLabel: {
    fontSize: fontSize.md,
  },
  empty: {
    padding: spacing.md,
    fontSize: fontSize.sm,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
  },
});
